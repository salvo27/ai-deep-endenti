import { h, mount } from '../lib/dom.js';
import { ALL, mentionQuery, mentionToken } from '../lib/mentions.js';
import { state } from '../store.js';
import { avatar } from './components.js';

// Scrivendo @ compare l'elenco dei membri (e «tutti»): frecce per scegliere, Invio o Tab per inserire, Esc per chiudere.
// Mentre l'elenco è aperto textarea.mentionOpen è vero, così Invio non manda il messaggio.
export function attachMentions(textarea, { above = false } = {}) {
  const menu = h('ul', { class: ['mention-menu', above && 'is-above'], role: 'listbox', 'aria-label': 'Persone da taggare', hidden: true });
  let items = [];
  let active = 0;
  let current = null;

  // Sopra o sotto il campo, dal lato con più spazio visibile; si ricalcola scorrendo o quando si apre la tastiera.
  const place = () => {
    const viewport = window.visualViewport?.height ?? window.innerHeight;
    const rect = textarea.getBoundingClientRect();
    const below = viewport - rect.bottom;
    menu.classList.toggle('is-above', above || (below < 240 && rect.top > below));
  };
  const follow = (on) => {
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('scroll', place, true);
    window[method]('resize', place);
    window.visualViewport?.[method]('resize', place);
  };
  const close = () => {
    if (!menu.hidden) follow(false);
    menu.hidden = true;
    textarea.mentionOpen = false;
    current = null;
  };
  const candidates = (query) => {
    const q = query.toLowerCase();
    const people = state.members
      .filter((m) => m.user_id !== state.user?.id && m.display_name.toLowerCase().includes(q))
      .map((m) => ({ name: m.display_name, id: m.user_id }));
    return [...people, ...(ALL.startsWith(q) ? [{ name: ALL, all: true }] : [])].slice(0, 6);
  };
  const choose = (index) => {
    const item = items[index];
    if (!item || !current) return;
    const token = `${mentionToken(item.name)} `;
    const before = textarea.value.slice(0, current.start);
    const after = textarea.value.slice(textarea.selectionEnd ?? textarea.value.length);
    textarea.value = `${before}${token}${after}`;
    const caret = before.length + token.length;
    textarea.setSelectionRange?.(caret, caret);
    close();
    textarea.dispatchEvent(new Event('input'));
    textarea.focus();
  };
  const render = () =>
    mount(
      menu,
      items.map((item, i) =>
        h(
          'li',
          {
            role: 'option',
            class: ['mention-option', i === active && 'is-active'],
            'aria-selected': String(i === active),
            // Sul telefono il tocco non deve togliere il fuoco al campo, altrimenti la tastiera si chiude.
            onPointerdown: (e) => e.preventDefault(),
            onMousedown: (e) => e.preventDefault(),
            onClick: () => choose(i),
          },
          item.all ? [h('strong', null, '@tutti'), h('span', { class: 'muted small' }, 'avvisa tutta la squadra')] : [avatar(item.id, 20), h('span', null, item.name)],
        ),
      ),
    );
  const update = () => {
    current = mentionQuery(textarea.value, textarea.selectionStart ?? textarea.value.length);
    items = current ? candidates(current.query) : [];
    if (!items.length) {
      close();
      return;
    }
    active = Math.min(active, items.length - 1);
    if (!menu.isConnected) textarea.after(menu);
    textarea.parentElement?.classList.add('has-mentions');
    place();
    if (menu.hidden) follow(true);
    menu.hidden = false;
    textarea.mentionOpen = true;
    render();
  };

  textarea.addEventListener('input', update);
  textarea.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      render();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  textarea.addEventListener('blur', () => setTimeout(close, 150));
  return textarea;
}
