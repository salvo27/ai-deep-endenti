import { h, busy, confirmDialog, mount, toast } from '../lib/dom.js';
import { renderMentions } from '../lib/mentions.js';
import { mentionChip } from './mention-chip.js';
import { attachMentions } from './mention-input.js';
import { markReadWhere } from '../mentions.js';
import { api } from '../lib/api.js';
import { LIMITS, cleanText } from '../lib/validate.js';
import { renderMarkdown } from '../lib/markdown.js';
import { tx } from '../i18n/index.js';
import { AI_TASKS } from '../ai.js';
import { getItem, memberName, on, state } from '../store.js';
import { avatar, errorBox, itemLink, loading, timeAgo } from './components.js';

// Con «related» il pannello mostra anche i commenti di altri elementi, per esempio le schede di un'idea.
export function commentsPanel(item, { related = [] } = {}) {
  const texts = tx.editor.comments;
  const ids = [item.id, ...related.filter((id) => id !== item.id)];
  markReadWhere((m) => m.source === 'comment' && ids.includes(m.item_id));
  const list = h('div', { class: 'comments' }, loading());
  const textarea = attachMentions(h('textarea', { class: 'input', rows: 3, maxlength: LIMITS.comment, placeholder: texts.placeholder, 'aria-label': texts.newComment }));
  const send = h('button', { type: 'button', class: 'btn btn-primary' }, texts.send);
  let comments = [];

  const render = () => {
    if (!comments.length) {
      mount(list, h('p', { class: 'muted' }, texts.none));
      return;
    }
    mount(list, ...comments.map(commentView));
  };

  const commentView = (c) => {
    const mine = c.author_id === state.user?.id;
    const body = c.ai_task ? h('div', { class: 'markdown' }, renderMarkdown(c.body)) : h('div', { class: 'text-block' }, renderMentions(c.body, mentionChip));
    const actions = mine
      ? h(
          'div',
          { class: 'comment-actions' },
          h('button', { type: 'button', class: 'link-btn small', onClick: () => edit(c, body) }, tx.common.actions.edit),
          h('button', { type: 'button', class: 'link-btn small', onClick: () => remove(c) }, tx.common.actions.delete),
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
          c.ai_task ? h('span', { class: 'badge badge-soft' }, `Claude · ${AI_TASKS[c.ai_task] || texts.aiAnswer}`) : null,
          timeAgo(c.created_at),
          c.edited_at ? h('span', { class: 'muted small' }, texts.edited) : null,
          c.item_id !== item.id ? h('span', { class: 'comment-on muted small' }, texts.on, ' ', itemLink(getItem(c.item_id))) : null,
        ),
        body,
        actions,
      ),
    );
  };

  const load = async () => {
    try {
      comments = await api.listComments(ids);
      render();
    } catch (error) {
      mount(list, errorBox(error));
    }
  };

  const edit = (c, bodyEl) => {
    const area = attachMentions(h('textarea', { class: 'input', rows: 3, maxlength: LIMITS.comment, value: c.body }));
    const save = h('button', { type: 'button', class: 'btn btn-small btn-primary' }, tx.common.actions.save);
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
    mount(bodyEl, area, h('div', { class: 'row' }, save, h('button', { type: 'button', class: 'btn btn-small btn-ghost', onClick: render }, tx.common.actions.cancel)));
  };

  const remove = async (c) => {
    if (!(await confirmDialog(texts.deleteConfirm, { okLabel: tx.common.actions.delete, danger: true }))) return;
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
    if (ids.includes(row.item_id)) load();
  });
  load();
  const el = h('section', { class: 'comments-panel' }, list, h('div', { class: 'comment-form' }, textarea, h('div', { class: 'row' }, send)));
  el.cleanup = off;
  return el;
}
