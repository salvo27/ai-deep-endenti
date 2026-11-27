import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { IDS, ME, OTHER, PROJECT, boardItems, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let chat;
let mentions;
let bell;
let chips;
let comments;
let original;
let read;

const GENERAL = 'dddddddd-0000-4000-8000-000000000001';
const TOPIC = 'dddddddd-0000-4000-8000-000000000002';
const MSG = 'eeeeeeee-0000-4000-8000-000000000001';
const mention = (over) => ({ id: 1, project_id: PROJECT, user_id: ME, author_id: OTHER, source: 'chat', source_id: MSG, chat_id: GENERAL, item_id: null, excerpt: 'Hi @Anna, look', created_at: '2026-10-22T09:00:00Z', read_at: null, ...over });

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
  store.setProject({ id: PROJECT, name: 'Alpha', role: 'admin' });
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  read = [];
  api.listChats = async () => [
    { id: GENERAL, project_id: PROJECT, title: 'Generale', is_general: true, idea_id: null, archived_at: null, created_at: '2026-10-01T10:00:00Z' },
    { id: TOPIC, project_id: PROJECT, title: 'Grants', is_general: false, idea_id: null, archived_at: null, created_at: '2026-10-02T10:00:00Z' },
  ];
  api.chatOverview = async () => [];
  api.listMentions = async () => [mention(), mention({ id: 2, source: 'comment', source_id: 'cccccccc-0000-4000-8000-000000000001', chat_id: null, item_id: IDS.idea, read_at: '2026-10-22T08:00:00Z' })];
  api.markMentionsRead = async (ids, project) => read.push([ids, project]);
  api.listComments = async () => [];
  chat.stopChats();
  await chat.startChats();
  mentions.stopMentions();
  await mentions.startMentions();
  document.body.querySelectorAll('.toasts, .bell-box, .comments-panel').forEach((el) => el.remove());
});

afterEach(() => {
  chat.stopChats();
  mentions.stopMentions();
  Object.assign(api, original);
});

function mentionsBox() {
  const box = bell.mentionsButton();
  document.body.append(box);
  return box;
}

const type = (area, value) => {
  area.value = value;
  area.setSelectionRange(value.length, value.length);
  area.dispatchEvent(new Event('input'));
};

async function commentArea() {
  const panel = comments.commentsPanel(store.getItem(IDS.idea));
  document.body.append(panel);
  await flush(3);
  return { panel, area: panel.querySelector('textarea') };
}

