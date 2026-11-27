import { h, mount, confirmDialog, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { deepEqual, snapshotOf } from '../lib/diff.js';
import { dayKey, fmtDate, fmtRelative } from '../lib/format.js';
import { isIsoDate, isUuid } from '../lib/validate.js';
import {
  DAYS,
  DAY_KEYS,
  HOURS,
  WEEKS_AHEAD,
  addDays,
  bestSlots,
  dayName,
  dayShort,
  dropPastWeeks,
  hourSpan,
  joinNames,
  personState,
  personWeek,
  sanitizeAvailability,
  shortDate,
  slotLabel,
  teamGrid,
  thisMonday,
  weekLabel,
} from '../availability.js';
import { availabilityOf, createItem, memberName, on, readProjectLocal, state, syncItems, writeProjectLocal } from '../store.js';
import { setLeaveGuard } from '../router.js';
import { tx } from '../i18n/index.js';
import { saveWithMerge } from './merge.js';
import { avatar, errorBox, tabs } from './components.js';

const t = tx.availability;
const CHOICE_KEY = 'disponibilita-chi'; // i18n-ignore: chiave salvata sul dispositivo
// Il titolo lo fissa il database e resta questo in ogni lingua.
const TITLE = 'Impegni'; // i18n-ignore
const TEAM_HREF = '#/squadra/disponibilita'; // i18n-ignore: indirizzo
const MINE_HREF = '#/squadra/disponibilita?vista=miei'; // i18n-ignore: indirizzo
const MOVES = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const WEEK_MS = 7 * 24 * 3600 * 1000;
// Se il pulsante premuto sparisce o si disattiva dopo il ridisegno, il focus va al vicino.
const FOCUS_FALLBACK = { 'week-prev': ['week-next', 'week-title'], 'week-next': ['week-prev', 'week-title'], 'back-base': ['scope-week'], save: ['scope-base', 'scope-week'] };

// Chi deve esserci: admin e membri di default, gli advisor solo se scelti. Si ricorda su questo dispositivo, per progetto.
function loadChoice() {
  const saved = readProjectLocal(CHOICE_KEY);
  const ids = (list) => (Array.isArray(list) ? list.filter(isUuid) : []);
  return { on: ids(saved?.on), off: ids(saved?.off) };
}

const isChosen = (member, choice) =>
  choice.on.includes(member.user_id) || (member.role !== 'advisor' && !choice.off.includes(member.user_id));

function personData(userId) {
  const item = availabilityOf(userId);
  return item ? sanitizeAvailability(item.data) : null;
}

function stateText(data, monday, item) {
  const status = personState(data, monday);
  if (status === 'missing') return t.team.neverMarked;
  if (status === 'expired') return t.team.expiredOn(data.until, fmtDate(data.until));
  if (status === 'partial') return t.team.countsUntil(data.until, fmtDate(data.until));
  return t.team.updated(fmtRelative(item.updated_at));
}

function level(cell) {
  const counted = cell.free.length + cell.busy.length;
  if (!counted) return 'l0';
  if (cell.free.length === counted) return 'l4';
  if (!cell.free.length) return 'l1';
  return cell.free.length * 2 >= counted ? 'l3' : 'l2';
}

function dayHeaders(monday, withDates) {
  return h(
    'thead',
    null,
    h(
      'tr',
      null,
      h('th', { scope: 'col', class: 'av-corner' }, t.hour),
      DAYS.map(([key, label], i) =>
        h('th', { scope: 'col', abbr: label }, h('span', { class: 'av-day' }, dayShort(key)), withDates ? h('span', { class: 'av-date' }, shortDate(addDays(monday, i))) : null),
      ),
    ),
  );
}

// La griglia è una sola fermata di Tab: dentro ci si sposta con le frecce, come in un foglio di calcolo.
function gridNav(table) {
  const setActive = (cell) => table.querySelectorAll('.av-cell').forEach((el) => el.setAttribute('tabindex', el === cell ? '0' : '-1'));
  setActive(table.querySelector('.av-cell[aria-current="true"]') || table.querySelector('.av-cell'));
  table.addEventListener('focusin', (event) => {
    const cell = event.target.closest?.('.av-cell');
    if (cell) setActive(cell);
  });
  table.addEventListener('keydown', (event) => {
    const cell = event.target.closest?.('.av-cell');
    const move = MOVES[event.key];
    if (!cell || !move) return;
    const next = table.querySelector(`.av-cell[data-day="${Number(cell.dataset.day) + move[0]}"][data-hour="${Number(cell.dataset.hour) + move[1]}"]`);
    if (!next) return;
    event.preventDefault();
    next.focus();
  });
  return table;
}

export function availabilityView(outlet, query, chrome) {
  const mode = query.get('vista') === 'miei' ? 'mine' : 'team';
  let currentMonday = thisMonday();
  let monday = currentMonday;
  let scope = 'base';
  let picked = null;
  let choice = loadChoice();
  let working = null;
  let startItem = null;
  let changed = false;
  let saving = false;
  let paint = null;
  let pointerTap = null;
  let untilInput = null;
  let alive = true;
  let timer = null;
  const errorHost = h('div');
  const statusHost = h('span', { class: 'muted small', role: 'status' });
  const weekNote = h('div', { class: 'av-note' });
  const untilWarn = h('div');
  const saveButton = h(
    'button',
    { type: 'button', class: 'btn btn-primary', disabled: true, dataset: { focus: 'save' } },
    icon('commit', 16),
    h('span', null, t.mine.save),
  );

  const refreshNow = () => {
    currentMonday = thisMonday();
    if (monday < currentMonday) monday = currentMonday;
  };
  const weekIndex = () => Math.round((Date.parse(monday) - Date.parse(currentMonday)) / WEEK_MS);

  const baseline = () => {
    const data = personData(state.user?.id);
    return data ? dropPastWeeks(data, currentMonday) : null;
  };

  // La copia di lavoro ricorda da quale versione parte: al salvataggio le modifiche fatte altrove si uniscono.
  const startWorking = () => {
    startItem = availabilityOf(state.user?.id);
    working = structuredClone(baseline() || { busy: {} });
  };

  const weekEntry = () => working.weeks?.find((week) => week.key === monday) || null;

  const updateDirty = () => {
    const base = baseline();
    changed = !deepEqual(sanitizeAvailability(working), base || { busy: {} });
    // La prima volta si può salvare anche senza impegni: vuol dire «sempre libero».
    saveButton.disabled = saving || (!changed && Boolean(base));
    if (untilInput) untilInput.disabled = saving;
    setLeaveGuard(changed ? () => confirmDialog(t.mine.leaveQuestion, { title: t.mine.leaveTitle, okLabel: t.mine.leave, danger: true }) : null);
    const item = availabilityOf(state.user?.id);
    const text = saving
      ? t.mine.saving
      : changed
        ? t.mine.unsaved
        : item
          ? t.mine.savedWhen(fmtRelative(item.updated_at))
          : t.mine.notYetSaved;
    if (statusHost.textContent !== text) mount(statusHost, text);
  };

  const onBeforeUnload = (event) => {
    if (!changed) return;
    event.preventDefault();
    event.returnValue = '';
  };

  const updateUntilWarn = () => {
    const today = dayKey(new Date());
    mount(
      untilWarn,
      working.until && working.until < today
        ? h('p', { class: 'av-warn small' }, t.mine.baseExpired(working.until, fmtDate(working.until)))
        : null,
    );
  };

  const updateWeekNote = () => {
    if (scope !== 'week') return mount(weekNote);
    const thisWeek = weekIndex() === 0;
    if (weekEntry()) {
      return mount(
        weekNote,
        h('p', { class: 'small' }, thisWeek ? t.mine.differentThisWeek : t.mine.differentWeek(weekLabel(monday))),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', dataset: { focus: 'back-base' }, onClick: backToBase }, t.mine.backToBase),
      );
    }
    if (personWeek(working, monday).some((day) => !day.known)) {
      const date = fmtDate(working.until);
      return mount(
        weekNote,
        h(
          'p',
          { class: 'av-warn small' },
          working.until < dayKey(new Date()) ? t.mine.weekBaseExpired(working.until, date) : t.mine.weekBaseUntil(working.until, date),
        ),
      );
    }
    return mount(weekNote, h('p', { class: 'muted small' }, thisWeek ? t.mine.onlyThisWeek : t.mine.onlyWeek(weekLabel(monday))));
  };

  function backToBase() {
    if (saving) return;
    working.weeks = (working.weeks || []).filter((week) => week.key !== monday);
    if (!working.weeks.length) delete working.weeks;
    updateDirty();
    render();
  }

  const shownWeek = () =>
    scope === 'base' ? DAY_KEYS.map((day) => ({ known: true, busy: new Set(working.busy[day] || []) })) : personWeek(working, monday);

  const setHour = (dayIndex, hour, busyNow) => {
    let target = working.busy;
    let created = false;
    if (scope === 'week') {
      let entry = weekEntry();
      if (!entry) {
        // La prima modifica copia la settimana come si vede, poi si cambia solo questa.
        const days = personWeek(working, monday);
        entry = { key: monday, busy: Object.fromEntries(DAY_KEYS.map((day, i) => [day, [...days[i].busy].sort((a, b) => a - b)])) };
        working.weeks = [...(working.weeks || []), entry].sort((a, b) => a.key.localeCompare(b.key));
        created = true;
      }
      target = entry.busy;
    }
    const day = DAY_KEYS[dayIndex];
    const hours = new Set(target[day] || []);
    if (busyNow) hours.add(hour);
    else hours.delete(hour);
    target[day] = [...hours].sort((a, b) => a - b);
    return created;
  };

  const isTaken = (cell) => cell.getAttribute('aria-pressed') === 'true';

  const applyCell = (cell) => {
    if (paint === null || isTaken(cell) === paint || saving) return;
    const created = setHour(Number(cell.dataset.day), Number(cell.dataset.hour), paint);
    cell.setAttribute('aria-pressed', String(paint));
    cell.classList.toggle('av-taken', paint);
    // Da adesso la settimana è tutta nota: via le righe dei giorni scaduti.
    if (created) {
      cell.closest('table')?.querySelectorAll('.av-unknown').forEach((el) => {
        el.classList.remove('av-unknown');
        el.setAttribute('aria-label', el.dataset.label);
      });
    }
    updateDirty();
    updateWeekNote();
  };

  const stopPaint = () => {
    paint = null;
  };

  const editGrid = () => {
    const days = shownWeek();
    const table = h(
      'table',
      { class: 'av-grid av-edit', 'aria-label': scope === 'base' ? t.mine.baseGrid : t.mine.weekGrid(weekLabel(monday)) },
      dayHeaders(monday, scope === 'week'),
      h(
        'tbody',
        null,
        HOURS.map((hour) =>
          h(
            'tr',
            null,
            h('th', { scope: 'row', class: 'av-hour' }, `${hour}-${hour + 1}`),
            DAYS.map(([, label], i) => {
              const taken = days[i].busy.has(hour);
              const base = t.mine.cellBusy(label, hourSpan(hour));
              return h(
                'td',
                null,
                h('button', {
                  type: 'button',
                  class: ['av-cell', taken && 'av-taken', !days[i].known && 'av-unknown'],
                  'aria-pressed': String(taken),
                  'aria-label': days[i].known ? base : t.mine.cellExpired(base),
                  dataset: { day: String(i), hour: String(hour), focus: `cell-${i}-${hour}`, label: base },
                }),
              );
            }),
          ),
        ),
      ),
    );
    table.addEventListener('pointerdown', (event) => {
      const cell = event.target.closest?.('.av-cell');
      if (!cell || event.button !== 0 || saving) return;
      event.preventDefault();
      pointerTap = { cell, at: event.timeStamp };
      paint = !isTaken(cell);
      applyCell(cell);
    });
    table.addEventListener('pointermove', (event) => {
      if (paint === null) return;
      // Pulsante rilasciato fuori dalla finestra: il trascinamento finisce qui.
      if ((event.buttons & 1) === 0) return stopPaint();
      const cell = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('.av-cell');
      if (cell && table.contains(cell)) applyCell(cell);
      return undefined;
    });
    // Tastiera e lettori di schermo arrivano solo col clic. Il clic che segue un tocco sulla stessa ora è già
    // stato gestito: col dito arriva anche parecchio dopo, per questo si guarda il tempo e non l'ordine degli eventi.
    table.addEventListener('keydown', () => {
      pointerTap = null;
    });
    table.addEventListener('click', (event) => {
      const cell = event.target.closest?.('.av-cell');
      if (!cell) return;
      const tap = pointerTap;
      pointerTap = null;
      if (tap?.cell === cell && event.timeStamp - tap.at < 1500) return;
      paint = !isTaken(cell);
      applyCell(cell);
      paint = null;
    });
    return gridNav(table);
  };

  const weekNav = () => {
    const index = weekIndex();
    const go = (step) => {
      monday = addDays(monday, step * 7);
      picked = null;
      render();
    };
    const name = index === 0 ? t.nav.thisWeek : index === 1 ? t.nav.nextWeek : t.nav.inWeeks(index);
    return h(
      'div',
      { class: 'av-week' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', disabled: index <= 0, 'aria-label': t.nav.previous, dataset: { focus: 'week-prev' }, onClick: () => go(-1) }, '←'),
      h('div', { class: 'av-week-title', 'aria-live': 'polite', tabindex: '-1', dataset: { focus: 'week-title' } }, h('strong', null, name), h('span', { class: 'muted small' }, weekLabel(monday))),
      h(
        'button',
        { type: 'button', class: 'btn btn-ghost btn-small', disabled: index >= WEEKS_AHEAD - 1, 'aria-label': t.nav.next, dataset: { focus: 'week-next' }, onClick: () => go(1) },
        '→',
      ),
    );
  };

  const mineBody = () => {
    const today = dayKey(new Date());
    untilInput = h('input', {
      class: 'input',
      type: 'date',
      value: working.until || '',
      min: today,
      disabled: saving,
      dataset: { focus: 'until' },
      // Niente ridisegno qui: mentre si scrive l'anno a mano il valore passa per date come 0002-12-20.
      onChange: (event) => {
        const value = event.target.value;
        if (isIsoDate(value) && value >= '2000-01-01') working.until = value;
        else delete working.until;
        updateDirty();
        updateUntilWarn();
      },
    });
    const scopeButton = (value, label) =>
      h(
        'button',
        {
          type: 'button',
          class: ['btn', 'btn-small', scope === value ? 'btn-primary' : 'btn-ghost'],
          'aria-pressed': String(scope === value),
          dataset: { focus: `scope-${value}` },
          onClick: () => {
            scope = value;
            render();
          },
        },
        label,
      );
    updateWeekNote();
    updateUntilWarn();
    return [
      h(
        'p',
        { class: 'muted' },
        t.mine.intro,
        h('span', { class: 'av-touch-hint' }, ` ${t.mine.touchHint}`),
      ),
      h('div', { class: 'av-scope', role: 'group', 'aria-label': t.mine.scopeLabel }, scopeButton('base', t.mine.base), scopeButton('week', t.mine.week)),
      scope === 'base'
        ? h(
            'div',
            { class: 'av-until' },
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, t.mine.until), untilInput),
            h('p', { class: 'muted small' }, t.mine.untilHelp),
            untilWarn,
          )
        : h('div', { class: 'stack' }, weekNav(), weekNote),
      h('div', { class: 'av-scroll' }, editGrid()),
      errorHost,
      h('footer', { class: 'save-bar' }, statusHost, saveButton),
    ];
  };

  const cellText = (cell) => {
    const counted = cell.free.length + cell.busy.length;
    const when = t.team.cellWhen(dayName(cell.day), shortDate(cell.date), hourSpan(cell.hour));
    const what = counted ? t.team.freeOf(cell.free.length, counted) : t.team.nobodyMarked;
    return cell.past ? t.team.pastCell(when, what) : t.team.cell(when, what);
  };

  const detailOf = (cell) => {
    const line = (label, ids) => (ids.length ? h('p', { class: 'small' }, h('strong', null, `${label}: `), joinNames(ids.map(memberName))) : null);
    return [
      h('p', null, h('strong', null, slotLabel(cell.date, cell.hour, cell.hour + 1)), cell.past ? h('span', { class: 'muted' }, `, ${t.team.past}`) : null),
      line(t.team.free, cell.free),
      line(t.team.busyPeople, cell.busy),
      line(t.team.unknown, cell.unknown),
    ];
  };

  const bestText = (block) => {
    const parts = [];
    if (block.busy.length) parts.push(t.team.busy(block.busy.length, joinNames(block.busy.map(memberName))));
    if (block.unknown.length) parts.push(t.team.unknownFor(joinNames(block.unknown.map(memberName))));
    return parts.length ? parts.join(', ') : t.team.allFree;
  };

  const teamBody = () => {
    const members = state.members;
    const chosen = members.filter((member) => isChosen(member, choice));
    const people = chosen.map((member) => ({ id: member.user_id, data: personData(member.user_id) }));
    const grid = teamGrid(people, monday);
    const best = bestSlots(grid);
    const notCounted = people.filter((person) => personState(person.data, monday) !== 'ok');
    const anyKnown = grid.some((column) => column.some((cell) => cell.free.length + cell.busy.length > 0));
    const detail = h('div', { class: 'av-detail', 'aria-live': 'polite' });
    const showDetail = () =>
      mount(detail, picked ? detailOf(grid[picked.day][picked.hour - HOURS[0]]) : h('p', { class: 'muted small' }, t.team.tapHour));

    const toggle = (member) => {
      const id = member.user_id;
      const wasChosen = isChosen(member, choice);
      choice = {
        on: wasChosen ? choice.on.filter((x) => x !== id) : [...choice.on, id],
        off: wasChosen ? [...choice.off.filter((x) => x !== id), id] : choice.off.filter((x) => x !== id),
      };
      writeProjectLocal(CHOICE_KEY, choice);
      render();
    };

    const peopleList = h(
      'ul',
      { class: 'av-people', 'aria-label': t.team.whoTitle },
      members.map((member) => {
        const data = personData(member.user_id);
        const status = personState(data, monday);
        const active = isChosen(member, choice);
        return h(
          'li',
          null,
          h(
            'button',
            { type: 'button', class: ['av-person', active && 'is-on'], 'aria-pressed': String(active), dataset: { focus: `person-${member.user_id}` }, onClick: () => toggle(member) },
            h('span', { class: 'av-person-avatar', 'aria-hidden': 'true' }, avatar(member.user_id, 24)),
            h(
              'span',
              { class: 'av-person-name' },
              member.display_name || memberName(member.user_id),
              member.role === 'advisor' ? h('span', { class: 'muted small' }, ` · ${tx.common.roles.advisor.toLowerCase()}`) : null,
            ),
            h('span', { class: ['av-person-mark', 'small'] }, active ? t.team.counts : t.team.notCounts),
            h('span', { class: ['av-person-state', 'small', status !== 'ok' && 'av-warn'] }, stateText(data, monday, availabilityOf(member.user_id))),
          ),
        );
      }),
    );

    const thisWeek = weekIndex() === 0;
    const emptyBest = !chosen.length
      ? t.team.chooseSomeone
      : !anyKnown
        ? thisWeek ? t.team.noneMarkedThisWeek : t.team.noneMarkedWeek
        : thisWeek ? t.team.noCommonThisWeek : t.team.noCommonWeek(weekLabel(monday));
    const bestCard = h(
      'section',
      { class: 'card av-best-card', 'aria-labelledby': 'av-best-title' },
      h('h2', { id: 'av-best-title' }, t.team.bestTitle),
      best.length
        ? h(
            'ol',
            { class: 'av-best' },
            best.map((block) =>
              h(
                'li',
                null,
                h('strong', null, slotLabel(block.date, block.start, block.end)),
                h('span', { class: block.busy.length || block.unknown.length ? 'muted' : 'av-all' }, bestText(block)),
              ),
            ),
          )
        : h('p', { class: 'muted' }, emptyBest),
      notCounted.length
        ? h('p', { class: 'muted small' }, t.team.notCounting(notCounted.map((person) => `${memberName(person.id)} (${reasonOf(person.data)})`).join(', ')))
        : null,
    );

    const table = h(
      'table',
      { class: 'av-grid av-team', 'aria-label': t.team.gridLabel(weekLabel(monday)) },
      dayHeaders(monday, true),
      h(
        'tbody',
        null,
        HOURS.map((hour, row) =>
          h(
            'tr',
            null,
            h('th', { scope: 'row', class: 'av-hour' }, `${hour}-${hour + 1}`),
            grid.map((column, i) => {
              const cell = column[row];
              const counted = cell.free.length + cell.busy.length;
              const isPicked = picked?.day === i && picked?.hour === hour;
              return h(
                'td',
                null,
                h(
                  'button',
                  {
                    type: 'button',
                    class: ['av-cell', `av-${level(cell)}`, cell.past && 'is-past', isPicked && 'is-picked'],
                    'aria-label': cellText(cell),
                    'aria-current': isPicked ? 'true' : undefined,
                    dataset: { day: String(i), hour: String(hour), focus: `cell-${i}-${hour}` },
                    onClick: (event) => {
                      picked = { day: i, hour };
                      table.querySelectorAll('.av-cell.is-picked').forEach((el) => {
                        el.classList.remove('is-picked');
                        el.removeAttribute('aria-current');
                      });
                      event.currentTarget.classList.add('is-picked');
                      event.currentTarget.setAttribute('aria-current', 'true');
                      showDetail();
                      detail.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
                    },
                  },
                  counted ? `${cell.free.length}/${counted}` : '',
                ),
              );
            }),
          ),
        ),
      ),
    );
    showDetail();

    return [
      h(
        'p',
        { class: 'muted' },
        t.team.intro,
        ' ',
        h('a', { href: MINE_HREF, dataset: { replace: '' } }, t.team.markYours),
      ),
      weekNav(),
      bestCard,
      h('div', { class: 'av-scroll' }, gridNav(table)),
      h(
        'div',
        { class: 'av-legend small muted' },
        h('span', null, t.team.legend),
        h(
          'span',
          { class: 'av-legend-scale', 'aria-hidden': 'true' },
          t.team.nobodyFree,
          ['l1', 'l2', 'l3', 'l4'].map((key) => h('span', { class: ['av-swatch', `av-${key}`] })),
          t.team.everyoneFree,
        ),
      ),
      detail,
      h('h2', null, t.team.whoTitle),
      h('p', { class: 'muted small' }, t.team.whoHelp),
      peopleList,
    ];
  };

  function reasonOf(data) {
    if (!data) return t.team.notMarked;
    return personState(data, monday) === 'expired' ? t.team.expired : t.team.countsUntil(data.until, shortDate(data.until));
  }

  function render() {
    if (!alive) return;
    refreshNow();
    const focusKey = document.activeElement?.dataset?.focus;
    mount(
      outlet,
      ...chrome([]),
      h(
        'div',
        { class: 'tab-body stack' },
        tabs(
          [
            ['team', t.views.team],
            ['miei', t.views.mine],
          ],
          mode === 'mine' ? 'miei' : 'team',
          (key) => (key === 'miei' ? MINE_HREF : TEAM_HREF),
          { ariaLabel: t.views.label, className: 'subtabs' },
        ),
        mode === 'mine' ? mineBody() : teamBody(),
      ),
    );
    if (!focusKey) return;
    const target = [focusKey, ...(FOCUS_FALLBACK[focusKey] || [])]
      .map((key) => outlet.querySelector(`[data-focus="${key}"]`))
      .find((el) => el && !el.disabled);
    target?.focus();
  }

  // Le ore passate e la settimana corrente cambiano col tempo: allo scoccare di ogni ora si ridisegna.
  const scheduleTick = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 5);
    timer = setTimeout(() => {
      if (mode === 'team') render();
      else if (!changed && !saving) {
        // A cavallo del lunedì la settimana appena finita esce dalla copia di lavoro come dalla base.
        startWorking();
        updateDirty();
        render();
      }
      scheduleTick();
    }, next - now);
  };

  const save = async (retry = true) => {
    mount(errorHost);
    const mine = availabilityOf(state.user?.id);
    const data = sanitizeAvailability(dropPastWeeks(working, thisMonday()));
    try {
      if (mine) {
        // La base è pulita come la copia di lavoro: togliere le settimane passate non è una modifica da unire.
        const base = startItem
          ? { ...snapshotOf(startItem), data: sanitizeAvailability(dropPastWeeks(sanitizeAvailability(startItem.data), thisMonday())) }
          : { ...snapshotOf(mine), data: { busy: {} } };
        // Si salva sopra la versione da cui è partita la copia. Se l'elemento è nato altrove nel frattempo,
        // la versione 0 fa rispondere «conflitto» e saveWithMerge unisce con quella salvata.
        const target = startItem?.id === mine.id ? startItem : { ...mine, version: 0 };
        const result = await saveWithMerge(target, base, { ...base, title: TITLE, data }, t.mine.updateMessage);
        if (result.cancelled) return;
      } else {
        await createItem('availability', { title: TITLE, data }, t.mine.firstMessage);
      }
      if (!alive) return;
      // Le ore segnate durante il salvataggio restano da salvare.
      if (deepEqual(sanitizeAvailability(dropPastWeeks(working, thisMonday())), data)) startWorking();
      else startItem = availabilityOf(state.user?.id);
      toast(t.mine.saved, { type: 'success' });
      render();
    } catch (error) {
      // Creati nel frattempo da un altro dispositivo, senza che il tempo reale lo abbia detto: si ricarica e si unisce.
      if (alive && retry && !mine && error?.code === '23505') {
        const synced = await syncItems({ force: true }).then(
          () => true,
          () => false,
        );
        if (synced && alive) return save(false);
      }
      if (alive) mount(errorHost, errorBox(error));
    }
    return undefined;
  };

  saveButton.addEventListener('click', async () => {
    if (saving || saveButton.disabled) return;
    saving = true;
    saveButton.classList.add('is-busy');
    updateDirty();
    try {
      await save();
    } finally {
      saving = false;
      saveButton.classList.remove('is-busy');
      if (alive) updateDirty();
    }
  });

  if (mode === 'mine') {
    startWorking();
    updateDirty();
    window.addEventListener('pointerup', stopPaint);
    window.addEventListener('pointercancel', stopPaint);
    window.addEventListener('blur', stopPaint);
    window.addEventListener('beforeunload', onBeforeUnload);
  }
  render();
  scheduleTick();

  const offItem = on('item', ({ item }) => {
    if (item.kind !== 'availability') return;
    if (mode === 'team') return render();
    if (changed || saving || item.created_by !== state.user?.id) return undefined;
    startWorking();
    updateDirty();
    return render();
  });
  const offMembers = on('members', () => {
    if (mode === 'team' || !changed) render();
  });
  return () => {
    alive = false;
    clearTimeout(timer);
    offItem();
    offMembers();
    window.removeEventListener('pointerup', stopPaint);
    window.removeEventListener('pointercancel', stopPaint);
    window.removeEventListener('blur', stopPaint);
    window.removeEventListener('beforeunload', onBeforeUnload);
    setLeaveGuard(null);
  };
}
