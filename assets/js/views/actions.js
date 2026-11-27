import { confirmDialog, toast } from '../lib/dom.js';
import { snapshotOf } from '../lib/diff.js';
import { tx } from '../i18n/index.js';
import { KINDS, statusLabel } from '../schema.js';
import { archiveItem, getItem, isExample, restoreItem } from '../store.js';
import { saveWithMerge } from './merge.js';
import { navigate } from '../router.js';

export async function changeStatus(item, status) {
  if (!item || isExample(item) || item.status === status) return null;
  const base = snapshotOf(item);
  const message = tx.editor.actions.statusChange(statusLabel(item.kind, item.status), statusLabel(item.kind, status));
  try {
    const result = await saveWithMerge(item, base, { ...base, status }, message);
    if (!result.cancelled) toast(message, { type: 'success' });
    return result.item;
  } catch (error) {
    toast(error.message, { type: 'error' });
    return null;
  }
}

export async function archiveWithConfirm(item, { backTo = '/' } = {}) {
  const texts = tx.editor.actions;
  // Archiviare un'idea nasconde anche le schede collegate: lo dice prima.
  const body = item.kind === 'idea' ? texts.archiveIdeaBody(item.title) : texts.archiveBody(item.title);
  const ok = await confirmDialog(body, {
    title: texts.archiveTitle(KINDS[item.kind].label.toLowerCase()),
    okLabel: tx.common.actions.archive,
    danger: true,
  });
  if (!ok) return false;
  try {
    await archiveItem(getItem(item.id) || item);
    toast(texts.archived, { type: 'success' });
    navigate(backTo);
    return true;
  } catch (error) {
    toast(error.message, { type: 'error' });
    return false;
  }
}

export async function restoreWithToast(item) {
  try {
    await restoreItem(item, tx.editor.actions.restoreMessage);
    toast(tx.editor.actions.restored(item.title), { type: 'success' });
    return true;
  } catch (error) {
    toast(error.message, { type: 'error' });
    return false;
  }
}
