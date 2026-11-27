import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { IDS, ME, OTHER, PROJECT, PROJECT2, boardItems, members } from '../setup/fixtures.mjs';

// Le menzioni sono del progetto aperto: il pulsante @, il suo elenco e «Segna tutte come lette» non vedono gli altri.
let api;
let store;
let chat;
let mentions;
let bell;
let chips;
let comments;
let original;
let asked;
let read;
let shown;

const GENERAL = 'dddddddd-0000-4000-8000-000000000001';
const MSG = 'eeeeeeee-0000-4000-8000-000000000001';
const mention = (over) => ({ id: 1, project_id: PROJECT, user_id: ME, author_id: OTHER, source: 'chat', source_id: MSG, chat_id: GENERAL, item_id: null, excerpt: 'Ciao @Anna, guarda', created_at: '2026-10-22T09:00:00Z', read_at: null, ...over });
const elsewhere = (over) => mention({ id: 50, project_id: PROJECT2, chat_id: 'dddddddd-0000-4000-8000-000000000009', excerpt: 'Da Beta', ...over });

class FakeNotification {
  static permission = 'granted';

  constructor(title, options) {
    shown.push({ title, ...options });
  }

  close() {}
}

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  chat = await import('../../assets/js/chat.js');
  mentions = await import('../../assets/js/mentions.js');
  bell = await import('../../assets/js/views/notifications.js');
  chips = await import('../../assets/js/views/mention-chip.js');
  comments = await import('../../assets/js/views/comments.js');
  original = { ...api };
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setProject({ id: PROJECT, name: 'Alfa', role: 'admin' });
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  asked = [];
  read = [];
  shown = [];
  globalThis.Notification = FakeNotification;
  api.listChats = async () => [{ id: GENERAL, project_id: PROJECT, title: 'Generale', is_general: true, idea_id: null, archived_at: null, created_at: '2026-10-01T10:00:00Z' }];
  api.chatOverview = async () => [];
  api.listMentions = async (project) => {
    asked.push(project);
    return [mention(), mention({ id: 2, source: 'comment', source_id: 'cccccccc-0000-4000-8000-000000000001', chat_id: null, item_id: IDS.idea })];
  };
  api.markMentionsRead = async (ids, project) => read.push([ids, project]);
  chat.stopChats();
  await chat.startChats();
  mentions.stopMentions();
  await mentions.startMentions();
  document.body.querySelectorAll('.toasts, .bell-box').forEach((el) => el.remove());
});

afterEach(() => {
  chat.stopChats();
  mentions.stopMentions();
  delete document.visibilityState;
  delete globalThis.Notification;
  Object.assign(api, original);
});

function openButton() {
  const box = bell.mentionsButton();
  document.body.append(box);
  box.querySelector('.mentions-btn').click();
  return box;
}

const type = (area, value) => {
  area.value = value;
  area.setSelectionRange(value.length, value.length);
  area.dispatchEvent(new Event('input'));
};

