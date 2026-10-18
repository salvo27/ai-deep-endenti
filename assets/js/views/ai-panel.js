import { h, openModal, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api } from '../lib/api.js';
import { AI_TASKS, askClaude, buildContext } from '../ai.js';
import { errorBox, loading } from './components.js';

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
  const body = h('div', { class: 'ai-panel' }, loading('Claude sta leggendo la board…'));
  let result = null;
  const modal = openModal({ title: `Claude · ${AI_TASKS[task]}`, wide: true, body, actions: [] });

  const footer = h('footer', { class: 'modal-actions' });
  const copyButton = h('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      toast('Testo copiato.');
    } catch {
      toast('Copia non riuscita.', { type: 'error' });
    }
  } }, icon('copy', 16), h('span', null, 'Copia'));
  const saveButton = item
    ? h('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
        saveButton.disabled = true;
        try {
          await api.addComment(item.id, result.text, task);
          toast('Salvato tra i commenti.', { type: 'success' });
          modal.close();
        } catch (error) {
          saveButton.disabled = false;
          toast(error.message, { type: 'error' });
        }
      } }, icon('comment', 16), h('span', null, 'Salva come commento'))
    : null;
  const acceptButton = onAccept
    ? h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { onAccept(result.text); modal.close(); } }, acceptLabel || 'Usa')
    : null;

  (async () => {
    try {
      const context = buildContext(task, await getInput());
      result = await askClaude(task, context);
      body.replaceChildren(
        h('div', { class: 'ai-result text-block' }, result.text),
        result.truncated ? h('p', { class: 'muted small' }, 'La risposta è stata interrotta perché troppo lunga.') : null,
        result.remaining !== null ? h('p', { class: 'muted small' }, `Richieste a Claude ancora disponibili: ${result.remaining}`) : null,
        h('p', { class: 'muted small' }, 'Claude può sbagliare: verifica i fatti prima di usarli.'),
      );
      footer.append(copyButton, saveButton || '', acceptButton || '');
      modal.dialog.append(footer);
    } catch (error) {
      body.replaceChildren(errorBox(error));
    }
  })();
  return modal;
}
