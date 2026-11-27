import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, byText, text } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, OTHER, item, members } from '../setup/fixtures.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const { trashView } = await import('../../assets/js/views/trash.js');

const original = { ...api };
const IDEA = 'bbbbbbbb-0000-4000-8000-000000000001';
const CANVAS = 'bbbbbbbb-0000-4000-8000-000000000002';
const OLDER = 'bbbbbbbb-0000-4000-8000-000000000003';
let off = null;

function visit() {
  const outlet = document.createElement('main');
  off = trashView(outlet);
  return outlet;
}

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
});

afterEach(() => {
  off?.();
  off = null;
  Object.assign(api, original);
});

describe('cestino in inglese', () => {
  it('vuoto, lo dice in inglese', () => {
    const outlet = visit();
    assert.equal(text(outlet.querySelector('h1')), 'Trash');
    assert.equal(text(outlet.querySelector('.page-subtitle')), 'Nothing is ever really deleted: archived items stay here with their whole history.');
    assert.equal(text(outlet.querySelector('.empty')), 'The trash is empty.');
  });

  it('elenca gli elementi archiviati, dal più recente, con colonne e comandi in inglese', () => {
    store.applyItem(item({ id: OLDER, kind: 'idea', title: 'Older idea', deleted_at: '2026-10-01T10:00:00Z', updated_by: OTHER }));
    store.applyItem(item({ id: IDEA, kind: 'idea', title: 'Solar sensors', deleted_at: '2026-10-15T10:00:00Z', updated_by: OTHER }));
    store.applyItem(item({ id: CANVAS, kind: 'canvas', title: 'Canvas for sensors', idea_id: IDEA, deleted_at: '2026-10-16T10:00:00Z' }));
    const outlet = visit();
    assert.deepEqual([...outlet.querySelectorAll('thead th')].map(text), ['Item', 'Type', 'Archived by', 'When', '']);
    const rows = [...outlet.querySelectorAll('tbody tr')];
    assert.deepEqual(rows.map((row) => text(row.querySelector('td'))), ['Canvas for sensors (the idea is in the trash too)', 'Solar sensors', 'Older idea']);
    assert.equal(text(rows[1].querySelectorAll('td')[2]), 'Bruno');
    assert.equal(byText(rows[1], 'a', 'Versions').getAttribute('href'), `#/storico/${IDEA}`);
    assert.ok(byText(rows[1], 'button', 'Restore'));
  });

  it('chi non può modificare vede le versioni ma non il ripristino', () => {
    store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role: 'advisor' } : m)));
    store.applyItem(item({ id: IDEA, kind: 'idea', title: 'Solar sensors', deleted_at: '2026-10-15T10:00:00Z' }));
    const outlet = visit();
    assert.ok(byText(outlet, 'a', 'Versions'));
    assert.equal(byText(outlet, 'button', 'Restore'), null);
  });

  it('ripristinare un elemento lo toglie dal cestino', async () => {
    store.applyItem(item({ id: IDEA, kind: 'idea', title: 'Solar sensors', deleted_at: '2026-10-15T10:00:00Z' }));
    let restored = null;
    api.restoreItem = async (id) => {
      restored = id;
      return { status: 'ok', item: item({ ...store.getItem(IDEA), version: 2, deleted_at: null }) };
    };
    const outlet = visit();
    byText(outlet, 'button', 'Restore').click();
    await flush(5);
    assert.equal(restored, IDEA);
    assert.equal(text(outlet.querySelector('.empty')), 'The trash is empty.');
  });

  it('i testi del cestino non lasciano parole italiane', () => {
    store.applyItem(item({ id: IDEA, kind: 'idea', title: 'Solar sensors', deleted_at: '2026-10-15T10:00:00Z' }));
    store.applyItem(item({ id: CANVAS, kind: 'canvas', title: 'Canvas for sensors', idea_id: IDEA, deleted_at: '2026-10-16T10:00:00Z' }));
    const outlet = visit();
    outlet.querySelectorAll('.badge, .kind-badge, time, .muted:not(.small)').forEach((el) => el.remove());
    outlet.querySelectorAll('tbody td:nth-child(2), tbody td:nth-child(4)').forEach((el) => el.remove());
    assert.deepEqual(italianWords(text(outlet)), []);
  });
});
