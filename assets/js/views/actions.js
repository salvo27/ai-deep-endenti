import { confirmDialog, toast } from '../lib/dom.js';
import { snapshotOf } from '../lib/diff.js';
import { KINDS, statusLabel } from '../schema.js';
import { archiveItem, getItem, isExample, restoreItem } from '../store.js';
import { saveWithMerge } from './merge.js';
import { navigate } from '../router.js';

export async function changeStatus(item, status) {
  if (!item || isExample(item) || item.status === status) return null;
  const base = snapshotOf(item);
  const message = `Stato: ${statusLabel(item.kind, item.status)} → ${statusLabel(item.kind, status)}`;
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
  const children = item.kind === 'idea' ? ' Lean Canvas, esperimenti e interviste collegati spariranno dalle liste finché non la ripristini.' : '';
  const ok = await confirmDialog(`«${item.title}» andrà nel cestino. Lo storico resta e puoi ripristinarlo quando vuoi.${children}`, {
    title: `Archiviare ${KINDS[item.kind].label.toLowerCase()}?`,
    okLabel: 'Archivia',
    danger: true,
  });
  if (!ok) return false;
  try {
    await archiveItem(getItem(item.id) || item);
    toast('Spostato nel cestino.', { type: 'success' });
    navigate(backTo);
    return true;
  } catch (error) {
    toast(error.message, { type: 'error' });
    return false;
  }
}

export async function restoreWithToast(item) {
  try {
    await restoreItem(item, 'Ripristinato dal cestino');
    toast(`«${item.title}» ripristinato.`, { type: 'success' });
    return true;
  } catch (error) {
    toast(error.message, { type: 'error' });
    return false;
  }
}
