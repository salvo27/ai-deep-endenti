import { busy, confirmDialog, h, mount, openModal, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { dayKey, downloadFile, fmtDate, fmtDateTime, slugFile } from '../lib/format.js';
import { api } from '../lib/api.js';
import { language, locale, tx } from '../i18n/index.js';
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
  isRushed,
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

const t = tx.surveyEditor;
const texts = t.results;

// Valori salvati: restano in italiano in ogni lingua.
const TO_CONTACT = 'da_contattare'; // i18n-ignore

// Excel divide le colonne con «;» se il computer è impostato in italiano, con «,» se è in inglese.
const CSV_SEPARATOR = language === 'it' ? ';' : ',';

// Mediane, minimi e massimi con i decimali e le migliaia della lingua in uso.
const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const num = (value) => numberFormat.format(value);

// Percentuale sempre con il numero accanto: «45% (9 su 20)».
const shareText = (count, total) => `${fmtShare(share(count, total))} (${texts.ofTotal(count, total)})`;

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
    h('h2', null, texts.funnel),
    h('div', { class: 'sv-bars' }, funnel.steps.map((step) => bar(step.label, step.count, top))),
    h(
      'p',
      { class: 'small' },
      h('strong', null, texts.completion(fmtShare(funnel.completionRate))),
      ' ',
      texts.funnelNote(funnel.steps[3].count, funnel.starts),
    ),
  );
}

function textList(stat, label) {
  const items = stat.map((x) => h('li', { dataset: { text: x.text.toLowerCase() } }, h('span', { class: 'muted small' }, `${texts.response(x.n)}: `), h('span', { class: 'text-block' }, x.text)));
  const list = h('ul', { class: 'sv-texts' }, items);
  const search = h('input', {
    class: 'input input-small',
    type: 'search',
    placeholder: texts.search,
    'aria-label': texts.searchIn(label),
    onInput: (e) => {
      const needle = e.target.value.trim().toLowerCase();
      for (const li of items) li.hidden = Boolean(needle) && !li.dataset.text.includes(needle);
    },
  });
  return h('div', { class: 'stack' }, stat.length > 3 ? search : null, list);
}

function questionCard(stat, number) {
  const q = stat.question;
  const other = q.other_label || t.other;
  const base = h(
    'p',
    { class: 'muted small' },
    `${texts.answered(stat.answered, stat.reached)} · ${texts.noAnswer(shareText(stat.skipped, stat.reached))}`,
    stat.breakoff ? ` · ${texts.stoppedHere(stat.breakoff)}` : '',
    stat.rushed ? h('span', { class: 'sv-rushed', title: texts.rushedHint }, ` · ${texts.rushed(stat.rushed)}`) : null,
  );
  let body = null;
  if (stat.options) {
    body = h(
      'div',
      { class: 'sv-bars' },
      stat.options.map((o) => bar(o.label, o.count, stat.answered)),
      q.allow_other ? bar(other, stat.other.length, stat.answered) : null,
      q.prefer_not ? bar(t.preferNotToSay, stat.preferNot, stat.answered) : null,
      stat.multiple ? h('p', { class: 'muted small' }, texts.multiple) : null,
      stat.other.length ? h('details', { class: 'sv-other' }, h('summary', null, texts.otherTexts(other, stat.other.length)), textList(stat.other, `${q.label}, ${other}`)) : null,
    );
  } else if (stat.distribution) {
    const label = Number.isInteger(stat.median) ? scaleLabel(q, stat.median) : '';
    body = h(
      'div',
      { class: 'sv-bars' },
      stat.distribution.map((d) => bar(`${d.value}${d.label ? ` ${d.label}` : ''}`, d.count, stat.answered)),
      h('p', { class: 'small' }, stat.median === null ? texts.median('-') : `${texts.median(num(stat.median))}${label ? ` (${label})` : ''} · n = ${stat.answered}`),
    );
  } else if (q.type === 'numero') {
    body = h('p', { class: 'small' }, stat.answered ? `${texts.numberSummary({ median: num(stat.median), min: num(stat.min), max: num(stat.max) })} · n = ${stat.answered}` : texts.noAnswers);
  } else if (q.type === 'email') {
    body = h('p', { class: 'small' }, texts.emails(stat.answered, stat.recontact));
  } else {
    body = stat.texts.length ? textList(stat.texts, q.label) : h('p', { class: 'muted small' }, texts.noAnswers);
  }
  return h('article', { class: 'card stack sv-question', dataset: { id: q.id } }, h('h3', null, `${t.questionNumber(number)}. ${q.label}`), base, body);
}

