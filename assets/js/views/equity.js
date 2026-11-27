import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { fmtPercent, shortId } from '../lib/format.js';
import { equitySplit } from '../schema.js';
import { tx } from '../i18n/index.js';
import { conceptButton } from './concept-help.js';
import { fieldsGrid } from './components.js';

const t = tx.squad.equity;

function resultBars(data) {
  const split = equitySplit(data);
  if (!split.length) return h('p', { class: 'muted' }, t.noFounders);
  if (split.every((s) => s.percent === null)) return h('p', { class: 'muted' }, t.noScores);
  return h(
    'div',
    { class: 'equity-bars' },
    split.map((s) =>
      h(
        'div',
        { class: 'equity-bar' },
        h('span', { class: 'equity-name' }, s.name),
        h('span', { class: 'equity-track' }, h('span', { class: 'equity-fill', style: { width: `${s.percent || 0}%` } })),
        h('strong', null, fmtPercent(s.percent)),
      ),
    ),
  );
}

function scoreTable(data) {
  const factors = data.factors || [];
  const founders = data.founders || [];
  if (!factors.length || !founders.length) return null;
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, t.factor), h('th', null, t.weight), founders.map((f) => h('th', null, f.name)))),
      h(
        'tbody',
        null,
        factors.map((factor) =>
          h(
            'tr',
            null,
            h('th', { scope: 'row' }, factor.label),
            h('td', null, String(factor.weight)),
            founders.map((f) => h('td', null, String(data.scores?.[`${factor.key}:${f.id}`] ?? '-'))),
          ),
        ),
      ),
    ),
  );
}

export function equityView(item) {
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'section-label' }, t.method, conceptButton('demmler')),
    resultBars(item.data),
    scoreTable(item.data),
    h('p', { class: 'muted small' }, t.disclaimer),
    fieldsGrid(item),
  );
}

const newId = () => `f-${shortId().slice(0, 8)}`;

function scoreInput(value, onSet, label) {
  return h('input', {
    class: 'input input-small input-num',
    type: 'number',
    min: 0,
    max: 10,
    step: 1,
    value: Number.isInteger(value) ? value : '',
    'aria-label': label,
    onInput: (e) => onSet(e.target.value === '' ? undefined : Math.max(0, Math.min(10, Math.round(Number(e.target.value))))),
  });
}

export function equityEditor(working, onChange) {
  const d = working.data;
  d.factors = d.factors || [];
  d.founders = d.founders || [];
  d.scores = d.scores || {};
  const tableHost = h('div');
  const resultHost = h('div');
  const foundersHost = h('div', { class: 'stack' });

  const refreshResult = () => mount(resultHost, resultBars(d));
  const changed = () => {
    onChange();
    refreshResult();
  };

  const renderTable = () => {
    mount(
      tableHost,
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table equity-table' },
          h('thead', null, h('tr', null, h('th', null, t.factor), h('th', null, t.weightScale), d.founders.map((f) => h('th', null, f.name || t.noName)))),
          h(
            'tbody',
            null,
            d.factors.map((factor) =>
              h(
                'tr',
                null,
                h('th', { scope: 'row' }, h('input', { class: 'input input-small', type: 'text', maxlength: 60, value: factor.label, 'aria-label': t.factorName, onInput: (e) => { factor.label = e.target.value; onChange(); } })),
                h('td', null, scoreInput(factor.weight, (v) => { factor.weight = v ?? 0; changed(); }, t.weightOf(factor.label))),
                d.founders.map((f) =>
                  h(
                    'td',
                    null,
                    scoreInput(d.scores[`${factor.key}:${f.id}`], (v) => {
                      const key = `${factor.key}:${f.id}`;
                      if (v === undefined) delete d.scores[key];
                      else d.scores[key] = v;
                      changed();
                    }, t.scoreOf(f.name, factor.label)),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  };

  const renderFounders = () => {
    mount(
      foundersHost,
      d.founders.map((founder, index) =>
        h(
          'div',
          { class: 'edit-row' },
          h('input', { class: 'input', type: 'text', maxlength: 80, value: founder.name, placeholder: t.founderName, 'aria-label': t.founderName, onInput: (e) => { founder.name = e.target.value; changed(); renderTable(); } }),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': t.removeFounder(founder.name || t.founder), onClick: () => {
            d.founders.splice(index, 1);
            for (const key of Object.keys(d.scores)) if (key.endsWith(`:${founder.id}`)) delete d.scores[key];
            changed();
            renderFounders();
            renderTable();
          } }, icon('close', 14)),
        ),
      ),
      d.founders.length < 10
        ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => { d.founders.push({ id: newId(), name: '' }); renderFounders(); renderTable(); } }, icon('plus', 14), h('span', null, t.addFounder))
        : null,
    );
  };

  renderFounders();
  renderTable();
  refreshResult();
  return h(
    'div',
    { class: 'stack' },
    h('section', { class: 'stack' }, h('h2', { class: 'form-group-title' }, t.founders), foundersHost),
    h(
      'section',
      { class: 'stack' },
      h('h2', { class: 'form-group-title' }, t.weights, conceptButton('demmler')),
      h('p', { class: 'muted small' }, t.weightsHelp),
      tableHost,
    ),
    h('section', { class: 'stack' }, h('h2', { class: 'form-group-title' }, t.result), resultHost),
  );
}
