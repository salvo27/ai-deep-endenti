import { append, h, mount, openModal, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api } from '../lib/api.js';
import { renderMarkdown } from '../lib/markdown.js';
import { AI_TASKS, askClaude, buildContext } from '../ai.js';
import { tx } from '../i18n/index.js';
import { errorBox, loading } from './components.js';

const t = tx.ai.panel;

export function aiButton(task, getInput, { item = null, label, onAccept, acceptLabel } = {}) {
  return h(
    'button',
    {
      type: 'button',
      class: 'btn btn-ai',
      onClick: () => openAiPanel(task, getInput, { item, onAccept, acceptLabel }),
    },
    icon('claude', 16),
    h('span', null, label || AI_TASKS[task]),
  );
}

export function openAiPanel(task, getInput, { item, onAccept, acceptLabel } = {}) {
  const body = h('div', { class: 'ai-panel' }, loading(t.reading));
  let result = null;
  const modal = openModal({ title: `Claude · ${AI_TASKS[task]}`, wide: true, body, actions: [] });

  const footer = h('footer', { class: 'modal-actions' });
  const copyButton = h('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      toast(t.copied);
    } catch {
      toast(t.copyFailed, { type: 'error' });
    }
  } }, icon('copy', 16), h('span', null, tx.common.actions.copy));
  const saveButton = item
    ? h('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
        saveButton.disabled = true;
        try {
          await api.addComment(item.id, result.text, task);
          toast(t.savedAsComment(item.title), { type: 'success' });
          modal.close();
        } catch (error) {
          saveButton.disabled = false;
          toast(error.message, { type: 'error' });
        }
      } }, icon('comment', 16), h('span', null, t.saveAsComment))
    : null;
  const acceptButton = onAccept
    ? h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { onAccept(result.text); modal.close(); } }, acceptLabel || t.use)
    : null;

  (async () => {
    try {
      const context = buildContext(task, await getInput());
      result = await askClaude(task, context);
      mount(body,
        h('div', { class: 'ai-result markdown' }, renderMarkdown(result.text)),
        result.truncated ? h('p', { class: 'muted small' }, t.truncated) : null,
        result.remaining !== null ? h('p', { class: 'muted small' }, t.remaining(result.remaining)) : null,
        h('p', { class: 'muted small' }, t.mistakes),
      );
      append(footer, [copyButton, saveButton, acceptButton]);
      modal.dialog.append(footer);
    } catch (error) {
      mount(body, errorBox(error));
    }
  })();
  return modal;
}