describe('menzioni in inglese', () => {
  for (const [label, row, expected] of [
    ['nella chat generale, che si chiama General', mention(), 'Bruno tagged you in “General”'],
    ['in una chat per argomento', mention({ chat_id: TOPIC }), 'Bruno tagged you in “Grants”'],
    ['in una chat che non c è più', mention({ chat_id: 'dddddddd-0000-4000-8000-0000000000ff' }), 'Bruno tagged you in “chat”'],
    ['in una nota', mention({ source: 'note', item_id: IDS.idea, chat_id: null }), 'Bruno tagged you in the note “Idea alfa”'],
    ['in una nota che non c è più', mention({ source: 'note', item_id: 'cccccccc-0000-4000-8000-0000000000ff', chat_id: null }), 'Bruno tagged you in the note “note”'],
    ['in un commento', mention({ source: 'comment', item_id: IDS.canvas, chat_id: null }), 'Bruno tagged you in a comment on “Lean Canvas: Idea alfa”'],
    ['in un commento su una scheda che non c è più', mention({ source: 'comment', item_id: null, chat_id: null }), 'Bruno tagged you in a comment on “a card”'],
    ['da qualcuno che non è più nel progetto', mention({ author_id: '00000000-0000-4000-8000-0000000000ee' }), 'Former member tagged you in “General”'],
  ]) {
    it(`dicono chi ti ha taggato e dove: ${label}`, () => {
      assert.equal(mentions.mentionText(row), expected);
    });
  }

  it('il pulsante @ e il suo elenco sono in inglese', () => {
    const box = mentionsBox();
    const button = box.querySelector('.mentions-btn');
    assert.equal(button.getAttribute('aria-label'), 'Mentions, 1 to read');
    assert.equal(box.querySelector('.bell-panel').getAttribute('aria-label'), 'Mentions');
    button.click();
    assert.equal(text(box.querySelector('.bell-head strong')), 'Mentions');
    assert.match(text(box.querySelector('.mention-item')), /Bruno tagged you in “General”/);
    byText(box, 'button', 'Mark all as read').click();
    assert.deepEqual(read, [[null, PROJECT]]);
    assert.equal(button.getAttribute('aria-label'), 'Mentions');
  });

  it('senza menzioni lo spiega in inglese', async () => {
    api.listMentions = async () => [];
    await mentions.loadMentions();
    const box = mentionsBox();
    box.querySelector('.mentions-btn').click();
    assert.equal(text(box.querySelector('.bell-empty')), 'No mentions. When someone tags you with @ in a chat, a comment or a note, you see it here.');
  });

  it('una menzione nuova arriva con un avviso in inglese', () => {
    store.emit('mention-row', { row: mention({ id: 3, source: 'note', source_id: IDS.idea, item_id: IDS.idea, chat_id: null }), removed: false });
    assert.match(text(document.querySelector('.toasts')), /@ Bruno tagged you in the note “Idea alfa”/);
  });

  it('l anteprima mostra everyone e image al posto delle parole che salva il database', () => {
    for (const [stored, shown] of [
      ['Look @tutti [immagine]', 'Look @everyone [image]'],
      ['@tutti, please', '@everyone, please'],
      ['@Tutti', '@everyone'],
      ['@tuttifrutti stays', '@tuttifrutti stays'],
      ['no tags here', 'no tags here'],
      ['', ''],
    ]) {
      assert.equal(mentions.mentionExcerpt(stored), shown, stored);
    }
  });

  it('l anteprima non cambia il nome di una persona che comincia con Tutti', () => {
    store.setMembers([...members(), { user_id: '00000000-0000-4000-8000-0000000000dd', display_name: 'Tutti Frutti', role: 'member', color: '#000000' }]);
    assert.equal(mentions.mentionExcerpt('Hi @Tutti Frutti and @tutti'), 'Hi @Tutti Frutti and @everyone');
  });

  it('nell elenco l anteprima è tradotta', async () => {
    api.listMentions = async () => [mention({ excerpt: 'Look @tutti' })];
    await mentions.loadMentions();
    const box = mentionsBox();
    box.querySelector('.mentions-btn').click();
    assert.equal(text(box.querySelector('.mention-excerpt')), 'Look @everyone');
  });

  it('nel pannello non restano parole italiane', () => {
    const box = mentionsBox();
    box.querySelector('.mentions-btn').click();
    box.querySelectorAll('.mention-excerpt').forEach((el) => el.remove());
    const attributes = [...box.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));
    // «Idea alfa» è il titolo di una scheda dei dati di prova.
    assert.deepEqual(italianWords([text(box), ...attributes].join(' ')), []);
  });
});

describe('suggerimenti e tag in inglese', () => {
  it('scrivendo @ si propone everyone per avvisare tutto il team', async () => {
    const { panel, area } = await commentArea();
    type(area, 'Look @ev');
    const menu = panel.querySelector('.mention-menu');
    assert.equal(menu.getAttribute('aria-label'), 'People to tag');
    assert.deepEqual([...menu.querySelectorAll('.mention-option')].map((o) => [text(o.querySelector('strong')), text(o.querySelector('.muted'))]), [['@everyone', 'notify the whole team']]);
    panel.remove();
  });

  it('scegliendo everyone il testo salva @[tutti], il tag che il database riconosce', async () => {
    const { panel, area } = await commentArea();
    type(area, 'Look @ev');
    area.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    assert.equal(area.value, 'Look @[tutti] ');
    type(area, '@tu');
    assert.equal(text(panel.querySelector('.mention-menu .mention-option strong')), '@everyone', 'anche la parola salvata trova tutti');
    panel.remove();
  });

  it('le persone si propongono con il loro nome, come in italiano', async () => {
    const { panel, area } = await commentArea();
    type(area, 'Look @br');
    area.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    assert.equal(area.value, 'Look @[Bruno] ');
    panel.remove();
  });

  it('il tag di tutti si legge @everyone ed è evidenziato per chi legge', () => {
    const chip = chips.mentionChip('tutti');
    assert.equal(chip.textContent, '@everyone');
    assert.equal(chip.getAttribute('title'), 'The whole team');
    assert.ok(chip.classList.contains('is-me'));
    assert.equal(chips.mentionChip('Bruno').textContent, '@Bruno');
    assert.equal(chips.mentionChip('everyone'), '@everyone', 'scritto in inglese tra parentesi non è il tag di tutti');
    assert.equal(chips.mentionsMe('Hi @[tutti]'), true);
  });
});
