import { h, mount, svg, confirmDialog, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { deepEqual } from '../lib/diff.js';
import { dayKey, fmtRelative, shortId } from '../lib/format.js';
import { DAYS, DAY_KEYS, addDays, isMonday, shortDate, thisMonday, weekLabel } from '../availability.js';
import {
  AREAS,
  HISTORY_WEEKS,
  MAX_ENTRIES,
  MAX_PLEDGE,
  NOTE_MAX,
  STEP,
  areaLabel,
  areaTotals,
  clockText,
  dayTotals,
  durationText,
  mergeTimesheet,
  minutesOf,
  overlap,
  parseClock,
  pledgeFor,
  sanitizeTimesheet,
  timesheetProblem,
  weekSeries,
} from '../timesheet.js';
import { canWrite, createItem, memberName, on, saveSnapshot, state, statusError, syncItems, timesheetsOf } from '../store.js';
import { replaceCurrent, setLeaveGuard } from '../router.js';
import { avatar, errorBox, tabs } from './components.js';

const TITLE = 'Ore lavorate';
const PAST_WEEKS = 52;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const MAX_ATTEMPTS = 4;
const FOCUS_FALLBACK = { 'week-prev': ['week-next', 'week-title'], 'week-next': ['week-prev', 'week-title'], save: ['pledge', 'week-title'] };
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const dayName = (day) => DAYS.find(([key]) => key === day)[1];
const hoursValue = (minutes) => (Number.isInteger(minutes) ? String(minutes / 60).replace('.', ',') : '');
const srOnly = (text) => h('span', { class: 'sr-only' }, text);

// Le schede di una persona, già pulite, per lunedì della settimana.
function weeksOf(userId) {
  const weeks = new Map();
  for (const item of timesheetsOf(userId)) {
    const data = sanitizeTimesheet(item.data);
    if (data.week && !weeks.has(data.week)) weeks.set(data.week, { item, data });
  }
  return weeks;
}

const dataMap = (weeks) => new Map([...weeks].map(([week, entry]) => [week, entry.data]));
const team = () => state.members.filter((member) => member.role === 'admin' || member.role === 'member');
const personName = (member) => member.display_name || memberName(member.user_id);

// Le barre accompagnano sempre un testo con gli stessi numeri: per i lettori di schermo non servono.
function bar(value, max) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return h('span', { class: 'ts-bar', 'aria-hidden': 'true' }, h('span', { class: 'ts-bar-fill', style: { '--value': `${percent}%` } }));
}

// Dodici settimane in colonne, con un segno per le ore dichiarate.
function historyChart(series, name) {
  const max = Math.max(60, ...series.map((w) => Math.max(w.minutes, w.pledge || 0)));
  const width = 240;
  const base = 60;
  const height = 52;
  const slot = width / series.length;
  const marks = series.flatMap((w, i) => {
    const x = i * slot + 3;
    const barW = slot - 6;
    const barH = (w.minutes / max) * height;
    const tip = `${weekLabel(w.week)}: ${durationText(w.minutes)}${w.pledge !== null ? ` su ${durationText(w.pledge)}` : ''}`;
    return [
      barH ? svg('rect', { x, y: base - barH, width: barW, height: barH, rx: 2, class: i === series.length - 1 ? 'ts-col ts-col-now' : 'ts-col' }, svg('title', {}, tip)) : null,
      w.pledge ? svg('line', { x1: x - 1, x2: x + barW + 1, y1: base - (w.pledge / max) * height, y2: base - (w.pledge / max) * height, class: 'ts-pledge-mark' }, svg('title', {}, tip)) : null,
    ].filter(Boolean);
  });
  const label = `${name}, dalla settimana più vecchia: ${series
    .map((w) => `${shortDate(w.week)} ${durationText(w.minutes)}${w.pledge ? ` su ${durationText(w.pledge)}` : ''}`)
    .join(', ')}`;
  return h(
    'div',
    { class: 'ts-history-box' },
    svg('svg', { viewBox: `0 0 ${width} ${base + 2}`, role: 'img', 'aria-label': label, class: 'ts-history' }, svg('line', { x1: 0, x2: width, y1: base, y2: base, class: 'ts-baseline' }), ...marks),
    h('div', { class: 'ts-history-axis small muted', 'aria-hidden': 'true' }, h('span', null, shortDate(series[0].week)), h('span', null, shortDate(series[series.length - 1].week))),
  );
}

