import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom } from '../setup/dom.mjs';
import { ME, OTHER, item, members } from '../setup/fixtures.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const { exportBackup, exportIdeaMarkdown, ideaMarkdown } = await import('../../assets/js/export.js');
const { fmtDate } = await import('../../assets/js/lib/format.js');

const original = { ...api };
const IDEA = 'dddddddd-0000-4000-8000-000000000001';
const id = (n) => `dddddddd-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
let downloads = [];
const realClick = window.HTMLAnchorElement.prototype.click;
const realObjectUrl = URL.createObjectURL;
const realBlob = globalThis.Blob;

function vote(n, by, value) {
  store.applyItem(item({ id: id(n), kind: 'score', title: 'Scores', created_by: by, updated_by: by, data: { scores: { [IDEA]: { customer: value } } } }));
}

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  store.applyItem(item({ id: IDEA, kind: 'idea', title: 'Solar sensors', status: 'nuova', data: { pitch: 'Cheap sensors for farms' } }));
  downloads = [];
  URL.createObjectURL = () => 'blob:test';
  globalThis.Blob = class extends realBlob {
    constructor(parts, options) {
      super(parts, options);
      this.parts = parts;
    }
  };
  window.HTMLAnchorElement.prototype.click = function click() {
    downloads.push(this.download);
  };
});

afterEach(() => {
  Object.assign(api, original);
  window.HTMLAnchorElement.prototype.click = realClick;
  URL.createObjectURL = realObjectUrl;
  globalThis.Blob = realBlob;
});

describe('esportazione in Markdown in inglese', () => {
  it('apre con titolo, stato e data dell esportazione in inglese', () => {
    const md = ideaMarkdown(store.getItem(IDEA));
    assert.match(md, /^# Solar sensors\n\nStatus: \S.*  \nExported on /);
    assert.ok(md.includes(`Exported on ${fmtDate(new Date())}`));
  });

  it('senza criteri non c è la valutazione del team', () => {
    assert.doesNotMatch(ideaMarkdown(store.getItem(IDEA)), /Team scoring/);
  });

  for (const [voters, expected] of [
    [[], 'Score: no scores (scored by 0 people)'],
    [[[ME, 5]], 'Score: 100/100 (scored by 1 person)'],
    [[[ME, 5], [OTHER, 1]], /Score: \d+\/100 \(scored by 2 people\)/],
  ]) {
    it(`la valutazione si legge in inglese (votanti: ${voters.length})`, () => {
      store.applyItem(item({ id: id(10), kind: 'criteria', title: 'Criteria', data: { criteria: [{ key: 'customer', label: 'Customer', description: '', weight: 1 }] } }));
      voters.forEach(([by, value], i) => vote(20 + i, by, value));
      const md = ideaMarkdown(store.getItem(IDEA));
      assert.match(md, /## Team scoring\n\n/);
      if (typeof expected === 'string') assert.ok(md.includes(expected), md);
      else assert.match(md, expected);
    });
  }

  it('i blocchi validati del canvas, gli esperimenti e le interviste hanno titoli inglesi', () => {
    store.applyItem(item({ id: id(30), kind: 'canvas', title: 'Lean Canvas: Solar sensors', idea_id: IDEA, data: { problem: 'Farms waste water', validated: { problem: true } } }));
    store.applyItem(item({ id: id(31), kind: 'experiment', title: 'Farmers pay', status: 'in_corso', idea_id: IDEA, data: { assumption: 'They pay' } }));
    store.applyItem(item({ id: id(32), kind: 'interview', title: 'Green Farm', status: 'fatta', idea_id: IDEA, data: { contact: 'owner@farm.example', pains: 'Too much water' } }));
    const md = ideaMarkdown(store.getItem(IDEA));
    assert.match(md, /\*\*[^*]+\*\* \(validated\)\n\nFarms waste water/);
    assert.match(md, /## Experiments\n\n### Farmers pay \(/);
    assert.match(md, /## Interviews\n\n### Green Farm/);
    assert.doesNotMatch(md, /owner@farm\.example/);
  });

  it('la tabella dei concorrenti ha intestazioni inglesi, noi per primi e un sì inglese', () => {
    store.applyItem(item({
      id: id(40),
      kind: 'competitors',
      title: 'Competitors',
      idea_id: IDEA,
      data: { rivals: [{ id: 'c-1', name: 'AquaCorp', type: 'diretto' }], features: [{ id: 'f-1', label: 'Price', importance: 'alta' }], cells: { 'f-1:noi': true } },
    }));
    const md = ideaMarkdown(store.getItem(IDEA));
    assert.match(md, /\| Feature \| Importance \| Us \| AquaCorp \|\n\|---\|---\|---\|---\|\n\| Price \| \S+ \| yes \| - \|/);
  });

  it('un intervista collegata a un esperimento ne riporta il titolo', () => {
    store.applyItem(item({ id: id(31), kind: 'experiment', title: 'Farmers pay', status: 'in_corso', idea_id: IDEA, data: {} }));
    store.applyItem(item({ id: id(32), kind: 'interview', title: 'Green Farm', status: 'fatta', idea_id: IDEA, data: { experiment_id: id(31) } }));
    assert.match(ideaMarkdown(store.getItem(IDEA)), /### Green Farm\n\n\*\*[^*]+:\*\* Farmers pay/);
  });

  it('il file Markdown prende il nome dal titolo', () => {
    exportIdeaMarkdown(store.getItem(IDEA));
    assert.deepEqual(downloads, ['solar-sensors.md']);
  });
});

describe('copia di sicurezza in inglese', () => {
  it('il file ha nome e chiavi di sempre, perché si rilegge com è in qualunque lingua', async () => {
    api.exportAll = async () => ({ items: [{ id: IDEA }], revisions: [] });
    const backup = await exportBackup();
    assert.deepEqual(Object.keys(backup), ['exportedAt', 'exportedBy', 'members', 'items', 'revisions']);
    assert.equal(backup.exportedBy, ME);
    assert.deepEqual(backup.members[0], { user_id: ME, display_name: 'Anna', role: 'admin' });
    assert.match(downloads[0], /^ai-deep-endenti-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
