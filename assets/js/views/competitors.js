import { h, mount, svg } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { shortId } from '../lib/format.js';
import { IMPORTANCE, optionLabel } from '../schema.js';
import { conceptButton } from './concept-help.js';
import { fieldsGrid } from './components.js';

const IMPORTANCE_ORDER = { alta: 0, media: 1, bassa: 2 };
const importanceDef = { options: IMPORTANCE };
const US = 'noi';

const columnsOf = (data) => [{ id: US, name: 'Noi', type: 'noi' }, ...(data.rivals || [])];

export function benchmarkTable(data) {
  const features = [...(data.features || [])].sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance]);
  if (!features.length) return h('p', { class: 'muted' }, 'Nessuna funzionalità da confrontare.');
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
          h('th', null, 'Funzionalità'),
          h('th', null, 'Importanza'),
          columns.map((col) => h('th', { class: col.id === US && 'is-us', title: col.type === 'indiretto' ? 'Concorrente indiretto' : undefined }, col.name, col.type === 'indiretto' ? h('span', { class: 'muted small' }, ' (ind.)') : null)),
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
              return h('td', { class: ['bm-cell', has && 'has', col.id === US && 'is-us'], 'aria-label': has ? 'sì' : 'no' }, has ? icon('check', 16) : h('span', { class: 'muted' }, '-'));
            }),
          ),
        ),
      ),
    ),
  );
}

export function positionChart(data) {
  const points = columnsOf(data)
    .map((col) => ({ ...col, ...(col.id === US ? data.us || {} : {}) }))
    .filter((p) => Number.isInteger(p.x) && Number.isInteger(p.y));
  const axes = data.axes || {};
  if (!points.length) return h('p', { class: 'muted' }, 'Indica la posizione dei concorrenti per vedere il grafico.');
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
    shapes.push(svg('circle', { cx: px(p.x), cy: py(p.y), r: us ? 8 : 6, class: us ? 'pc-us' : p.type === 'indiretto' ? 'pc-indirect' : 'pc-direct' }));
    shapes.push(svg('text', { x: px(p.x), y: py(p.y) - 11, class: ['pc-name', us && 'is-us'].filter(Boolean).join(' '), 'text-anchor': 'middle' }, p.name));
  }
  const missing = columnsOf(data).filter((col) => !points.some((p) => p.id === col.id));
  return h(
    'figure',
    { class: 'position-chart' },
    svg('svg', { viewBox: '0 0 320 320', role: 'img', 'aria-label': `Grafico: ${axes.x?.label || 'asse orizzontale'} e ${axes.y?.label || 'asse verticale'}` }, ...shapes),
    h(
      'figcaption',
      { class: 'muted small' },
      `Orizzontale: ${axes.x?.label || '-'} · Verticale: ${axes.y?.label || '-'}`,
      missing.length ? ` · Senza posizione: ${missing.map((m) => m.name).join(', ')}` : '',
    ),
  );
}

