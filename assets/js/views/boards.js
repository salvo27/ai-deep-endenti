import { h, svg } from '../lib/dom.js';
import { fmtMoney, fmtPercent, truncate } from '../lib/format.js';
import { tx } from '../i18n/index.js';
import { TRL, fieldOf, optionLabel, routeFor } from '../schema.js';
import { conceptButton } from './concept-help.js';
import { fieldsGrid, photoView, textBlock } from './components.js';

// Viste delle schede che hanno un disegno proprio. I dati arrivano già validati da sanitizeSnapshot.

// A group of fields already shown in the drawing is not repeated below it. Groups are named by the schema, in the
// language in use: they are found through one of their fields, never by their name.
const groupOf = (kind, key) => `group:${fieldOf(kind, key)?.group}`;

export function trlScale(now, target) {
  const texts = tx.analysis.trl;
  const current = Number(now) || 0;
  const goal = Number(target) || 0;
  return h(
    'div',
    { class: 'trl' },
    h(
      'ol',
      { class: 'trl-steps', 'aria-label': texts.scale },
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
      current ? h('strong', null, optionLabel(fieldOf('deeptech', 'trl_now'), String(current))) : texts.notSet,
      goal ? h('span', { class: 'muted' }, ` · ${texts.next(optionLabel(fieldOf('deeptech', 'trl_target'), String(goal)))}`) : null,
    ),
  );
}

export function deeptechView(item) {
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'section-label' }, tx.analysis.trl.maturity, conceptButton('trl')),
    trlScale(item.data.trl_now, item.data.trl_target),
    fieldsGrid(item, { skip: ['trl_now', 'trl_target', groupOf('deeptech', 'trl_now')] }),
  );
}

function block(title, text, extra = null) {
  return h('div', { class: 'vpc-block' }, h('h4', null, title), text ? textBlock(text) : h('p', { class: 'muted small' }, tx.analysis.toFill), extra);
}

export function vpcView(item) {
  const texts = tx.analysis.vpc;
  const d = item.data;
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'vpc' },
      h(
        'section',
        { class: 'vpc-map', 'aria-label': texts.map },
        h('h3', null, texts.map),
        block(texts.products, d.products),
        block(texts.gainCreators, d.gain_creators),
        block(texts.painRelievers, d.pain_relievers),
      ),
      h('div', { class: 'vpc-fit', 'aria-hidden': 'true' }, '⇄'),
      h(
        'section',
        { class: 'vpc-profile', 'aria-label': texts.profile },
        h('h3', null, texts.profile, d.segment ? h('span', { class: 'muted' }, ` · ${d.segment}`) : null),
        block(texts.gains, d.gains),
        block(texts.pains, d.pains),
        block(texts.jobs, d.jobs),
      ),
    ),
    d.fit ? h('div', { class: 'card' }, h('h4', null, texts.fit), textBlock(d.fit)) : null,
  );
}

export function marketProblems(data) {
  const texts = tx.analysis.market;
  const problems = [];
  if (data.sam && data.tam && data.sam > data.tam) problems.push(texts.samOverTam);
  if (data.som && data.sam && data.som > data.sam) problems.push(texts.somOverSam);
  if (data.som && !data.som_year) problems.push(texts.noYear);
  for (const [key, label] of [['tam', 'TAM'], ['sam', 'SAM'], ['som', 'SOM']]) {
    if (data[key] && !data[`${key}_basis`]) problems.push(texts.noBasis(label));
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
  const texts = tx.analysis.market;
  const d = item.data;
  const rows = [
    ['TAM', texts.total, d.tam, null, d.tam_basis],
    ['SAM', texts.serviceable, d.sam, d.tam ? (d.sam / d.tam) * 100 : null, d.sam_basis],
    ['SOM', d.som_year ? texts.obtainableIn(d.som_year) : texts.obtainable, d.som, d.sam ? (d.som / d.sam) * 100 : null, d.som_basis],
  ];
  const problems = marketProblems(d);
  const headers = texts.headers;
  return h(
    'div',
    { class: 'stack' },
    problems.length ? h('div', { class: 'banner banner-warn' }, h('ul', { class: 'plain-list' }, problems.map((p) => h('li', null, p)))) : null,
    h(
      'div',
      { class: 'market' },
      marketCircles(d) || h('p', { class: 'muted' }, texts.empty),
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, [headers.level, headers.value, headers.share, headers.basis].map((t) => h('th', null, t)))),
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
    fieldsGrid(item, { skip: ['tam', 'tam_basis', 'sam', 'sam_basis', 'som', 'som_year', 'som_basis', groupOf('market', 'tam'), groupOf('market', 'sam'), groupOf('market', 'som')] }),
  );
}

