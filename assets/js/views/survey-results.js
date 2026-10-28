import { busy, confirmDialog, h, mount, openModal, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { downloadFile, fmtDate, fmtDateTime, plural, slugFile } from '../lib/format.js';
import { api } from '../lib/api.js';
import { createItem, itemsOf } from '../store.js';
import {
  DEVICE_LABELS,
  FLAG_LABELS,
  answerText,
  askedQuestions,
  contactCandidates,
  durationStats,
  flagCounts,
  fmtDuration,
  fmtShare,
  funnelSteps,
  numberResponses,
  qualityFlags,
  questionStats,
  responsesCsv,
  scaleLabel,
  share,
  withoutFlagged,
} from '../survey-stats.js';
import { errorBox, loading } from './components.js';

// Percentuale sempre con il numero accanto: «45% (9 su 20)».
const shareText = (count, total) => `${fmtShare(share(count, total))} (${count} su ${total})`;

function bar(label, count, total, { extra } = {}) {
  const value = share(count, total);
  return h(
    'div',
    { class: 'sv-bar-row' },
    h('span', { class: 'sv-bar-label' }, label, extra || null),
    ' ',
    h('span', { class: 'sv-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.round((value || 0) * 100)}%` } })),
    h('span', { class: 'sv-bar-value' }, shareText(count, total)),
  );
}

function funnelCard(funnel) {
  const top = Math.max(funnel.steps[0].count, funnel.starts, 1);
  return h(
    'section',
    { class: 'card stack sv-funnel' },
    h('h2', null, 'Imbuto'),
    h('div', { class: 'sv-bars' }, funnel.steps.map((step) => bar(step.label, step.count, top))),
    h(
      'p',
      { class: 'small' },
      h('strong', null, `Completamento: ${fmtShare(funnel.completionRate)}`),
      ` (${funnel.steps[3].count} completati su ${funnel.starts} iniziati). Le percentuali sono sul numero più alto tra visite e inizi.`,
    ),
  );
}

function textList(stat, label) {
  const items = stat.map((t) => h('li', { dataset: { text: t.text.toLowerCase() } }, h('span', { class: 'muted small' }, `Risposta ${t.n}: `), h('span', { class: 'text-block' }, t.text)));
  const list = h('ul', { class: 'sv-texts' }, items);
  const search = h('input', {
    class: 'input input-small',
    type: 'search',
    placeholder: 'Cerca nelle risposte',
    'aria-label': `Cerca nelle risposte: ${label}`,
    onInput: (e) => {
      const needle = e.target.value.trim().toLowerCase();
      for (const li of items) li.hidden = Boolean(needle) && !li.dataset.text.includes(needle);
    },
  });
  return h('div', { class: 'stack' }, stat.length > 3 ? search : null, list);
}

function questionCard(stat, number) {
  const q = stat.question;
  const base = h(
    'p',
    { class: 'muted small' },
    `Hanno risposto ${stat.answered} su ${stat.reached} arrivati fin qui · senza risposta ${shareText(stat.skipped, stat.reached)}`,
    stat.breakoff ? ` · si sono fermati qui ${stat.breakoff}` : '',
  );
  let body = null;
  if (stat.options) {
    body = h(
      'div',
      { class: 'sv-bars' },
      stat.options.map((o) => bar(o.label, o.count, stat.answered)),
      q.allow_other ? bar('Altro', stat.other.length, stat.answered) : null,
      q.prefer_not ? bar('Preferisco non rispondere', stat.preferNot, stat.answered) : null,
      stat.multiple ? h('p', { class: 'muted small' }, 'Più risposte possibili: le percentuali non sommano a 100.') : null,
      stat.other.length ? h('details', { class: 'sv-other' }, h('summary', null, `Testi di «Altro» (${stat.other.length})`), textList(stat.other, `${q.label}, Altro`)) : null,
    );
  } else if (stat.distribution) {
    body = h(
      'div',
      { class: 'sv-bars' },
      stat.distribution.map((d) => bar(`${d.value}${d.label ? ` ${d.label}` : ''}`, d.count, stat.answered)),
      h('p', { class: 'small' }, stat.median === null ? 'Mediana: -' : `Mediana: ${String(stat.median).replace('.', ',')}${Number.isInteger(stat.median) && scaleLabel(q, stat.median) ? ` (${scaleLabel(q, stat.median)})` : ''} · n = ${stat.answered}`),
    );
  } else if (q.type === 'numero') {
    body = h('p', { class: 'small' }, stat.answered ? `Mediana ${String(stat.median).replace('.', ',')} · da ${stat.min} a ${stat.max} · n = ${stat.answered}` : 'Nessuna risposta.');
  } else if (q.type === 'email') {
    body = h('p', { class: 'small' }, `Email lasciate: ${stat.answered}, di cui ${stat.recontact} chiedono di essere ricontattate.`);
  } else {
    body = stat.texts.length ? textList(stat.texts, q.label) : h('p', { class: 'muted small' }, 'Nessuna risposta.');
  }
  return h('article', { class: 'card stack sv-question', dataset: { id: q.id } }, h('h3', null, `D${number}. ${q.label}`), base, body);
}

function durationCard(stats) {
  return h(
    'section',
    { class: 'card stack' },
    h('h2', null, 'Tempo di compilazione'),
    stats.n
      ? [
          h('p', null, h('strong', null, `Mediana: ${fmtDuration(stats.median)}`), ` (n = ${stats.n} compilazioni complete)`),
          h('ul', { class: 'sv-devices' }, stats.byDevice.map((d) => h('li', null, `${DEVICE_LABELS[d.device] || 'Dispositivo non indicato'}: ${fmtDuration(d.median)} (n = ${d.n})`))),
        ]
      : h('p', { class: 'muted small' }, 'Ancora nessuna compilazione completa con la durata.'),
  );
}

function qualityCard(flags, exclude, onToggle) {
  const counts = flagCounts(flags);
  const toggle = h('input', { type: 'checkbox', checked: exclude, onChange: (e) => onToggle(e.target.checked) });
  return h(
    'section',
    { class: 'card stack sv-quality' },
    h('h2', null, 'Qualità delle risposte'),
    h('label', { class: 'check' }, toggle, `Escludi le risposte segnalate (${flags.size})`),
    flags.size
      ? h('ul', { class: 'sv-flag-list' }, Object.entries(counts).filter(([, n]) => n).map(([code, n]) => h('li', null, `${FLAG_LABELS[code]}: ${n}`)))
      : h('p', { class: 'muted small' }, 'Nessuna risposta segnalata.'),
    h('p', { class: 'muted small' }, 'Le segnalazioni non cancellano nulla: guardate le risposte e decidete voi. La velocità si confronta con la mediana solo da 20 compilazioni complete in su.'),
  );
}

function responseDetails(survey, response, flags, { writable, onDelete }) {
  const status = response.completed ? 'completata' : 'interrotta';
  const parts = [`Risposta ${response.n}`, fmtDateTime(response.created_at), status];
  if (Number.isFinite(response.duration_seconds)) parts.push(fmtDuration(response.duration_seconds));
  if (response.device) parts.push(DEVICE_LABELS[response.device] || response.device);
  const remove = writable ? h('button', { type: 'button', class: 'btn btn-small btn-ghost' }, icon('trash', 14), h('span', null, 'Cancella questa risposta')) : null;
  remove?.addEventListener('click', busy(remove, () => onDelete(response)));
  return h(
    'details',
    { class: 'sv-response', dataset: { n: String(response.n) } },
    h('summary', null, parts.join(' · '), (flags.get(response.n) || []).map((code) => h('span', { class: 'badge badge-warn', title: FLAG_LABELS[code] }, FLAG_LABELS[code]))),
    h(
      'dl',
      { class: 'sv-answers' },
      askedQuestions(survey).map((q) => {
        const value = answerText(q, response, { scaleWithLabel: true });
        return [h('dt', null, q.label), h('dd', { class: value === null ? 'muted' : 'text-block' }, value === null ? '-' : String(value))];
      }),
      response.email ? [h('dt', null, 'Da ricontattare'), h('dd', null, response.recontact ? 'sì' : 'no')] : null,
    ),
    remove,
  );
}

function openCsvDialog(item, rows, flags) {
  const withEmail = h('input', { type: 'checkbox' });
  openModal({
    title: 'Scarica le risposte',
    body: h(
      'div',
      { class: 'stack' },
      h('p', null, `Un file CSV con ${plural(rows.length, 'riga', 'righe')}, una per risposta, che si apre con Excel, Numbers o Fogli Google.`),
      h('label', { class: 'check' }, withEmail, 'Includi le email'),
      h('p', { class: 'muted small' }, 'Le email sono dati personali: includile solo se servono e non condividete il file.'),
    ),
    actions: [
      { label: 'Annulla', value: false },
      {
        label: 'Scarica',
        kind: 'primary',
        onClick: () => {
          const csv = responsesCsv(item.data, rows, { includeEmail: withEmail.checked, flags });
          downloadFile(`questionario-${slugFile(item.title)}-${new Date().toISOString().slice(0, 10)}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
          return false;
        },
      },
    ],
  });
}

// Una persona da ricontattare diventa un contatto dell'idea, una volta per indirizzo.
async function addContacts(item, entries) {
  let added = 0;
  for (const entry of entries) {
    await createItem(
      'contact',
      {
        title: entry.persona ? `${entry.persona} (risposta ${entry.n})` : `Risposta ${entry.n} al questionario`,
        status: 'da_contattare',
        idea_id: item.idea_id,
        data: {
          purpose: 'cliente',
          role: entry.persona || undefined,
          via: `Questionario «${item.title}»`,
          contact: entry.email,
          notes: `La persona ha chiesto di essere ricontattata nella risposta ${entry.n} del ${fmtDate(entry.created_at)}.`,
        },
      },
      `Dal questionario «${item.title}»`,
    );
    added += 1;
  }
  return added;
}

function contactsCard(item, rows, { writable, rerender }) {
  const { fresh, already } = contactCandidates(item.data, rows, itemsOf('contact', { ideaId: item.idea_id }));
  const total = fresh.length + already.length;
  if (!total) return null;
  const addButton = writable && fresh.length ? h('button', { type: 'button', class: 'btn btn-primary' }, icon('users', 16), h('span', null, `Aggiungi ai Contatti (${fresh.length})`)) : null;
  addButton?.addEventListener(
    'click',
    busy(addButton, async () => {
      try {
        const added = await addContacts(item, fresh);
        toast(`${plural(added, 'persona aggiunta', 'persone aggiunte')} ai Contatti.`, { type: 'success' });
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
      rerender();
    }),
  );
  return h(
    'section',
    { class: 'card stack sv-contacts' },
    h('h2', null, 'Persone da ricontattare'),
    h('p', null, `${plural(total, 'persona ha', 'persone hanno')} lasciato l'email per essere ricontattat${total === 1 ? 'a' : 'e'}${already.length ? `; ${already.length} già nei Contatti` : ''}.`),
    h(
      'ul',
      { class: 'sv-people' },
      [...fresh, ...already].map((c) =>
        h('li', null, h('span', null, c.email), c.persona ? h('span', { class: 'muted small' }, ` · ${c.persona}`) : null, already.includes(c) ? h('span', { class: 'badge badge-ok' }, 'già nei Contatti') : null),
      ),
    ),
    addButton,
    fresh.length ? h('p', { class: 'muted small' }, 'Ogni persona diventa un contatto dell\'idea «da contattare», con l\'email e il questionario da cui arriva.') : null,
  );
}

export function resultsPanel(item, { writable }) {
  const host = h('div', { class: 'stack survey-results' }, loading());
  const view = { exclude: false, responses: [], funnel: null };

  async function load() {
    try {
      const [funnel, rows] = await Promise.all([api.surveyFunnel(item.id), api.listSurveyResponses(item.id)]);
      view.funnel = funnel;
      view.responses = numberResponses(rows);
      render();
    } catch (error) {
      mount(host, errorBox(error));
    }
  }

  async function deleteOne(response) {
    const ok = await confirmDialog(`La risposta ${response.n} verrà cancellata per sempre.`, { title: 'Cancellare la risposta?', okLabel: 'Cancella', danger: true });
    if (!ok) return;
    try {
      await api.deleteSurveyResponses(item.id, [response.id]);
      toast('Risposta cancellata.', { type: 'success' });
      await load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  async function deleteAll() {
    const ok = await confirmDialog(`Tutte le ${view.responses.length} risposte verranno cancellate per sempre, insieme al conteggio di visite e inizi.`, { title: 'Cancellare tutte le risposte?', okLabel: 'Cancella tutte', danger: true });
    if (!ok) return;
    try {
      const n = await api.deleteSurveyResponses(item.id);
      toast(`${plural(n, 'risposta cancellata', 'risposte cancellate')}.`, { type: 'success' });
      await load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  function render() {
    const survey = item.data;
    const all = view.responses;
    const flags = qualityFlags(survey, all);
    const rows = view.exclude ? withoutFlagged(all, flags) : all;
    const stats = questionStats(survey, rows);
    const refresh = h('button', { type: 'button', class: 'btn btn-small btn-ghost' }, icon('restore', 14), h('span', null, 'Aggiorna'));
    refresh.addEventListener('click', busy(refresh, load));
    const removeAll = writable && all.length ? h('button', { type: 'button', class: 'btn btn-small btn-ghost sv-danger' }, icon('trash', 14), h('span', null, 'Cancella tutte le risposte')) : null;
    removeAll?.addEventListener('click', busy(removeAll, deleteAll));
    let number = 0;
    mount(
      host,
      h('p', { class: 'banner sv-sample' }, 'Chi risponde a un link condiviso non è un campione rappresentativo: questi numeri descrivono chi ha risposto, non tutte le persone del vostro target. Servono soprattutto a trovare chi intervistare.'),
      h(
        'div',
        { class: 'toolbar toolbar-wrap' },
        refresh,
        all.length ? h('button', { type: 'button', class: 'btn btn-small', onClick: () => openCsvDialog(item, rows, flags) }, icon('download', 14), h('span', null, 'Scarica CSV')) : null,
        removeAll,
      ),
      funnelCard(funnelSteps(view.funnel)),
      all.length
        ? [
            qualityCard(flags, view.exclude, (value) => {
              view.exclude = value;
              render();
            }),
            durationCard(durationStats(rows)),
            contactsCard(item, rows, { writable, rerender: render }),
            h('h2', { class: 'section-title' }, `Domande (${plural(rows.length, 'risposta', 'risposte')}${view.exclude ? ', senza le segnalate' : ''})`),
            stats.map((stat) => questionCard(stat, (number += 1))),
            h(
              'section',
              { class: 'stack' },
              h('h2', null, `Singole risposte (${rows.length})`),
              rows.map((r) => responseDetails(survey, r, flags, { writable, onDelete: deleteOne })),
            ),
          ]
        : h('div', { class: 'empty' }, h('p', null, 'Ancora nessuna risposta. Aprite il questionario e condividete il link dalla scheda Condividi.')),
    );
  }

  load();
  return { el: host, reload: load };
}