function durationCard(stats) {
  return h(
    'section',
    { class: 'card stack' },
    h('h2', null, texts.duration),
    stats.n
      ? [
          h('p', null, h('strong', null, texts.median(fmtDuration(stats.median))), ` ${texts.completeRuns(stats.n)}`),
          h('ul', { class: 'sv-devices' }, stats.byDevice.map((d) => h('li', null, `${DEVICE_LABELS[d.device] || texts.unknownDevice}: ${fmtDuration(d.median)} (n = ${d.n})`))),
        ]
      : h('p', { class: 'muted small' }, texts.noDurations),
  );
}

function qualityCard(flags, exclude, onToggle) {
  const counts = flagCounts(flags);
  const toggle = h('input', { type: 'checkbox', checked: exclude, onChange: (e) => onToggle(e.target.checked) });
  return h(
    'section',
    { class: 'card stack sv-quality' },
    h('h2', null, texts.quality),
    h('label', { class: 'check' }, toggle, texts.excludeFlagged(flags.size)),
    flags.size
      ? h('ul', { class: 'sv-flag-list' }, Object.entries(counts).filter(([, n]) => n).map(([code, n]) => h('li', null, `${FLAG_LABELS[code]}: ${n}`)))
      : h('p', { class: 'muted small' }, texts.noFlags),
    h('p', { class: 'muted small' }, texts.qualityNote),
  );
}

function responseDetails(survey, response, flags, { writable, onDelete }) {
  const status = response.completed ? texts.complete : texts.unfinished;
  const parts = [texts.response(response.n), fmtDateTime(response.created_at), status];
  if (Number.isFinite(response.duration_seconds)) parts.push(fmtDuration(response.duration_seconds));
  if (response.device) parts.push(DEVICE_LABELS[response.device] || response.device);
  const remove = writable ? h('button', { type: 'button', class: 'btn btn-small btn-ghost' }, icon('trash', 14), h('span', null, texts.deleteOne)) : null;
  remove?.addEventListener('click', busy(remove, () => onDelete(response)));
  const { yes, no } = tx.common.states;
  return h(
    'details',
    { class: 'sv-response', dataset: { n: String(response.n) } },
    h('summary', null, parts.join(' · '), (flags.get(response.n) || []).map((code) => h('span', { class: 'badge badge-warn', title: FLAG_LABELS[code] }, FLAG_LABELS[code]))),
    h(
      'dl',
      { class: 'sv-answers' },
      askedQuestions(survey).map((q) => {
        const value = answerText(q, response, { scaleWithLabel: true });
        const rushed = isRushed(q, response) ? h('span', { class: 'badge badge-warn sv-rushed-badge', title: texts.rushedBadgeHint }, texts.rushedBadge) : null;
        return [h('dt', null, q.label), h('dd', { class: value === null ? 'muted' : 'text-block' }, value === null ? '-' : String(value), rushed)];
      }),
      response.email ? [h('dt', null, texts.contactAgain), h('dd', null, (response.recontact ? yes : no).toLowerCase())] : null,
    ),
    remove,
  );
}

