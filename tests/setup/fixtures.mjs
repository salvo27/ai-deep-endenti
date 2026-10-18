// Dati di prova per i test dell'interfaccia.
export const ME = '00000000-0000-4000-8000-00000000000a';
export const OTHER = '00000000-0000-4000-8000-00000000000b';
export const ADVISOR = '00000000-0000-4000-8000-00000000000c';

export const IDS = {
  idea: '11111111-1111-4111-8111-111111111111',
  idea2: '11111111-1111-4111-8111-111111111112',
  canvas: '22222222-2222-4222-8222-222222222222',
  experiment: '33333333-3333-4333-8333-333333333333',
  interview: '44444444-4444-4444-8444-444444444444',
  decision: '55555555-5555-4555-8555-555555555555',
  criteria: '66666666-6666-4666-8666-666666666666',
  score: '77777777-7777-4777-8777-777777777777',
  generator: '88888888-8888-4888-8888-888888888888',
  trashed: '99999999-9999-4999-8999-999999999999',
};

export const XSS = '<img src=x onerror="window.__xss=1">';

export function item(over) {
  return {
    title: 'Elemento',
    status: null,
    idea_id: null,
    data: {},
    version: 1,
    created_by: ME,
    updated_by: ME,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-17T10:00:00Z',
    deleted_at: null,
    ...over,
  };
}

export function members() {
  return [
    { user_id: ME, display_name: 'Anna', role: 'admin', color: '#4f5bd5', email: 'me@test.it', mfa_enabled: true, last_sign_in_at: '2026-10-18T08:00:00Z' },
    { user_id: OTHER, display_name: 'Bruno', role: 'member', color: '#18794e', email: 'bruno@test.it', mfa_enabled: true, last_sign_in_at: null },
    { user_id: ADVISOR, display_name: 'Chiara', role: 'advisor', color: '#a35a00', email: 'chiara@test.it', mfa_enabled: false, last_sign_in_at: null },
  ];
}

export function boardItems({ xss = false } = {}) {
  const title = (t) => (xss ? `${t} ${XSS}` : t);
  return [
    item({ id: IDS.idea, kind: 'idea', title: title('Idea alfa'), status: 'validazione', data: { pitch: title('Pitch di prova'), owner: ME, technologies: ['XAI'], sector: 'Settore A', origin: 'r-xai:c-sa', problem: 'Riga 1\nRiga 2' } }),
    item({ id: IDS.idea2, kind: 'idea', title: 'Idea beta', status: 'nuova', data: { owner: OTHER } }),
    item({ id: IDS.canvas, kind: 'canvas', title: 'Lean Canvas: Idea alfa', idea_id: IDS.idea, data: { problem: title('Problema di prova'), validated: { problem: true } } }),
    item({ id: IDS.experiment, kind: 'experiment', title: title('I clienti pagano?'), status: 'in_corso', idea_id: IDS.idea, data: { assumption: 'Pagano', owner: ME, end_date: '2026-10-01', method: 'interviste' } }),
    item({ id: IDS.interview, kind: 'interview', title: 'Azienda Rossi', status: 'fatta', idea_id: IDS.idea, data: { date: '2026-10-12', interviewer: ME, commitment: 'pilota', problem_intensity: 4, quotes: title('Succede spesso') } }),
    item({ id: IDS.decision, kind: 'decision', title: 'Due finalisti', status: 'presa', data: { date: '2026-10-16', decision: 'Testare alfa e beta', ideas: [IDS.idea, IDS.idea2], decided_by: [ME, OTHER] } }),
    item({ id: IDS.criteria, kind: 'criteria', title: 'Criteri', data: { criteria: [{ key: 'cliente', label: 'Cliente', description: 'Lo conosciamo', weight: 3 }, { key: 'mercato', label: 'Mercato', description: '', weight: 1 }] } }),
    item({ id: IDS.score, kind: 'score', title: 'Voti di Bruno', created_by: OTHER, updated_by: OTHER, data: { scores: { [IDS.idea]: { cliente: 5, mercato: 2 } } } }),
    item({ id: IDS.generator, kind: 'generator', title: 'Generatore', data: { rows: [{ id: 'r-xai', label: 'XAI' }], cols: [{ id: 'c-sa', label: 'Settore A' }], cells: { 'r-xai:c-sa': { text: title('Idea alfa'), potential: 3 } } } }),
    item({ id: IDS.trashed, kind: 'idea', title: 'Idea archiviata', status: 'scartata', deleted_at: '2026-10-15T10:00:00Z', updated_by: OTHER }),
  ];
}

export function revision(over) {
  return {
    id: 1,
    item_id: IDS.idea,
    version: 1,
    op: 'create',
    kind: 'idea',
    idea_id: null,
    title: 'Idea alfa',
    status: 'nuova',
    data: {},
    changed: [],
    author_id: ME,
    message: null,
    created_at: '2026-10-17T10:00:00Z',
    ...over,
  };
}
