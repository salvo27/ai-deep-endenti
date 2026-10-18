import { h, busy, confirmDialog, toast } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { LIMITS, cleanText } from '../lib/validate.js';
import { AI_TASKS } from '../ai.js';
import { memberName, on, state } from '../store.js';
import { avatar, errorBox, loading, timeAgo } from './components.js';

export function commentsPanel(item) {
  const list = h('div', { class: 'comments' }, loading());
  const textarea = h('textarea', { class: 'input', rows: 3, maxlength: LIMITS.comment, placeholder: 'Scrivi un commento', 'aria-label': 'Nuovo commento' });
  const send = h('button', { type: 'button', class: 'btn btn-primary' }, 'Commenta');
  let comments = [];

  const render = () => {
    if (!comments.length) {
      list.replaceChildren(h('p', { class: 'muted' }, 'Ancora nessun commento.'));
      return;
    }
    list.replaceChildren(...comments.map(commentView));
  };

  const commentView = (c) => {
    const mine = c.author_id === state.user?.id;
    const body = h('div', { class: 'text-block' }, c.body);
    const actions = mine
      ? h(
          'div',
          { class: 'comment-actions' },
          h('button', { type: 'button', class: 'link-btn small', onClick: () => edit(c, body) }, 'Modifica'),
          h('button', { type: 'button', class: 'link-btn small', onClick: () => remove(c) }, 'Elimina'),
        )
      : null;
    return h(
      'article',
      { class: ['comment', c.ai_task && 'comment-ai'] },
      avatar(c.author_id, 28),
      h(
        'div',
        { class: 'comment-main' },
        h(
          'div',
          { class: 'comment-head' },
          h('strong', null, memberName(c.author_id)),
          c.ai_task ? h('span', { class: 'badge badge-soft' }, `Claude · ${AI_TASKS[c.ai_task] || 'risposta'}`) : null,
          timeAgo(c.created_at),
          c.edited_at ? h('span', { class: 'muted small' }, '(modificato)') : null,
        ),
        body,
        actions,
      ),
    );
  };

  const load = async () => {
    try {
      comments = await api.listComments(item.id);
      render();
    } catch (error) {
      list.replaceChildren(errorBox(error));
    }
  };

  const edit = (c, bodyEl) => {
    const area = h('textarea', { class: 'input', rows: 3, maxlength: LIMITS.comment, value: c.body });
    const save = h('button', { type: 'button', class: 'btn btn-small btn-primary' }, 'Salva');
    save.addEventListener('click', busy(save, async () => {
      const text = cleanText(area.value, LIMITS.comment);
      if (!text) return;
      try {
        await api.editComment(c.id, text);
        await load();
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }));
    bodyEl.replaceChildren(area, h('div', { class: 'row' }, save, h('button', { type: 'button', class: 'btn btn-small btn-ghost', onClick: render }, 'Annulla')));
  };

  const remove = async (c) => {
    if (!(await confirmDialog('Eliminare questo commento?', { okLabel: 'Elimina', danger: true }))) return;
    try {
      await api.deleteComment(c.id);
      await load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  };

  send.addEventListener(
    'click',
    busy(send, async () => {
      const text = cleanText(textarea.value, LIMITS.comment);
      if (!text) return;
      try {
        await api.addComment(item.id, text);
        textarea.value = '';
        await load();
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }),
  );

  const off = on('comment', (row) => {
    if (row.item_id === item.id) load();
  });
  load();
  const el = h('section', { class: 'comments-panel' }, list, h('div', { class: 'comment-form' }, textarea, h('div', { class: 'row' }, send)));
  el.cleanup = off;
  return el;
}
