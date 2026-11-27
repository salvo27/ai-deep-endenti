import { h, mount, svg } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { shortId } from '../lib/format.js';
import { tx } from '../i18n/index.js';
import { IMPORTANCE, optionLabel } from '../schema.js';
import { conceptButton } from './concept-help.js';
import { fieldsGrid } from './components.js';

const IMPORTANCE_ORDER = { alta: 0, media: 1, bassa: 2 };
const importanceDef = { options: IMPORTANCE };
// Stored keys: the column of "us" in the comparison cells and the type of each competitor.
const US = 'noi';
const DIRECT = 'diretto';
const INDIRECT = 'indiretto';

const columnsOf = (data) => [{ id: US, name: tx.analysis.competitors.us, type: US }, ...(data.rivals || [])];

export function benchmarkTable(data) {
  const texts = tx.analysis.competitors;
  const features = [...(data.features || [])].sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance]);
  if (!features.length) return h('p', { class: 'muted' }, texts.noFeatures);
  const columns = columnsOf(data);
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'table benchmark' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, texts.feature),
          h('th', null, texts.importance),
          columns.map((col) => h('th', { class: col.id === US && 'is-us', title: col.type === INDIRECT ? texts.indirectHint : undefined }, col.name, col.type === INDIRECT ? h('span', { class: 'muted small' }, ` ${texts.indirectShort}`) : null)),
        ),
      ),
      h(
        'tbody',
        null,
        features.map((f) =>
          h(
            'tr',
            null,
            h('th', { scope: 'row' }, f.label),
            h('td', null, h('span', { class: ['badge', f.importance === 'alta' ? 'badge-strong' : 'badge-soft'] }, optionLabel(importanceDef, f.importance))),
            columns.map((col) => {
              const has = data.cells?.[`${f.id}:${col.id}`] === true;
              return h('td', { class: ['bm-cell', has && 'has', col.id === US && 'is-us'], 'aria-label': has ? tx.common.states.yes : tx.common.states.no }, has ? icon('check', 16) : h('span', { class: 'muted' }, '-'));
            }),
          ),
        ),
      ),
    ),
  );
}

export function positionChart(data) {
  const texts = tx.analysis.competitors;
  const points = columnsOf(data)
    .map((col) => ({ ...col, ...(col.id === US ? data.us || {} : {}) }))
    .filter((p) => Number.isInteger(p.x) && Number.isInteger(p.y));
  const axes = data.axes || {};
  if (!points.length) return h('p', { class: 'muted' }, texts.noPositions);
  const px = (x) => 30 + x * 26;
  const py = (y) => 290 - y * 26;
  const shapes = [
    svg('line', { x1: 30, y1: 160, x2: 290, y2: 160, class: 'pc-axis' }),
    svg('line', { x1: 160, y1: 30, x2: 160, y2: 290, class: 'pc-axis' }),
    svg('text', { x: 30, y: 178, class: 'pc-axis-label' }, axes.x?.low || ''),
    svg('text', { x: 290, y: 178, class: 'pc-axis-label', 'text-anchor': 'end' }, axes.x?.high || ''),
    svg('text', { x: 166, y: 290, class: 'pc-axis-label' }, axes.y?.low || ''),
    svg('text', { x: 166, y: 40, class: 'pc-axis-label' }, axes.y?.high || ''),
  ];
  for (const p of points) {
    const us = p.id === US;
    shapes.push(svg('circle', { cx: px(p.x), cy: py(p.y), r: us ? 8 : 6, class: us ? 'pc-us' : p.type === INDIRECT ? 'pc-indirect' : 'pc-direct' }));
    shapes.push(svg('text', { x: px(p.x), y: py(p.y) - 11, class: ['pc-name', us && 'is-us'].filter(Boolean).join(' '), 'text-anchor': 'middle' }, p.name));
  }
  const missing = columnsOf(data).filter((col) => !points.some((p) => p.id === col.id));
  return h(
    'figure',
    { class: 'position-chart' },
    svg('svg', { viewBox: '0 0 320 320', role: 'img', 'aria-label': texts.chartLabel(axes.x?.label || texts.horizontalAxis, axes.y?.label || texts.verticalAxis) }, ...shapes),
    h(
      'figcaption',
      { class: 'muted small' },
      texts.caption(axes.x?.label || '-', axes.y?.label || '-'),
      missing.length ? ` · ${texts.noPosition(missing.map((m) => m.name).join(', '))}` : '',
    ),
  );
}

