import { h } from '../lib/dom.js';
import { isPhotoDataUrl } from '../lib/validate.js';
import { icon } from '../lib/icons.js';
import { fmtDate, fmtDateTime, fmtMoney, fmtRelative, initials } from '../lib/format.js';
import { KINDS, fieldOf, formatValue, isConversation, optionLabel, routeFor, statusLabel, STRONG_COMMITMENTS } from '../schema.js';
import { getItem, isExample, labelContext, memberById, memberName, state } from '../store.js';
import { conceptButton } from './concept-help.js';
import { renderNote } from '../notes.js';
import { canGoBack, goBack } from '../router.js';

export function avatar(userId, size = 28) {
  const member = memberById(userId);
  return h(
    'span',
    {
      class: 'avatar',
      title: member?.display_name || 'Ex membro',
      style: { '--avatar': member?.color || '#8a8f98', width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` },
    },
    initials(member?.display_name || '?'),
  );
}

// Foto di una scheda (per ora la buyer persona); senza foto valida, le iniziali del titolo.
export function photoView(src, { alt = 'Foto', size = 96, fallback = '' } = {}) {
  const style = { width: `${size}px`, height: `${size}px` };
  if (isPhotoDataUrl(src)) return h('img', { class: 'photo', src, alt, style });
  const words = String(fallback || '?').trim().split(/\s+/);
  const letters = words.length > 1 ? initials(fallback) : (words[0][0] || '?').toUpperCase();
  return h('span', { class: 'photo photo-empty', style: { ...style, fontSize: `${Math.round(size * 0.38)}px` }, 'aria-hidden': 'true' }, letters);
}

export function memberChip(userId) {
  return h('span', { class: 'member-chip' }, avatar(userId, 20), h('span', null, memberName(userId)));
}

export function statusPill(kind, status) {
  if (!status) return null;
  return h('span', { class: ['pill', `st-${status}`] }, statusLabel(kind, status));
}

export function kindBadge(kind) {
  return h('span', { class: 'kind-badge' }, icon(KINDS[kind]?.icon || 'commit', 14), KINDS[kind]?.label || kind);
}

export function timeAgo(iso) {
  return h('time', { datetime: iso, title: fmtDateTime(iso) }, fmtRelative(iso));
}

// «Indietro» torna alla pagina da cui si arriva; aperta da un link diretto, porta alla pagina superiore (back.href).
function backLink(back) {
  if (back === false || (!back?.href && !canGoBack())) return null;
  return h(
    'a',
    {
      class: 'back-link',
      href: back?.href || '#/',
      onClick: (event) => {
        event.preventDefault();
        goBack(back?.href || '#/');
      },
    },
    icon('back', 16),
    'Indietro',
  );
}

export function pageHeader({ title, subtitle, actions = [], eyebrow, back }) {
  return h(
    'header',
    { class: 'page-header' },
    h(
      'div',
      { class: 'page-title' },
      backLink(back),
      eyebrow || null,
      h('h1', null, title),
      subtitle && !(Array.isArray(subtitle) && !subtitle.length) ? h('div', { class: 'page-subtitle' }, subtitle) : null,
    ),
    actions.length ? h('div', { class: 'page-actions' }, actions.filter(Boolean)) : null,
  );
}

export function button(label, { kind = 'ghost', iconName, onClick, href, title, disabled, type = 'button' } = {}) {
  const content = [iconName ? icon(iconName, 16) : null, label ? h('span', null, label) : null];
  const cls = ['btn', `btn-${kind}`, !label && 'btn-icon'];
  if (href) return h('a', { class: cls, href, title, 'aria-label': label ? undefined : title }, content);
  return h('button', { type, class: cls, onClick, title, disabled, 'aria-label': label ? undefined : title }, content);
}

export function emptyState(text, action) {
  return h('div', { class: 'empty' }, h('p', null, text), action || null);
}

export function tabs(entries, active, hrefFor) {
  return h(
    'nav',
    { class: 'tabs', 'aria-label': 'Sezioni' },
    entries.map(([key, label, count]) =>
      h(
        'a',
        { class: ['tab', key === active && 'is-active'], href: hrefFor(key), 'aria-current': key === active ? 'page' : undefined },
        label,
        count ? h('span', { class: 'tab-count' }, String(count)) : null,
      ),
    ),
  );
}

export function itemLink(item, text) {
  if (!item) return h('span', { class: 'muted' }, 'Elemento non disponibile');
  return h('a', { href: routeFor(item), class: ['item-link', item.deleted_at && 'is-deleted'] }, text || item.title || KINDS[item.kind]?.label);
}

export function textBlock(text) {
  return h('div', { class: 'text-block' }, text);
}

export function commitmentBadge(value) {
  if (!value) return null;
  const def = fieldOf('interview', 'commitment');
  return h('span', { class: ['badge', STRONG_COMMITMENTS.has(value) ? 'badge-strong' : 'badge-soft'] }, optionLabel(def, value));
}

// Le ricerche online restano visibili ma si distinguono dai colloqui, che sono le sole prove.
export function sourceBadge(interview) {
  if (!interview || isConversation(interview)) return null;
  return h('span', { class: 'badge badge-warn', title: 'Non conta come intervista: non è stata sentita nessuna persona' }, 'Ricerca online');
}

export function fieldValue(kind, def, value, item = null) {
  if ((value === undefined || value === null || value === '') && def.default !== undefined) value = def.default;
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) {
    return h('span', { class: 'muted' }, '-');
  }
  if (isExample(item) && (def.type === 'member' || def.type === 'members')) {
    return h('div', { class: 'chips' }, [value].flat().map((role) => h('span', { class: 'chip' }, role)));
  }
  switch (def.type) {
    case 'textarea':
      return textBlock(value);
    case 'markdown':
      return renderNote(value);
    case 'tags':
      return h('div', { class: 'chips' }, value.map((tag) => h('span', { class: 'chip' }, tag)));
    case 'member':
      return memberChip(value);
    case 'members':
      return h('div', { class: 'chips' }, value.map((id) => memberChip(id)));
    case 'ideas':
      return h('div', { class: 'chips' }, value.map((id) => itemLink(getItem(id))));
    case 'experiment':
    case 'interview':
      return itemLink(getItem(value));
    case 'date':
      return h('span', null, fmtDate(value));
    case 'money':
      return h('span', null, fmtMoney(value));
    case 'scale':
      return h('span', { class: 'scale-view', 'aria-label': `${value} su 5` }, [1, 2, 3, 4, 5].map((n) => h('span', { class: ['dot', n <= value && 'on'] })));
    case 'select':
      return kind === 'interview' && def.key === 'commitment' ? commitmentBadge(value) : h('span', null, optionLabel(def, value));
    case 'image':
      return photoView(value, { alt: `Foto: ${item?.title || ''}`.trim(), size: 72, fallback: item?.title });
    default:
      return h('span', null, String(formatValue(kind, `data.${def.key}`, value, labelContext)));
  }
}

export function fieldsGrid(item, { skip = [] } = {}) {
  const def = KINDS[item.kind];
  return h(
    'dl',
    { class: 'fields-grid' },
    def.fields
      .filter((f) => !skip.includes(f.key))
      .map((f) => [
        f.group && !skip.includes(`group:${f.group}`) ? h('div', { class: 'fields-group is-wide' }, h('h3', null, f.group)) : null,
        h(
          'div',
          { class: ['field-view', (f.wide || f.type === 'textarea' || f.type === 'markdown') && 'is-wide'] },
          h('dt', null, f.label, f.concept ? conceptButton(f.concept) : null),
          h('dd', null, fieldValue(item.kind, f, item.data?.[f.key], item)),
        ),
      ]),
  );
}

export function exampleBanner(item) {
  const idea = item.kind === 'idea' ? item : getItem(item.idea_id) || getItem(item.data?.ideas?.[0]);
  return h(
    'div',
    { class: 'banner banner-example' },
    h('strong', null, 'Esempio in sola lettura. '),
    idea?.exampleNote || 'Mostra come si compila questa parte della board.',
  );
}

export function metaLine(item) {
  if (isExample(item)) return h('span', { class: 'meta-line' }, h('span', { class: 'badge badge-example' }, 'Esempio'));
  return h(
    'span',
    { class: 'meta-line' },
    'Versione ',
    String(item.version),
    ' · modificato da ',
    memberName(item.updated_by),
    ' ',
    timeAgo(item.updated_at),
  );
}

export function onlineHere(path) {
  const others = state.online.filter((p) => p.userId !== state.user?.id && p.route === path);
  if (!others.length) return null;
  return h(
    'div',
    { class: 'here' },
    others.map((p) => avatar(p.userId, 22)),
    h('span', null, others.some((p) => p.editing) ? 'sta modificando' : 'qui ora'),
  );
}

export function loading(text = 'Caricamento…') {
  return h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner' }), text);
}

export function errorBox(error) {
  return h('p', { class: 'error-box', role: 'alert' }, error?.message || 'Operazione non riuscita.');
}