// The kind and the CSS classes of the buyer persona: names in the code, not text the reader sees.
const PERSONA = 'persona'; // i18n-ignore
const CSS = { facts: 'persona-facts', hero: 'persona-hero', heroBody: 'persona-hero-body', role: 'persona-role', card: 'card persona-card', cardHead: 'persona-card-head', cardName: 'persona-card-name', quote: 'persona-quote' }; // i18n-ignore

// "Early adopter" is said the same way in every language.
const SHORT_LABELS = { ...tx.analysis.persona.facts, early_adopter: 'Early adopter' };
const EARLY_SHORT = { si: tx.common.states.yes, forse: tx.analysis.persona.maybe, no: tx.common.states.no };
const PERSONA_HERO = ['role_type', 'segment', 'early_adopter', 'age_range', 'gender', 'location', 'income', 'education'];

function factValue(key, value) {
  if (!value) return h('span', { class: 'muted' }, '-');
  if (key === 'early_adopter') return EARLY_SHORT[value] || value;
  const def = fieldOf(PERSONA, key);
  return def.type === 'select' ? optionLabel(def, value) : value;
}

function personaFacts(item, keys) {
  return h(
    'dl',
    { class: CSS.facts },
    keys.map((key) => h('div', null, h('dt', null, SHORT_LABELS[key]), h('dd', null, factValue(key, item.data[key])))),
  );
}

// Come nei tool per buyer persona: foto a sinistra, ruolo e dati demografici accanto, poi il resto per gruppi.
export function personaView(item) {
  const d = item.data;
  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: CSS.hero },
      photoView(d.photo, { alt: tx.analysis.persona.photoOf(item.title), size: 128, fallback: item.title }),
      h(
        'div',
        { class: CSS.heroBody },
        h('p', { class: [CSS.role, !d.role && 'muted'] }, d.role || tx.analysis.persona.noRole),
        personaFacts(item, PERSONA_HERO),
      ),
    ),
    fieldsGrid(item, { skip: ['photo', 'role', ...PERSONA_HERO, groupOf(PERSONA, 'photo'), groupOf(PERSONA, 'age_range')] }),
  );
}

export function personaCard(item) {
  const d = item.data;
  const extra = ['age_range', 'location'].filter((key) => d[key]);
  return h(
    'article',
    { class: CSS.card },
    h(
      'div',
      { class: CSS.cardHead },
      photoView(d.photo, { alt: tx.analysis.persona.photoOf(item.title), size: 56, fallback: item.title }),
      h(
        'div',
        { class: CSS.cardName },
        h('a', { href: routeFor(item), class: 'item-link' }, item.title),
        d.role ? h('span', { class: 'muted small' }, d.role) : null,
      ),
      d.early_adopter === 'si' ? h('span', { class: 'badge badge-strong' }, SHORT_LABELS.early_adopter) : null,
    ),
    personaFacts(item, ['segment', 'role_type', ...extra]),
    d.quote ? h('blockquote', { class: CSS.quote }, truncate(d.quote, 160)) : null,
  );
}
