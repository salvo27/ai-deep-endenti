// Anteprima locale senza login, con dati finti: serve solo a controllare il layout.
import { api } from '../../assets/js/lib/api.js';
import * as store from '../../assets/js/store.js';
import { buildShell } from '../../assets/js/views/shell.js';
import { notFoundView, registerRoutes } from '../../assets/js/app.js';
import { startRouter } from '../../assets/js/router.js';
import { IDS, ME, OTHER, boardItems, item, members, revision } from '../setup/fixtures.mjs';

const extraIdeas = [
  ['Idea gamma con un titolo piuttosto lungo per vedere come va a capo', 'esplorazione'],
  ['Idea delta', 'scelta'],
  ['Idea epsilon', 'parcheggiata'],
  ['Idea zeta', 'validazione'],
].map(([title, status], i) =>
  item({
    id: `aaaaaaa${i}-0000-4000-8000-000000000000`,
    kind: 'idea',
    title,
    status,
    data: { pitch: 'Una frase che descrive l\'idea in modo abbastanza lungo da occupare due righe nella scheda.', owner: i % 2 ? OTHER : ME, technologies: ['ML', 'Ottimizzazione', 'Agenti LLM'] },
  }),
);

store.state.user = { id: ME };
store.setMembers(members());
[...boardItems(), ...extraIdeas].forEach((i) => store.applyItem(i));
store.state.commentCounts = new Map([[IDS.idea, 2]]);

const history = [
  revision({ id: 1, version: 1, op: 'create', data: { pitch: 'Prima versione del pitch', problem: 'Riga 1' }, message: 'prima versione' }),
  revision({ id: 2, version: 2, op: 'update', author_id: OTHER, status: 'validazione', data: { pitch: 'Pitch di prova riscritto meglio', problem: 'Riga 1\nRiga 2', technologies: ['XAI'] }, changed: ['status', 'pitch', 'problem', 'technologies'], message: 'chiarito il problema' }),
];
api.listRevisions = async () => [...history].reverse();
api.itemHistory = async () => history;
api.listComments = async (ids) => [ids].flat().slice(0, 1).flatMap((id) => [
  { id: 'c0000000-0000-4000-8000-000000000001', item_id: id, author_id: OTHER, body: 'Secondo me il cliente giusto è un altro: proviamo a sentire due responsabili acquisti.', created_at: '2026-10-17T10:00:00Z' },
  { id: 'c0000000-0000-4000-8000-000000000002', item_id: id, author_id: ME, body: 'Critica: manca il criterio di successo.', ai_task: 'critique', created_at: '2026-10-17T11:00:00Z' },
]);
api.activitySince = async () => [{ author_id: ME }, { author_id: OTHER }];
api.auditLog = async () => [{ id: 1, event: 'member_added', actor_id: ME, target_id: OTHER, details: { role: 'member' }, created_at: '2026-10-18T10:00:00Z' }];
api.listFactors = async () => [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'Telefono', created_at: '2026-10-18T10:00:00Z' }];
api.aiUsageLastDay = async () => 2;
api.saveItem = async ({ id, snapshot }) => ({ status: 'ok', item: { ...store.getItem(id), ...snapshot, version: store.getItem(id).version + 1 } });
api.createItem = async ({ kind, title, status, data, ideaId }) => item({ id: crypto.randomUUID(), kind, title, status, data, idea_id: ideaId });
api.invokeClaude = async () => ({
  text: '# Valutazione della board\n\n## Situazione generale\nLa board contiene una sola frase. **Non c\'è nessun elemento validato**: tutto è ipotesi.\n\n## Le tre assunzioni più rischiose\n\n1. **Che il metodo aggiunga qualcosa di sostanziale.**\n   - Il problema è noto da decenni.\n   - Va dimostrato perché un approccio generativo batte un ottimizzatore.\n2. **Che il cliente paghi.**\n\n| Ipotesi | Prova |\n|---|---|\n| Problema | 10 interviste |\n\n> Prima il problema, poi la soluzione.\n\nUsa `criterio di successo` *deciso prima*.',
  remaining: 38,
});
api.signOut = async () => {};
api.listItems = async () => [...store.state.items.values()];
api.activityFeed = async () => ({
  revisions: [
    { id: 901, item_id: IDS.idea2, kind: 'idea', op: 'create', title: 'Idea beta', status: 'nuova', changed: [], author_id: OTHER, created_at: new Date(Date.now() - 3600e3).toISOString() },
    { id: 902, item_id: IDS.idea, kind: 'idea', op: 'update', title: 'Idea alfa', status: 'validazione', changed: ['status'], author_id: OTHER, created_at: new Date(Date.now() - 600e3).toISOString() },
    { id: 903, item_id: IDS.experiment, kind: 'experiment', op: 'update', title: 'I clienti pagano?', status: 'concluso', changed: ['status'], author_id: OTHER, created_at: new Date(Date.now() - 120e3).toISOString() },
  ],
  comments: [{ id: 'c0000000-0000-4000-8000-000000000099', item_id: IDS.canvas, author_id: OTHER, ai_task: 'critique', created_at: new Date(Date.now() - 60e3).toISOString() }],
});
localStorage.setItem(`bdp:notificheLette:${ME}`, JSON.stringify(new Date(Date.now() - 2 * 3600e3).toISOString()));
api.commentCounts = async () => store.state.commentCounts;

const { outlet } = buildShell(document.getElementById('app'), { onSignOut() {} });
registerRoutes();
startRouter(outlet, { fallback: notFoundView });
import('../../assets/js/notifications.js').then((m) => m.startNotifications());
