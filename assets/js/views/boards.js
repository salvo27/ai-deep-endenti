import { h, svg } from '../lib/dom.js';
import { fmtMoney, fmtPercent, truncate } from '../lib/format.js';
import { KINDS, TRL, fieldOf, optionLabel } from '../schema.js';
import { conceptButton } from './concept-help.js';
import { fieldsGrid, textBlock } from './components.js';

// Viste delle schede che hanno un disegno proprio. I dati arrivano già validati da sanitizeSnapshot.

export function trlScale(now, target) {
  const current = Number(now) || 0;
  const goal = Number(target) || 0;
  return h(
    'div',
    { class: 'trl' },
    h(
      'ol',
      { class: 'trl-steps', 'aria-label': 'Scala TRL' },
      TRL.map(([value, label]) => {
        const n = Number(value);
        return h(
          'li',
          { class: ['trl-step', n <= current && 'is-done', n === current && 'is-now', n === goal && 'is-target'], title: label },
          String(n),
        );
      }),
    ),
    h(
      'p',
      { class: 'small' },
      current ? h('strong', null, optionLabel(fieldOf('deeptech', 'trl_now'), String(current))) : 'TRL attuale non indicato',
      goal ? h('span', { class: 'muted' }, ` · prossima tappa: ${optionLabel(fieldOf('deeptech', 'trl_target'), String(goal))}`) : null,
    ),
  );
}

export function deeptechView(item) {
  return h('div', { class: 'stack' }, h('div', { class: 'section-label' }, 'Maturità della tecnologia', conceptButton('trl')), trlScale(item.data.trl_now, item.data.trl_target), fieldsGrid(item, { skip: ['trl_now', 'trl_target', 'group:Maturità della tecnologia'] }));
}

function block(title, text, extra = null) {
  return h('div', { class: 'vpc-block' }, h('h4', null, title), text ? textBlock(text) : h('p', { class: 'muted small' }, 'Da compilare'), extra);
}

export function vpcView(item) {
  const d = item.data;
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'vpc' },
      h(
        'section',
        { class: 'vpc-map', 'aria-label': 'Mappa del valore' },
        h('h3', null, 'Mappa del valore'),
        block('Prodotti e servizi', d.products),
        block('Come creiamo i gains', d.gain_creators),
        block('Come riduciamo i pains', d.pain_relievers),
      ),
      h('div', { class: 'vpc-fit', 'aria-hidden': 'true' }, '⇄'),
      h(
        'section',
        { class: 'vpc-profile', 'aria-label': 'Profilo del cliente' },
        h('h3', null, 'Profilo del cliente', d.segment ? h('span', { class: 'muted' }, ` · ${d.segment}`) : null),
        block('Gains: risultati desiderati', d.gains),
        block('Pains: difficoltà e rischi', d.pains),
        block('Jobs: cosa vuole fare', d.jobs),
      ),
    ),
    d.fit ? h('div', { class: 'card' }, h('h4', null, 'Fit verificato'), textBlock(d.fit)) : null,
  );
}

export function marketProblems(data) {
  const problems = [];
  if (data.sam && data.tam && data.sam > data.tam) problems.push('Il SAM è più grande del TAM: il mercato servibile è una parte di quello totale.');
  if (data.som && data.sam && data.som > data.sam) problems.push('Il SOM è più grande del SAM: la quota ottenibile è una parte del mercato servibile.');
  if (data.som && !data.som_year) problems.push('Manca l\'anno di riferimento del SOM: 9 milioni tra tre anni non valgono come 9 milioni tra cinque.');
  for (const [key, label] of [['tam', 'TAM'], ['sam', 'SAM'], ['som', 'SOM']]) {
    if (data[key] && !data[`${key}_basis`]) problems.push(`Il ${label} non ha calcolo e fonti: senza, il numero non è credibile.`);
  }
  return problems;
}

function marketCircles(data) {
  const levels = [
    ['tam', 'TAM', data.tam],
    ['sam', 'SAM', data.sam],
    ['som', 'SOM', data.som],
  ].filter(([, , value]) => value);
  if (!levels.length) return null;
  const max = Math.max(...levels.map(([, , value]) => value));
  const minRadius = [0, 22, 12];
  const shapes = [];
  levels.forEach(([key, label, value], index) => {
    const r = Math.max(Math.sqrt(value / max) * 95, minRadius[index] || 10);
    const cy = 200 - r;
    shapes.push(svg('circle', { cx: 110, cy, r, class: `mk-${key}` }));
    const labelY = r >= 40 ? cy - r + 18 : cy - r - 5;
    shapes.push(svg('text', { x: 110, y: Math.max(labelY, 16), class: 'mk-label', 'text-anchor': 'middle' }, `${label} ${fmtMoney(value)}`));
  });
  return svg('svg', { viewBox: '0 0 220 205', class: 'market-chart', role: 'img', 'aria-label': levels.map(([, label, value]) => `${label} ${fmtMoney(value)}`).join(', ') }, ...shapes);
}

export function marketView(item) {
  const d = item.data;
  const rows = [
    ['TAM', 'Mercato totale', d.tam, null, d.tam_basis],
    ['SAM', 'Mercato servibile', d.sam, d.tam ? (d.sam / d.tam) * 100 : null, d.sam_basis],
    ['SOM', `Quota ottenibile${d.som_year ? ` nel ${d.som_year}` : ''}`, d.som, d.sam ? (d.som / d.sam) * 100 : null, d.som_basis],
  ];
  const problems = marketProblems(d);
  return h(
    'div',
    { class: 'stack' },
    problems.length ? h('div', { class: 'banner banner-warn' }, h('ul', { class: 'plain-list' }, problems.map((p) => h('li', null, p)))) : null,
    h(
      'div',
      { class: 'market' },
      marketCircles(d) || h('p', { class: 'muted' }, 'Inserisci TAM, SAM e SOM per vedere i tre cerchi.'),
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, ['Livello', 'Valore all\'anno', 'Sul livello sopra', 'Calcolo e fonti'].map((t) => h('th', null, t)))),
          h(
            'tbody',
            null,
            rows.map(([short, label, value, share, basis]) =>
              h(
                'tr',
                null,
                h('td', null, h('strong', null, short), h('div', { class: 'muted small' }, label)),
                h('td', null, value ? fmtMoney(value) : '-'),
                h('td', null, share === null || !value ? '-' : fmtPercent(share)),
                h('td', null, basis ? textBlock(basis) : '-'),
              ),
            ),
          ),
        ),
      ),
    ),
    fieldsGrid(item, { skip: ['tam', 'tam_basis', 'sam', 'sam_basis', 'som', 'som_year', 'som_basis', 'group:TAM: mercato totale', 'group:SAM: mercato servibile', 'group:SOM: quota ottenibile'] }),
  );
}

export function personaCard(item) {
  const d = item.data;
  const def = KINDS.persona;
  return h(
    'div',
    { class: 'persona' },
    h(
      'div',
      { class: 'persona-tags' },
      d.role_type ? h('span', { class: 'badge badge-soft' }, optionLabel(def.fields.find((f) => f.key === 'role_type'), d.role_type)) : null,
      d.early_adopter === 'si' ? h('span', { class: 'badge badge-strong' }, 'Early adopter') : null,
      d.segment ? h('span', { class: 'muted small' }, d.segment) : null,
    ),
    d.quote ? h('blockquote', { class: 'persona-quote' }, truncate(d.quote, 220)) : null,
    d.profile ? h('p', { class: 'small' }, truncate(d.profile, 220)) : null,
  );
}