export function competitorsView(item) {
  const data = item.data;
  const rivals = data.rivals || [];
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'section-label' }, 'Tabella di confronto', conceptButton('benchmarking')),
    benchmarkTable(data),
    h('div', { class: 'competitors-bottom' }, positionChart(data), rivals.length
      ? h(
          'ul',
          { class: 'list rival-list' },
          rivals.map((r) => h('li', null, h('strong', null, r.name), h('span', { class: 'badge badge-soft' }, r.type === 'indiretto' ? 'Indiretto' : 'Diretto'), r.note ? h('span', { class: 'muted small' }, r.note) : null)),
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
              h('thead', null, h('tr', null, h('th', null, 'Chi offre cosa'), columns.map((col) => h('th', { class: col.id === US && 'is-us' }, col.name || 'Senza nome')))),
              h(
                'tbody',
                null,
                d.features.map((f) =>
                  h(
                    'tr',
                    null,
                    h('th', { scope: 'row' }, f.label || 'Senza nome'),
                    columns.map((col) => {
                      const key = `${f.id}:${col.id}`;
                      return h(
                        'td',
                        { class: 'bm-cell' },
                        h('input', {
                          type: 'checkbox',
                          checked: d.cells[key] === true,
                          'aria-label': `${f.label} offerta da ${col.name}`,
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
        : h('p', { class: 'muted small' }, 'Aggiungi le funzionalità per compilare la tabella.'),
    );
  };

  const renderRivals = () => {
    mount(
      rivalsHost,
      d.rivals.map((rival, index) =>
        h(
          'div',
          { class: 'edit-row' },
          h('input', { class: 'input', type: 'text', maxlength: 80, value: rival.name || '', placeholder: 'Nome del concorrente', 'aria-label': 'Nome del concorrente', onInput: (e) => { rival.name = e.target.value; onChange(); renderMatrix(); } }),
          h(
            'select',
            { class: 'input input-small', 'aria-label': 'Tipo di concorrente', onChange: (e) => { rival.type = e.target.value; onChange(); } },
            h('option', { value: 'diretto', selected: rival.type !== 'indiretto' }, 'Diretto'),
            h('option', { value: 'indiretto', selected: rival.type === 'indiretto' }, 'Indiretto'),
          ),
          numberInput(rival.x, (v) => { rival.x = v; onChange(); }, `Posizione orizzontale di ${rival.name}`, 'Oriz.'),
          numberInput(rival.y, (v) => { rival.y = v; onChange(); }, `Posizione verticale di ${rival.name}`, 'Vert.'),
          h('input', { class: 'input', type: 'text', maxlength: 300, value: rival.note || '', placeholder: 'Nota: prezzo, punti di forza', 'aria-label': 'Nota sul concorrente', onInput: (e) => { rival.note = e.target.value; onChange(); } }),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Togli ${rival.name || 'concorrente'}`, onClick: () => {
            d.rivals.splice(index, 1);
            for (const key of Object.keys(d.cells)) if (key.endsWith(`:${rival.id}`)) delete d.cells[key];
            onChange();
            renderAll();
          } }, icon('close', 14)),
        ),
      ),
      d.rivals.length < 15
        ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => { d.rivals.push({ id: newId('c'), name: '', type: 'diretto' }); renderAll(); } }, icon('plus', 14), h('span', null, 'Aggiungi un concorrente'))
        : h('p', { class: 'muted small' }, 'Massimo 15 concorrenti: tieni quelli che contano per il cliente.'),
    );
  };

  const renderFeatures = () => {
    mount(
      featuresHost,
      d.features.map((feature, index) =>
        h(
          'div',
          { class: 'edit-row' },
          h('input', { class: 'input', type: 'text', maxlength: 120, value: feature.label || '', placeholder: 'Funzionalità che conta per il cliente', 'aria-label': 'Funzionalità', onInput: (e) => { feature.label = e.target.value; onChange(); renderMatrix(); } }),
          h(
            'select',
            { class: 'input input-small', 'aria-label': 'Importanza per il cliente', onChange: (e) => { feature.importance = e.target.value; onChange(); } },
            IMPORTANCE.map(([value, label]) => h('option', { value, selected: (feature.importance || 'media') === value }, `Importanza ${label.toLowerCase()}`)),
          ),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Togli ${feature.label || 'funzionalità'}`, onClick: () => {
            d.features.splice(index, 1);
            for (const key of Object.keys(d.cells)) if (key.startsWith(`${feature.id}:`)) delete d.cells[key];
            onChange();
            renderAll();
          } }, icon('close', 14)),
        ),
      ),
      d.features.length < 20
        ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => { d.features.push({ id: newId('f'), label: '', importance: 'alta' }); renderAll(); } }, icon('plus', 14), h('span', null, 'Aggiungi una funzionalità'))
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
          placeholder: { label: 'Cosa misura', low: 'Valore basso (0)', high: 'Valore alto (10)' }[prop],
          'aria-label': `${name}: ${prop}`,
          onInput: (e) => { d.axes[axis][prop] = e.target.value; onChange(); },
        }),
      ),
    );

  renderAll();
  return h(
    'div',
    { class: 'competitors-editor stack' },
    h('section', { class: 'stack' }, h('h2', { class: 'form-group-title' }, 'Concorrenti', conceptButton('concorrenti')), h('p', { class: 'muted small' }, 'Diretti e indiretti. Le due cifre (da 0 a 10) sono la posizione nel grafico.'), rivalsHost),
    h('section', { class: 'stack' }, h('h2', { class: 'form-group-title' }, 'Funzionalità da confrontare', conceptButton('benchmarking')), h('p', { class: 'muted small' }, 'Solo quelle importanti per il cliente; evita quelle che hanno tutti.'), featuresHost),
    h('section', { class: 'stack' }, h('h2', { class: 'form-group-title' }, 'Tabella di confronto'), matrixHost),
    h(
      'section',
      { class: 'stack' },
      h('h2', { class: 'form-group-title' }, 'Grafico a due assi'),
      axisInputs('x', 'Asse orizzontale'),
      axisInputs('y', 'Asse verticale'),
      h('div', { class: 'edit-row' }, h('span', { class: 'field-label' }, 'La nostra posizione'), numberInput(d.us.x, (v) => { d.us.x = v; onChange(); }, 'Nostra posizione orizzontale', 'Oriz.'), numberInput(d.us.y, (v) => { d.us.y = v; onChange(); }, 'Nostra posizione verticale', 'Vert.')),
    ),
  );
}