export function competitorsView(item) {
  const texts = tx.analysis.competitors;
  const data = item.data;
  const rivals = data.rivals || [];
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'section-label' }, texts.comparison, conceptButton('benchmarking')),
    benchmarkTable(data),
    h('div', { class: 'competitors-bottom' }, positionChart(data), rivals.length
      ? h(
          'ul',
          { class: 'list rival-list' },
          rivals.map((r) => h('li', null, h('strong', null, r.name), h('span', { class: 'badge badge-soft' }, r.type === INDIRECT ? texts.indirect : texts.direct), r.note ? h('span', { class: 'muted small' }, r.note) : null)),
        )
      : null),
    fieldsGrid(item),
  );
}

const newId = (prefix) => `${prefix}-${shortId().slice(0, 8)}`;

function numberInput(value, onSet, label, placeholder = '') {
  return h('input', {
    placeholder,
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

export function competitorsEditor(working, onChange) {
  const texts = tx.analysis.competitors;
  const d = working.data;
  d.rivals = d.rivals || [];
  d.features = d.features || [];
  d.cells = d.cells || {};
  d.axes = d.axes || { x: {}, y: {} };
  d.axes.x = d.axes.x || {};
  d.axes.y = d.axes.y || {};
  d.us = d.us || {};

  const rivalsHost = h('div', { class: 'stack' });
  const featuresHost = h('div', { class: 'stack' });
  const matrixHost = h('div');

  const renderMatrix = () => {
    const columns = columnsOf(d);
    mount(
      matrixHost,
      d.features.length
        ? h(
            'div',
            { class: 'table-scroll' },
            h(
              'table',
              { class: 'table benchmark' },
              h('thead', null, h('tr', null, h('th', null, texts.whoOffers), columns.map((col) => h('th', { class: col.id === US && 'is-us' }, col.name || texts.unnamed)))),
              h(
                'tbody',
                null,
                d.features.map((f) =>
                  h(
                    'tr',
                    null,
                    h('th', { scope: 'row' }, f.label || texts.unnamed),
                    columns.map((col) => {
                      const key = `${f.id}:${col.id}`;
                      return h(
                        'td',
                        { class: 'bm-cell' },
                        h('input', {
                          type: 'checkbox',
                          checked: d.cells[key] === true,
                          'aria-label': texts.offeredBy(f.label, col.name),
                          onChange: (e) => {
                            if (e.target.checked) d.cells[key] = true;
                            else delete d.cells[key];
                            onChange();
                          },
                        }),
                      );
                    }),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted small' }, texts.addFeaturesFirst),
    );
  };

  const renderRivals = () => {
    mount(
      rivalsHost,
      d.rivals.map((rival, index) =>
        h(
          'div',
          { class: 'edit-row' },
          h('input', { class: 'input', type: 'text', maxlength: 80, value: rival.name || '', placeholder: texts.rivalName, 'aria-label': texts.rivalName, onInput: (e) => { rival.name = e.target.value; onChange(); renderMatrix(); } }),
          h(
            'select',
            { class: 'input input-small', 'aria-label': texts.rivalType, onChange: (e) => { rival.type = e.target.value; onChange(); } },
            h('option', { value: DIRECT, selected: rival.type !== INDIRECT }, texts.direct),
            h('option', { value: INDIRECT, selected: rival.type === INDIRECT }, texts.indirect),
          ),
          numberInput(rival.x, (v) => { rival.x = v; onChange(); }, texts.horizontalOf(rival.name), texts.horizontalShort),
          numberInput(rival.y, (v) => { rival.y = v; onChange(); }, texts.verticalOf(rival.name), texts.verticalShort),
          h('input', { class: 'input', type: 'text', maxlength: 300, value: rival.note || '', placeholder: texts.notePlaceholder, 'aria-label': texts.noteLabel, onInput: (e) => { rival.note = e.target.value; onChange(); } }),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': texts.remove(rival.name || texts.rival), onClick: () => {
            d.rivals.splice(index, 1);
            for (const key of Object.keys(d.cells)) if (key.endsWith(`:${rival.id}`)) delete d.cells[key];
            onChange();
            renderAll();
          } }, icon('close', 14)),
        ),
      ),
      d.rivals.length < 15
        ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => { d.rivals.push({ id: newId('c'), name: '', type: DIRECT }); renderAll(); } }, icon('plus', 14), h('span', null, texts.addRival))
        : h('p', { class: 'muted small' }, texts.maxRivals),
    );
  };

  const renderFeatures = () => {
    mount(
      featuresHost,
      d.features.map((feature, index) =>
        h(
          'div',
          { class: 'edit-row' },
          h('input', { class: 'input', type: 'text', maxlength: 120, value: feature.label || '', placeholder: texts.featurePlaceholder, 'aria-label': texts.feature, onInput: (e) => { feature.label = e.target.value; onChange(); renderMatrix(); } }),
          h(
            'select',
            { class: 'input input-small', 'aria-label': texts.importanceLabel, onChange: (e) => { feature.importance = e.target.value; onChange(); } },
            IMPORTANCE.map(([value, label]) => h('option', { value, selected: (feature.importance || 'media') === value }, texts.importanceOption(label))),
          ),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': texts.remove(feature.label || texts.featureWord), onClick: () => {
            d.features.splice(index, 1);
            for (const key of Object.keys(d.cells)) if (key.startsWith(`${feature.id}:`)) delete d.cells[key];
            onChange();
            renderAll();
          } }, icon('close', 14)),
        ),
      ),
      d.features.length < 20
        ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => { d.features.push({ id: newId('f'), label: '', importance: 'alta' }); renderAll(); } }, icon('plus', 14), h('span', null, texts.addFeature))
        : null,
    );
  };

  const renderAll = () => {
    renderRivals();
    renderFeatures();
    renderMatrix();
  };

  const axisInputs = (axis, name) =>
    h(
      'div',
      { class: 'edit-row' },
      h('span', { class: 'field-label' }, name),
      ['label', 'low', 'high'].map((prop) =>
        h('input', {
          class: 'input',
          type: 'text',
          maxlength: prop === 'label' ? 60 : 40,
          value: d.axes[axis][prop] || '',
          placeholder: texts.axisPlaceholders[prop],
          'aria-label': `${name}: ${texts.axisPlaceholders[prop]}`,
          onInput: (e) => { d.axes[axis][prop] = e.target.value; onChange(); },
        }),
      ),
    );

  renderAll();
  return h(
    'div',
    { class: 'competitors-editor stack' },
    h('section', { class: 'stack' }, h('h2', { class: 'form-group-title' }, texts.rivalsTitle, conceptButton('concorrenti')), h('p', { class: 'muted small' }, texts.rivalsHelp), rivalsHost),
    h('section', { class: 'stack' }, h('h2', { class: 'form-group-title' }, texts.featuresTitle, conceptButton('benchmarking')), h('p', { class: 'muted small' }, texts.featuresHelp), featuresHost),
    h('section', { class: 'stack' }, h('h2', { class: 'form-group-title' }, texts.comparison), matrixHost),
    h(
      'section',
      { class: 'stack' },
      h('h2', { class: 'form-group-title' }, texts.chartTitle),
      axisInputs('x', texts.horizontal),
      axisInputs('y', texts.vertical),
      h('div', { class: 'edit-row' }, h('span', { class: 'field-label' }, texts.ourPosition), numberInput(d.us.x, (v) => { d.us.x = v; onChange(); }, texts.ourHorizontal, texts.horizontalShort), numberInput(d.us.y, (v) => { d.us.y = v; onChange(); }, texts.ourVertical, texts.verticalShort)),
    ),
  );
}