function areaList(rows) {
  if (!rows.length) return h('p', { class: 'muted small' }, 'Nessuna ora segnata.');
  const max = rows[0].minutes;
  return h('ul', { class: 'ts-areas' }, rows.map((row) => h('li', null, h('span', null, row.label), bar(row.minutes, max), h('strong', null, durationText(row.minutes)))));
}

export function timesheetView(outlet, query, chrome) {
  const writable = canWrite();
  const mode = query.get('vista') === 'mie' && writable ? 'mine' : 'team';
  let currentMonday = thisMonday();
  const asked = query.get('settimana');
  let monday = isMonday(asked) && asked <= currentMonday && asked >= addDays(currentMonday, -7 * (PAST_WEEKS - 1)) ? asked : currentMonday;
  let working = null;
  let startItem = null;
  let startData = null;
  let changed = false;
  let saving = false;
  let alive = true;
  let timer = null;
  let problemShown = false;
  let tableScroll = 0;
  let missedTick = false;
  const openDetails = new Set();
  const statusHost = h('span', { class: 'muted small', role: 'status' });
  const problemHost = h('div', { class: 'ts-problem', role: 'alert' });
  const totalHost = h('div', { class: 'ts-total' });
  const saveButton = h(
    'button',
    { type: 'button', class: 'btn btn-primary', disabled: true, dataset: { focus: 'save' } },
    icon('commit', 16),
    h('span', null, 'Salva le mie ore'),
  );

  const weekIndex = () => Math.round((Date.parse(currentMonday) - Date.parse(monday)) / WEEK_MS);
  const mineWeeks = () => weeksOf(state.user?.id);
  const weekPath = () => `/squadra/ore?${mode === 'mine' ? 'vista=mie&' : ''}settimana=${monday}`;

  const baseline = () => mineWeeks().get(monday)?.data || { week: monday, entries: [] };

  // Le ore dichiarate valgono finché non si cambiano: quelle ereditate si mostrano ma non si copiano nella settimana.
  const carriedPledge = () => {
    const weeks = dataMap(mineWeeks());
    weeks.delete(monday);
    return pledgeFor(weeks, monday);
  };
  const effectivePledge = () => working.pledge ?? carriedPledge();

  // La copia di lavoro ricorda da quale versione parte: al salvataggio le righe fatte altrove si uniscono.
  const startWorking = () => {
    startItem = mineWeeks().get(monday)?.item || null;
    startData = structuredClone(baseline());
    working = structuredClone(startData);
  };

  // Le righe a metà (senza orario) contano come modifica, anche se il salvataggio non le accetterebbe.
  const comparable = (data) => ({
    pledge: data.pledge,
    entries: data.entries.map((e) => ({ id: e.id, day: e.day, start: e.start ?? null, end: e.end ?? null, area: e.area, note: (e.note || '').trim() || null })),
  });

  const updateTotals = () => {
    const done = working.entries.filter((e) => Number.isInteger(e.start) && Number.isInteger(e.end) && e.end > e.start);
    const total = minutesOf(done);
    const pledge = effectivePledge();
    const which = weekIndex() === 0 ? 'Questa settimana' : capital(weekLabel(monday));
    mount(
      totalHost,
      h('strong', null, pledge ? `${which}: ${durationText(total)} su ${durationText(pledge)} dichiarate` : `${which}: ${durationText(total)}`),
      pledge ? bar(total, pledge) : null,
    );
    const days = dayTotals(done);
    outlet.querySelectorAll('[data-day-total]').forEach((el) => {
      el.textContent = durationText(days[el.dataset.dayTotal]);
    });
  };

  // Il primo problema da sistemare prima di salvare, con il campo dove andare.
  const problemOf = () => {
    if (working.entries.length > MAX_ENTRIES) return { text: `In una settimana ci stanno al massimo ${MAX_ENTRIES} righe: togline qualcuna.`, focus: 'save' };
    for (const day of DAY_KEYS) {
      const name = capital(dayName(day));
      for (const e of working.entries.filter((row) => row.day === day)) {
        if (!Number.isInteger(e.start) || !Number.isInteger(e.end)) {
          return { text: `${name}: in una riga manca l'ora di inizio o di fine.`, focus: `row-${e.id}-${Number.isInteger(e.start) ? 'end' : 'start'}` };
        }
        if (e.end <= e.start) return { text: `${name}: una riga finisce prima di cominciare. Se passi la mezzanotte, dividila in due righe.`, focus: `row-${e.id}-end` };
      }
    }
    const clean = sanitizeTimesheet(working);
    const text = timesheetProblem(clean);
    return text ? { text, focus: `row-${overlap(clean.entries)?.[1].id}-start` } : null;
  };

  const showProblem = () => {
    const problem = problemOf();
    const text = problem?.text || '';
    if (problemHost.textContent !== text) mount(problemHost, text);
    outlet.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (problem) outlet.querySelector(`[data-focus="${problem.focus}"]`)?.setAttribute('aria-invalid', 'true');
    else problemShown = false;
    return problem;
  };

  const updateDirty = () => {
    changed = !deepEqual(comparable(working), comparable(baseline()));
    saveButton.disabled = saving || !changed;
    setLeaveGuard(changed ? () => confirmDialog('Hai ore non salvate. Uscire comunque?', { title: 'Ore non salvate', okLabel: 'Esci', danger: true }) : null);
    const item = mineWeeks().get(monday)?.item;
    const text = saving ? 'Salvataggio in corso' : changed ? 'Modifiche non salvate' : item ? `Salvato ${fmtRelative(item.updated_at)}` : 'Nessuna ora segnata in questa settimana';
    if (statusHost.textContent !== text) mount(statusHost, text);
    outlet.querySelectorAll('.ts-day input, .ts-day select, .ts-day button, .ts-pledge-input, .av-week button').forEach((el) => {
      el.disabled = saving || el.dataset.edge === 'true';
    });
    if (problemShown) showProblem();
  };

  const onBeforeUnload = (event) => {
    if (!changed) return;
    event.preventDefault();
    event.returnValue = '';
  };

  const goToWeek = async (step) => {
    if (saving) return;
    if (changed && !(await confirmDialog('Hai ore non salvate in questa settimana. Cambiare settimana comunque?', { title: 'Ore non salvate', okLabel: 'Cambia', danger: true }))) return;
    if (!alive) return;
    monday = addDays(monday, step * 7);
    // L'indirizzo segue la settimana: ricaricando si resta qui e la scheda aperta resta la stessa pagina.
    replaceCurrent(weekPath());
    if (mode === 'mine') {
      startWorking();
      problemShown = false;
      mount(problemHost);
    }
    render();
  };

  const weekNav = () => {
    const index = weekIndex();
    const name = index === 0 ? 'Questa settimana' : index === 1 ? 'La settimana scorsa' : `${index} settimane fa`;
    const arrow = (label, focus, edge, step, text) =>
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', disabled: edge || saving, 'aria-label': label, dataset: { focus, edge: String(edge) }, onClick: () => goToWeek(step) }, text);
    return h(
      'div',
      { class: 'av-week' },
      arrow('Settimana precedente', 'week-prev', index >= PAST_WEEKS - 1, -1, '←'),
      h('div', { class: 'av-week-title', 'aria-live': 'polite', tabindex: '-1', dataset: { focus: 'week-title' } }, h('strong', null, name), h('span', { class: 'muted small' }, weekLabel(monday))),
      arrow('Settimana successiva', 'week-next', index <= 0, 1, '→'),
    );
  };

  // Una riga nuova parte dalla fine dell'ultima del giorno; il primo giorno vuoto copia l'orario del giorno prima.
  // Se il giorno ha solo righe a metà, la nuova resta vuota.
  const addRow = (day) => {
    if (saving || working.entries.length >= MAX_ENTRIES) return;
    const dayRows = working.entries.filter((e) => e.day === day);
    const rows = dayRows.filter((e) => Number.isInteger(e.end));
    let row = { start: null, end: null, area: dayRows[dayRows.length - 1]?.area || AREAS[0][0] };
    if (rows.length) {
      const latest = rows.reduce((a, b) => (b.end > a.end ? b : a));
      if (latest.end < 24 * 60) row = { start: latest.end, end: Math.min(24 * 60, latest.end + 60), area: latest.area };
      else row.area = latest.area;
    } else if (!dayRows.length) {
      const before = DAY_KEYS.slice(0, DAY_KEYS.indexOf(day)).reverse();
      const source = before.map((d) => working.entries.filter((e) => e.day === d && Number.isInteger(e.start) && Number.isInteger(e.end))).find((list) => list.length);
      if (source) {
        const first = source.reduce((a, b) => (b.start < a.start ? b : a));
        row = { start: first.start, end: first.end, area: first.area };
      }
    }
    const id = shortId();
    working.entries.push({ id, day, ...row, note: '' });
    updateDirty();
    render(`row-${id}-start`);
  };

  const removeRow = (id) => {
    if (saving) return;
    const index = working.entries.findIndex((e) => e.id === id);
    const day = working.entries[index]?.day;
    working.entries.splice(index, 1);
    updateDirty();
    render(`add-${day}`);
  };

  const rowView = (entry, name, n) => {
    const set = (key, value) => {
      entry[key] = value;
      updateDirty();
      updateTotals();
    };
    // Il valore arrotondato si riscrive solo uscendo dal campo: mentre si scrive i minuti arrivano una cifra alla volta.
    const timeInput = (key, label) =>
      h('input', {
        class: 'input ts-time',
        type: 'time',
        step: String(STEP * 60),
        value: Number.isInteger(entry[key]) ? clockText(entry[key]) : '',
        'aria-label': label,
        dataset: { focus: `row-${entry.id}-${key}` },
        onChange: (event) => set(key, parseClock(event.target.value, { end: key === 'end' })),
        onBlur: (event) => {
          if (Number.isInteger(entry[key])) event.target.value = clockText(entry[key]);
        },
      });
    return h(
      'li',
      { class: 'ts-row', role: 'group', 'aria-label': `${capital(name)}, riga ${n}`, dataset: { id: entry.id } },
      h('span', { class: 'ts-times' }, timeInput('start', 'Inizio'), h('span', { 'aria-hidden': 'true' }, '-'), timeInput('end', 'Fine')),
      h(
        'select',
        { class: 'input ts-area', 'aria-label': 'Area', dataset: { focus: `row-${entry.id}-area` }, onChange: (event) => set('area', event.target.value) },
        AREAS.map(([value, long, short]) => h('option', { value, selected: value === entry.area, title: long }, short)),
      ),
      h('input', {
        class: 'input ts-note',
        type: 'text',
        maxlength: NOTE_MAX,
        value: entry.note || '',
        placeholder: 'Cosa hai fatto (facoltativo)',
        'aria-label': 'Nota',
        dataset: { focus: `row-${entry.id}-note` },
        onInput: (event) => set('note', event.target.value),
      }),
      // Col doppio clic il secondo colpirebbe la riga che sale al suo posto.
      h('button', { type: 'button', class: 'icon-btn ts-remove', 'aria-label': `Togli la riga ${n} di ${name}`, onClick: (event) => event.detail < 2 && removeRow(entry.id) }, icon('close', 16)),
    );
  };

  const mineBody = () => {
    const today = dayKey(new Date());
    const pledgeInput = h('input', {
      class: 'input ts-pledge-input',
      type: 'text',
      inputmode: 'decimal',
      value: hoursValue(effectivePledge()),
      disabled: saving,
      dataset: { focus: 'pledge' },
      onChange: (event) => {
        const raw = String(event.target.value).trim().replace(',', '.');
        const hours = Number(raw);
        // Un testo che non è un numero (8h, 7:30) non cambia niente: il campo torna com'era.
        if (raw === '') delete working.pledge;
        else if (Number.isFinite(hours)) working.pledge = Math.min(MAX_PLEDGE, Math.max(0, Math.round((hours * 60) / STEP) * STEP));
        // Uguale a quelle ereditate e mai scritte in questa settimana: si continua a ereditarle.
        if (working.pledge === carriedPledge() && baseline().pledge === undefined) delete working.pledge;
        event.target.value = hoursValue(effectivePledge());
        updateDirty();
        updateTotals();
      },
    });
    const days = DAYS.map(([day, name], i) => {
      const date = addDays(monday, i);
      const future = date > today;
      const rows = working.entries
        .filter((e) => e.day === day)
        .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
      const titleId = `ts-day-${day}`;
      return h(
        'section',
        { class: ['ts-day', future && 'is-future'], 'aria-labelledby': titleId },
        h(
          'header',
          { class: 'ts-day-head' },
          h('h2', { id: titleId }, `${capital(name)} ${shortDate(date)}`, date === today ? h('span', { class: 'muted small' }, ' · oggi') : null),
          h('span', { class: 'muted small', dataset: { dayTotal: day } }, ''),
        ),
        rows.length ? h('ul', { class: 'ts-rows' }, rows.map((entry, n) => rowView(entry, name, n + 1))) : null,
        future
          ? null
          : h(
              'button',
              { type: 'button', class: 'btn btn-ghost btn-small ts-add', disabled: saving, 'aria-label': `Aggiungi ore a ${name}`, dataset: { focus: `add-${day}` }, onClick: () => addRow(day) },
              icon('plus', 14),
              h('span', null, 'Aggiungi ore'),
            ),
      );
    });
    return [
      h('p', { class: 'muted' }, 'Per ogni giorno segna da che ora a che ora hai lavorato al progetto e su cosa. Gli orari vanno al quarto d\'ora. Puoi farlo a fine giornata o a fine settimana.'),
      h('p', { class: 'muted small' }, 'Le note le vede tutto il team, advisor compresi, e restano nello storico.'),
      weekNav(),
      h(
        'div',
        { class: 'ts-pledge' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ore a settimana che puoi dare'), pledgeInput),
        h('p', { class: 'muted small' }, 'Valgono da questa settimana in poi, finché non le cambi.'),
      ),
      totalHost,
      h('div', { class: 'ts-days' }, days),
      h('footer', { class: 'save-bar' }, statusHost, problemHost, saveButton),
    ];
  };

  const teamBody = () => {
    const people = team().map((member) => {
      const weeks = weeksOf(member.user_id);
      const data = dataMap(weeks);
      const week = weeks.get(monday)?.data || { entries: [] };
      return { member, weeks: data, week, pledge: pledgeFor(data, monday), series: weekSeries(data, monday) };
    });
    const allWeek = people.flatMap((p) => p.week.entries);
    const allHistory = people.flatMap((p) => p.series.flatMap((w) => p.weeks.get(w.week)?.entries || []));

    const table = h(
      'table',
      { class: 'ts-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, 'Persona'),
          DAYS.map(([key, label], i) => h('th', { scope: 'col', abbr: label }, h('span', { class: 'av-day' }, key), h('span', { class: 'av-date' }, shortDate(addDays(monday, i))))),
          h('th', { scope: 'col' }, 'Totale'),
        ),
      ),
      h(
        'tbody',
        null,
        people.map((p) => {
          const days = dayTotals(p.week.entries);
          const total = minutesOf(p.week.entries);
          return h(
            'tr',
            null,
            h('th', { scope: 'row' }, h('span', { class: 'ts-who' }, h('span', { 'aria-hidden': 'true' }, avatar(p.member.user_id, 22)), personName(p.member))),
            DAY_KEYS.map((day) => h('td', null, days[day] ? durationText(days[day]) : [h('span', { class: 'muted', 'aria-hidden': 'true' }, '-'), srOnly('nessuna ora')])),
            h(
              'td',
              { class: 'ts-sum' },
              h('strong', null, durationText(total)),
              p.pledge ? h('span', { class: 'muted small' }, ` su ${durationText(p.pledge)}`) : null,
              p.pledge ? bar(total, p.pledge) : null,
            ),
          );
        }),
      ),
    );
    const scroller = h('div', { class: 'av-scroll', tabindex: '0', role: 'region', 'aria-label': `Ore della squadra ${weekLabel(monday)}`, dataset: { focus: 'team-table' } }, table);
    scroller.addEventListener('scroll', () => {
      tableScroll = scroller.scrollLeft;
    });

    const missing = people.filter((p) => !p.week.entries.length).map((p) => personName(p.member));

    return [
      h(
        'p',
        { class: 'muted' },
        'Le ore che ognuno ha dedicato al progetto, giorno per giorno, accanto a quelle che aveva detto di poter dare. ',
        writable ? h('a', { href: `#/squadra/ore?vista=mie&settimana=${monday}`, dataset: { replace: '' } }, 'Segna le tue ore') : null,
      ),
      weekNav(),
      scroller,
      missing.length ? h('p', { class: 'muted small' }, `Non hanno segnato ore: ${missing.join(', ')}.`) : null,
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'ts-history-title' },
        h('h2', { id: 'ts-history-title' }, `Ultime ${HISTORY_WEEKS} settimane`),
        h('p', { class: 'muted small' }, 'Le colonne sono le ore segnate, il segno orizzontale le ore dichiarate.'),
        h(
          'ul',
          { class: 'ts-people' },
          people.map((p) => {
            const name = personName(p.member);
            const filled = p.series.filter((w) => w.filled);
            const average = filled.length ? Math.round(minutesOf(filled.flatMap((w) => p.weeks.get(w.week).entries)) / filled.length / STEP) * STEP : 0;
            return h(
              'li',
              null,
              h('strong', null, name),
              historyChart(p.series, name),
              h('span', { class: 'muted small' }, filled.length ? `in media ${durationText(average)} nelle settimane segnate` : 'nessuna settimana segnata'),
            );
          }),
        ),
      ),
      h(
        'div',
        { class: 'cards cards-2' },
        h('section', { class: 'card' }, h('h2', null, weekIndex() === 0 ? 'Per area, questa settimana' : `Per area, ${weekLabel(monday)}`), areaList(areaTotals(allWeek))),
        h('section', { class: 'card' }, h('h2', null, `Per area, ultime ${HISTORY_WEEKS} settimane`), areaList(areaTotals(allHistory))),
      ),
      h('h2', null, 'Giorno per giorno'),
      people.some((p) => p.week.entries.length)
        ? h(
            'div',
            { class: 'stack' },
            people
              .filter((p) => p.week.entries.length)
              .map((p) => {
                const details = h(
                  'details',
                  { class: 'ts-detail', open: openDetails.has(p.member.user_id) },
                  h('summary', { dataset: { focus: `detail-${p.member.user_id}` } }, `${personName(p.member)}, ${durationText(minutesOf(p.week.entries))}`),
                  h(
                    'ul',
                    null,
                    p.week.entries.map((e) =>
                      h(
                        'li',
                        null,
                        h('strong', null, `${capital(dayName(e.day))} ${shortDate(addDays(monday, DAY_KEYS.indexOf(e.day)))}, ${clockText(e.start)}-${clockText(e.end)}`),
                        ` · ${areaLabel(e.area)}`,
                        e.note ? ` · ${e.note}` : '',
                      ),
                    ),
                  ),
                );
                // I dettagli aperti restano aperti quando la pagina si ridisegna per un salvataggio di qualcun altro.
                details.addEventListener('toggle', () => {
                  if (details.open) openDetails.add(p.member.user_id);
                  else openDetails.delete(p.member.user_id);
                });
                return details;
              }),
          )
        : h('p', { class: 'muted small' }, 'Nessuna ora segnata in questa settimana.'),
    ];
  };

  function render(focusOverride) {
    if (!alive) return;
    currentMonday = thisMonday();
    const focusKey = focusOverride || document.activeElement?.dataset?.focus;
    const views = writable
      ? tabs(
          [
            ['team', 'Ore della squadra'],
            ['mie', 'Le mie ore'],
          ],
          mode === 'mine' ? 'mie' : 'team',
          (key) => (key === 'mie' ? `#/squadra/ore?vista=mie&settimana=${monday}` : `#/squadra/ore?settimana=${monday}`),
          { ariaLabel: 'Vista', className: 'subtabs' },
        )
      : null;
    mount(outlet, ...chrome([]), h('div', { class: 'tab-body stack' }, views, mode === 'mine' ? mineBody() : teamBody()));
    if (mode === 'mine') {
      updateTotals();
      updateDirty();
    } else {
      const scroller = outlet.querySelector('.av-scroll');
      if (scroller) scroller.scrollLeft = tableScroll;
    }
    if (!focusKey) return;
    const target = [focusKey, ...(FOCUS_FALLBACK[focusKey] || [])]
      .map((key) => outlet.querySelector(`[data-focus="${key}"]`))
      .find((el) => el && !el.disabled);
    target?.focus();
  }

  // Salva come un push: se nel frattempo la settimana è cambiata altrove, unisce riga per riga e riprova.
  // Settimana e dati si fissano all'inizio, così niente di quello che succede intanto finisce nel salvataggio sbagliato.
  const save = async () => {
    const week = monday;
    let draft = sanitizeTimesheet(working);
    let base = startData;
    let target = startItem;
    if (!target) {
      const existing = mineWeeks().get(week)?.item;
      if (existing) {
        // Nata altrove dopo l'apertura: la versione 0 fa rispondere «conflitto» e si unisce.
        target = { ...existing, version: 0 };
      } else {
        try {
          await createItem('timesheet', { title: TITLE, data: draft }, 'Prime ore della settimana');
          return { saved: true };
        } catch (error) {
          if (error?.code !== '23505') throw error;
          await syncItems({ force: true });
          const created = mineWeeks().get(week)?.item;
          if (!created) throw error;
          target = { ...created, version: 0 };
        }
      }
    }
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const result = await saveSnapshot(target, { title: TITLE, status: null, idea_id: null, data: draft }, 'Ore aggiornate');
      if (result.status === 'ok') return { saved: true, merged: attempt > 0 };
      if (result.status !== 'conflict' || !result.item) throw statusError(result.status);
      const theirs = sanitizeTimesheet(result.item.data);
      draft = mergeTimesheet(base, draft, theirs);
      base = theirs;
      target = result.item;
      // Due dispositivi hanno aggiunto righe che si accavallano: si mostra l'unione e si lascia scegliere.
      if (timesheetProblem(draft)) return { merged: true, draft, item: result.item, base: theirs, week };
    }
    throw statusError('conflict');
  };

  saveButton.addEventListener('click', async () => {
    if (saving || saveButton.disabled) return;
    const problem = showProblem();
    if (problem) {
      problemShown = true;
      outlet.querySelector(`[data-focus="${problem.focus}"]`)?.focus();
      return;
    }
    saving = true;
    saveButton.classList.add('is-busy');
    mount(problemHost);
    updateDirty();
    let outcome = null;
    let failure = null;
    try {
      outcome = await save();
    } catch (error) {
      failure = error;
    }
    saving = false;
    saveButton.classList.remove('is-busy');
    if (!alive) return;
    if (outcome?.saved) {
      startWorking();
      toast(outcome.merged ? 'Ore salvate, unite a quelle salvate da un altro dispositivo.' : 'Ore salvate.', { type: 'success' });
      render('save');
    } else if (outcome?.draft && outcome.week === monday) {
      startItem = outcome.item;
      startData = outcome.base;
      working = structuredClone(outcome.draft);
      problemShown = true;
      render('save');
    } else {
      updateDirty();
      if (failure) mount(problemHost, errorBox(failure));
      // Durante il salvataggio il pulsante era disattivato e il focus è andato perso.
      if (!outlet.contains(document.activeElement)) saveButton.focus();
    }
    if (missedTick) {
      missedTick = false;
      render();
    }
  });

  // A mezzanotte cambia «oggi»: si ridisegna per i giorni che diventano segnabili.
  const scheduleTick = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    timer = setTimeout(() => {
      if (saving) missedTick = true;
      else render();
      scheduleTick();
    }, next - now);
  };

  if (mode === 'mine') {
    startWorking();
    window.addEventListener('beforeunload', onBeforeUnload);
  }
  render();
  scheduleTick();

  const offItem = on('item', ({ item }) => {
    if (item.kind !== 'timesheet') return;
    if (mode === 'team') return render();
    if (changed || saving || item.created_by !== state.user?.id) return undefined;
    startWorking();
    return render();
  });
  const offMembers = on('members', () => {
    if (!saving) render();
  });
  return () => {
    alive = false;
    clearTimeout(timer);
    offItem();
    offMembers();
    window.removeEventListener('beforeunload', onBeforeUnload);
    setLeaveGuard(null);
  };
}