function openCsvDialog(item, rows, flags) {
  const withEmail = h('input', { type: 'checkbox' });
  openModal({
    title: texts.csvTitle,
    body: h(
      'div',
      { class: 'stack' },
      h('p', null, texts.csvIntro(rows.length)),
      h('label', { class: 'check' }, withEmail, texts.csvEmails),
      h('p', { class: 'muted small' }, texts.csvEmailsNote),
    ),
    actions: [
      { label: tx.common.actions.cancel, value: false },
      {
        label: tx.common.actions.download,
        kind: 'primary',
        onClick: () => {
          const csv = responsesCsv(item.data, rows, { includeEmail: withEmail.checked, flags, separator: CSV_SEPARATOR });
          downloadFile(texts.csvFile(slugFile(item.title), dayKey(new Date())), `﻿${csv}`, 'text/csv;charset=utf-8');
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
        title: entry.persona ? texts.contactTitle(entry.persona, entry.n) : texts.contactTitleAnonymous(entry.n),
        status: TO_CONTACT,
        idea_id: item.idea_id,
        data: {
          purpose: 'cliente',
          role: entry.persona || undefined,
          via: texts.contactVia(item.title),
          contact: entry.email,
          notes: texts.contactNotes(entry.n, fmtDate(entry.created_at)),
        },
      },
      texts.contactMessage(item.title),
    );
    added += 1;
  }
  return added;
}

function contactsCard(item, rows, { writable, rerender }) {
  const { fresh, already } = contactCandidates(item.data, rows, itemsOf('contact', { ideaId: item.idea_id }));
  const total = fresh.length + already.length;
  if (!total) return null;
  const addButton = writable && fresh.length ? h('button', { type: 'button', class: 'btn btn-primary' }, icon('users', 16), h('span', null, texts.addToContacts(fresh.length))) : null;
  addButton?.addEventListener(
    'click',
    busy(addButton, async () => {
      try {
        const added = await addContacts(item, fresh);
        toast(texts.added(added), { type: 'success' });
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
      rerender();
    }),
  );
  return h(
    'section',
    { class: 'card stack sv-contacts' },
    h('h2', null, texts.people),
    h('p', null, texts.leftEmail(total, already.length)),
    h(
      'ul',
      { class: 'sv-people' },
      [...fresh, ...already].map((c) =>
        h('li', null, h('span', null, c.email), c.persona ? h('span', { class: 'muted small' }, ' · ', c.persona) : null, already.includes(c) ? h('span', { class: 'badge badge-ok' }, texts.alreadyInContacts) : null),
      ),
    ),
    addButton,
    fresh.length ? h('p', { class: 'muted small' }, texts.contactsHelp) : null,
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
    const ok = await confirmDialog(texts.deleteOneText(response.n), { title: texts.deleteOneTitle, okLabel: texts.deleteOk, danger: true });
    if (!ok) return;
    try {
      await api.deleteSurveyResponses(item.id, [response.id]);
      toast(texts.deletedOne, { type: 'success' });
      await load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  async function deleteAll() {
    const ok = await confirmDialog(texts.deleteAllText(view.responses.length), { title: texts.deleteAllTitle, okLabel: texts.deleteAllOk, danger: true });
    if (!ok) return;
    try {
      const n = await api.deleteSurveyResponses(item.id);
      toast(texts.deleted(n), { type: 'success' });
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
    const refresh = h('button', { type: 'button', class: 'btn btn-small btn-ghost' }, icon('restore', 14), h('span', null, texts.refresh));
    refresh.addEventListener('click', busy(refresh, load));
    const removeAll = writable && all.length ? h('button', { type: 'button', class: 'btn btn-small btn-ghost sv-danger' }, icon('trash', 14), h('span', null, texts.deleteAll)) : null;
    removeAll?.addEventListener('click', busy(removeAll, deleteAll));
    let number = 0;
    mount(
      host,
      h('p', { class: 'banner sv-sample' }, texts.sample),
      h(
        'div',
        { class: 'toolbar toolbar-wrap' },
        refresh,
        all.length ? h('button', { type: 'button', class: 'btn btn-small', onClick: () => openCsvDialog(item, rows, flags) }, icon('download', 14), h('span', null, texts.downloadCsv)) : null,
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
            h('h2', { class: 'section-title' }, texts.questionsTitle(rows.length, view.exclude)),
            stats.map((stat) => questionCard(stat, (number += 1))),
            h(
              'section',
              { class: 'stack' },
              h('h2', null, texts.single(rows.length)),
              rows.map((r) => responseDetails(survey, r, flags, { writable, onDelete: deleteOne })),
            ),
          ]
        : h('div', { class: 'empty' }, h('p', null, texts.empty)),
    );
  }

  load();
  return { el: host, reload: load };
}