describe('menzioni del progetto aperto', () => {
  it('si chiedono per il progetto aperto', () => {
    assert.deepEqual(asked, [PROJECT]);
    assert.equal(mentions.unreadMentions(), 2);
  });

  it('una menzione di un altro progetto nella risposta non si mostra né si conta', async () => {
    api.listMentions = async () => [mention(), elsewhere()];
    await mentions.loadMentions();
    assert.deepEqual(mentions.mentionState.items.map((m) => m.id), [1]);
    assert.equal(mentions.unreadMentions(), 1);
    const box = openButton();
    assert.equal(box.querySelector('.bell-badge').textContent, '1');
    assert.equal(box.querySelectorAll('.mention-item').length, 1);
    assert.doesNotMatch(text(box), /Da Beta/);
  });

  it('una menzione di un altro progetto arrivata dal vivo non si mostra, non si conta e non avvisa', () => {
    const box = openButton();
    store.emit('mention-row', { row: elsewhere(), removed: false });
    assert.equal(mentions.unreadMentions(), 2);
    assert.equal(box.querySelector('.bell-badge').textContent, '2');
    assert.equal(document.querySelector('.toasts'), null, 'nessun avviso nella pagina');
    store.writeLocal('avvisiBrowser', true);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    store.emit('mention-row', { row: elsewhere({ id: 51 }), removed: false });
    assert.deepEqual(shown, [], 'nessun avviso del browser');
    assert.equal(mentions.unreadMentions(), 2);
  });

  it('una menzione del progetto arrivata con la scheda in secondo piano avvisa, con il nome del progetto', () => {
    store.writeLocal('avvisiBrowser', true);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    store.emit('mention-row', { row: mention({ id: 3, source: 'note', source_id: IDS.idea, item_id: IDS.idea, chat_id: null }), removed: false });
    assert.equal(mentions.unreadMentions(), 3);
    assert.deepEqual(shown, [{ title: 'ai-deep-endenti · Alfa', body: 'Bruno ti ha taggato nella nota «Idea alfa»', tag: 'men-3' }]);
  });

  it('«Segna tutte come lette» segna solo quelle del progetto aperto', () => {
    const box = openButton();
    byText(box, 'button', 'Segna tutte come lette').click();
    assert.deepEqual(read, [[null, PROJECT]]);
    assert.equal(mentions.unreadMentions(), 0);
    assert.equal(box.querySelector('.bell-badge').hidden, true);
  });

  it('aprire una menzione la segna letta nel suo progetto', () => {
    const box = openButton();
    box.querySelector('.mention-item a').click();
    assert.deepEqual(read, [[[1], PROJECT]]);
    assert.equal(mentions.unreadMentions(), 1);
  });

  it('senza un progetto aperto non si chiede né si segna niente', async () => {
    mentions.stopMentions();
    store.setProject(null);
    asked = [];
    await mentions.startMentions();
    assert.deepEqual(asked, []);
    assert.equal(mentions.unreadMentions(), 0);
    mentions.mentionState.items = [mention()];
    await mentions.markMentionsRead();
    assert.deepEqual(read, []);
  });
});

describe('dove si è stati taggati', () => {
  for (const [label, row, expected] of [
    ['nella chat generale', mention(), 'Bruno ti ha taggato in «Generale»'],
    ['in una chat che non c è più', mention({ chat_id: 'dddddddd-0000-4000-8000-0000000000ff' }), 'Bruno ti ha taggato in «chat»'],
    ['in una nota', mention({ source: 'note', item_id: IDS.idea, chat_id: null }), 'Bruno ti ha taggato nella nota «Idea alfa»'],
    ['in una nota che non c è più', mention({ source: 'note', item_id: 'cccccccc-0000-4000-8000-0000000000ff', chat_id: null }), 'Bruno ti ha taggato nella nota «nota»'],
    ['in un commento', mention({ source: 'comment', item_id: IDS.canvas, chat_id: null }), 'Bruno ti ha taggato in un commento su «Lean Canvas: Idea alfa»'],
    ['in un commento su una scheda che non c è più', mention({ source: 'comment', item_id: null, chat_id: null }), 'Bruno ti ha taggato in un commento su «una scheda»'],
    ['da qualcuno che non è più nel progetto', mention({ author_id: '00000000-0000-4000-8000-0000000000ee' }), 'Ex membro ti ha taggato in «Generale»'],
  ]) {
    it(label, () => {
      assert.equal(mentions.mentionText(row), expected);
    });
  }
});

describe('tag di tutta la squadra in italiano', () => {
  it('il tag salvato @[tutti] si legge @tutti, evidenziato per chi legge', () => {
    const chip = chips.mentionChip('tutti');
    assert.equal(chip.textContent, '@tutti');
    assert.equal(chip.getAttribute('title'), 'Tutta la squadra');
    assert.ok(chip.classList.contains('is-me'));
    assert.equal(chips.mentionChip('Tutti').textContent, '@tutti', 'come il database, senza badare alle maiuscole');
  });

  it('scrivendo @tu si propone @tutti, e scegliendolo il testo salva @[tutti]', async () => {
    api.listComments = async () => [];
    const panel = comments.commentsPanel(store.getItem(IDS.idea));
    document.body.append(panel);
    await flush(3);
    const area = panel.querySelector('textarea');
    type(area, 'Guardate @tu');
    const menu = panel.querySelector('.mention-menu');
    assert.equal(menu.getAttribute('aria-label'), 'Persone da taggare');
    assert.equal(text(menu.querySelector('.mention-option strong')), '@tutti');
    assert.equal(text(menu.querySelector('.mention-option .muted')), 'avvisa tutta la squadra');
    area.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    assert.equal(area.value, 'Guardate @[tutti] ');
    panel.remove();
  });

  it('l anteprima di una menzione resta com è', () => {
    assert.equal(mentions.mentionExcerpt('Ciao @tutti, guardate [immagine]'), 'Ciao @tutti, guardate [immagine]');
  });
});
