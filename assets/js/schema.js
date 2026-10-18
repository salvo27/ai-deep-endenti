import {
  LIMITS,
  cleanLine,
  cleanText,
  intInRange,
  isIsoDate,
  isKey,
  isUuid,
  slugKey,
  uniqueStrings,
  uniqueUuids,
} from './lib/validate.js';

export const TECH_SUGGESTIONS = [
  'Inverse design',
  'Vincoli dichiarativi',
  'Agenti generativi (LLM)',
  'Explainable AI',
  'Spiegazioni controfattuali',
  'Previsione di serie temporali',
  'Ottimizzazione con vincoli',
  'LLM come interfaccia',
  'Modelli ad agenti',
];

export const COMMITMENT = [
  ['nessuno', 'Nessuno'],
  ['interesse', 'Interesse generico'],
  ['demo', 'Vuole vedere una demo'],
  ['pilota', 'Disponibile a un pilota'],
  ['pagamento', 'Pilota a pagamento o lettera d\'intenti'],
];

export const STRONG_COMMITMENTS = new Set(['pilota', 'pagamento']);

export const CANVAS_BLOCKS = [
  { key: 'problem', label: 'Problema', area: 'prob', help: 'I tre problemi principali', main: true },
  { key: 'alternatives', label: 'Alternative esistenti', area: 'prob', help: 'Come lo risolvono oggi' },
  { key: 'solution', label: 'Soluzione', area: 'sol', help: 'Le tre funzionalità principali', main: true },
  { key: 'metrics', label: 'Metriche chiave', area: 'met', help: 'I numeri che dicono se funziona', main: true },
  { key: 'uvp', label: 'Proposta di valore unica', area: 'uvp', help: 'Perché scegliere noi, in una frase', main: true },
  { key: 'concept', label: 'Concetto in breve', area: 'uvp', help: 'Per esempio "X per Y"' },
  { key: 'advantage', label: 'Vantaggio sleale', area: 'adv', help: 'Ciò che non si copia né si compra', main: true },
  { key: 'channels', label: 'Canali', area: 'chan', help: 'Come raggiungiamo i clienti', main: true },
  { key: 'segments', label: 'Segmenti di clienti', area: 'seg', help: 'Chi sono i clienti', main: true },
  { key: 'early_adopters', label: 'Early adopter', area: 'seg', help: 'Chi lo vorrebbe subito' },
  { key: 'costs', label: 'Struttura dei costi', area: 'cost', main: true },
  { key: 'revenue', label: 'Flussi di ricavo', area: 'rev', main: true },
];

const field = (key, label, type = 'textarea', extra = {}) => ({ key, label, type, ...extra });

export const KINDS = {
  idea: {
    label: 'Idea',
    plural: 'Idee',
    icon: 'idea',
    titleLabel: 'Nome dell\'idea',
    statuses: [
      ['nuova', 'Nuova'],
      ['esplorazione', 'In esplorazione'],
      ['validazione', 'In validazione'],
      ['scelta', 'Scelta'],
      ['parcheggiata', 'Parcheggiata'],
      ['scartata', 'Scartata'],
    ],
    fields: [
      field('pitch', 'In una frase', 'textarea', { rows: 2, wide: true, placeholder: 'Aiutiamo [chi] a [risolvere cosa] grazie a [come]' }),
      field('problem', 'Problema', 'textarea', { placeholder: 'Quale problema, per chi, quanto pesa oggi' }),
      field('customer', 'Cliente', 'textarea', { placeholder: 'Chi paga e chi usa: ruolo, tipo di organizzazione' }),
      field('solution', 'Soluzione'),
      field('why_us', 'Perché noi', 'textarea', { placeholder: 'Competenze, dati, contatti o ricerca che altri non hanno' }),
      field('technologies', 'Tecnologie', 'tags', { suggestions: TECH_SUGGESTIONS }),
      field('sector', 'Settore', 'text'),
      field('owner', 'Responsabile', 'member'),
      field('competitors', 'Concorrenti e alternative'),
      field('risks', 'Rischi principali'),
      field('next_step', 'Prossimo passo', 'text'),
      field('resources', 'Paper e link', 'textarea', { placeholder: 'Un riferimento per riga' }),
    ],
    extraKeys: ['origin'],
  },
  canvas: {
    label: 'Lean Canvas',
    plural: 'Lean Canvas',
    icon: 'canvas',
    titleLabel: 'Titolo',
    needsIdea: true,
    statuses: null,
    fields: CANVAS_BLOCKS.map((b) => field(b.key, b.label, 'textarea', { help: b.help })),
    extraKeys: ['validated'],
  },
  experiment: {
    label: 'Esperimento',
    plural: 'Esperimenti',
    icon: 'experiment',
    titleLabel: 'Che cosa vogliamo scoprire',
    needsIdea: true,
    statuses: [
      ['pianificato', 'Pianificato'],
      ['in_corso', 'In corso'],
      ['concluso', 'Concluso'],
    ],
    fields: [
      field('customer', 'Cliente', 'textarea', { rows: 2 }),
      field('problem', 'Problema', 'textarea', { rows: 2 }),
      field('solution', 'Soluzione ipotizzata', 'textarea', { rows: 2 }),
      field('assumption', 'Assunzione più rischiosa', 'textarea', { rows: 2, wide: true, placeholder: 'Se è falsa, l\'idea non sta in piedi' }),
      field('assumption_type', 'Tipo di assunzione', 'select', {
        options: [
          ['problema', 'Il problema esiste'],
          ['cliente', 'Il cliente è quello giusto'],
          ['soluzione', 'La soluzione funziona'],
          ['prezzo', 'Sono disposti a pagare'],
          ['canale', 'Riusciamo a raggiungerli'],
          ['tecnica', 'È fattibile tecnicamente'],
          ['normativa', 'È fattibile per le norme'],
        ],
      }),
      field('method', 'Metodo', 'select', {
        options: [
          ['interviste', 'Interviste'],
          ['demo', 'Demo o prototipo'],
          ['landing', 'Landing page'],
          ['prevendita', 'Prevendita o pilota'],
          ['dati', 'Analisi di dati'],
          ['concierge', 'Servizio manuale (concierge)'],
          ['altro', 'Altro'],
        ],
      }),
      field('method_details', 'Come lo facciamo'),
      field('success_criterion', 'Criterio di successo', 'textarea', {
        rows: 2,
        wide: true,
        placeholder: 'Deciso prima di iniziare. Per esempio: almeno 5 su 15 chiedono una demo',
      }),
      field('owner', 'Responsabile', 'member'),
      field('start_date', 'Inizio', 'date'),
      field('end_date', 'Scadenza', 'date'),
      field('result', 'Risultato', 'textarea', { placeholder: 'Numeri e fatti, non impressioni' }),
      field('learnings', 'Cosa abbiamo imparato'),
      field('decision', 'Decisione', 'select', {
        options: [
          ['proseguire', 'Proseguire'],
          ['cambiare', 'Cambiare direzione'],
          ['abbandonare', 'Abbandonare'],
        ],
      }),
    ],
  },
  interview: {
    label: 'Intervista',
    plural: 'Interviste',
    icon: 'interview',
    titleLabel: 'Titolo',
    statuses: [
      ['da_fare', 'Da fare'],
      ['fatta', 'Fatta'],
      ['analizzata', 'Analizzata'],
    ],
    fields: [
      field('date', 'Data', 'date'),
      field('interviewer', 'Intervistatore', 'member'),
      field('role', 'Ruolo dell\'intervistato', 'text', { placeholder: 'Per esempio: responsabile acquisti, medico di base' }),
      field('organization', 'Organizzazione', 'text'),
      field('segment', 'Segmento', 'text'),
      field('experiment_id', 'Esperimento', 'experiment'),
      field('current_solution', 'Come lo risolve oggi'),
      field('pains', 'Problemi e frustrazioni'),
      field('quotes', 'Citazioni testuali', 'textarea', { placeholder: 'Una per riga, parole esatte' }),
      field('willingness_to_pay', 'Disponibilità a pagare', 'textarea', { rows: 2 }),
      field('problem_intensity', 'Quanto sente il problema', 'scale', { help: '1 = per niente, 5 = è una priorità' }),
      field('commitment', 'Impegno preso', 'select', { options: COMMITMENT, help: 'Conta più di qualsiasi complimento' }),
      field('notes', 'Appunti'),
      field('follow_up', 'Follow-up', 'text'),
      field('contact', 'Contatto', 'text', { help: 'Solo se serve per ricontattarlo' }),
    ],
  },
  decision: {
    label: 'Decisione',
    plural: 'Decisioni',
    icon: 'decision',
    titleLabel: 'Decisione in breve',
    statuses: [
      ['proposta', 'Proposta'],
      ['presa', 'Presa'],
      ['rivista', 'Rivista'],
    ],
    fields: [
      field('date', 'Data', 'date'),
      field('context', 'Contesto'),
      field('options', 'Alternative considerate'),
      field('decision', 'Decisione', 'textarea', { wide: true }),
      field('rationale', 'Motivazione'),
      field('decided_by', 'Chi ha deciso', 'members'),
      field('ideas', 'Idee collegate', 'ideas'),
      field('review_date', 'Da rivedere entro', 'date'),
    ],
  },
  criteria: { label: 'Criteri di valutazione', plural: 'Criteri', icon: 'scoring', titleLabel: 'Titolo', statuses: null, fields: [] },
  score: { label: 'Voti', plural: 'Voti', icon: 'scoring', titleLabel: 'Titolo', statuses: null, fields: [] },
  generator: { label: 'Generatore', plural: 'Generatore', icon: 'generator', titleLabel: 'Titolo', statuses: null, fields: [] },
};

export const BOARD_KINDS = ['idea', 'canvas', 'experiment', 'interview', 'decision'];

export function kindOf(kind) {
  return KINDS[kind] || null;
}

export function defaultStatus(kind) {
  return KINDS[kind]?.statuses?.[0]?.[0] ?? null;
}

export function statusLabel(kind, status) {
  return KINDS[kind]?.statuses?.find(([value]) => value === status)?.[1] ?? status ?? '';
}

export function fieldOf(kind, key) {
  return KINDS[kind]?.fields.find((f) => f.key === key) || null;
}

export function optionLabel(fieldDef, value) {
  return fieldDef?.options?.find(([v]) => v === value)?.[1] ?? value;
}

function sanitizeField(def, value) {
  switch (def.type) {
    case 'text':
      return cleanLine(value) || undefined;
    case 'textarea':
      return cleanText(value) || undefined;
    case 'select':
      return def.options.some(([v]) => v === value) ? value : undefined;
    case 'date':
      return isIsoDate(value) ? value : undefined;
    case 'member':
    case 'experiment':
      return isUuid(value) ? value : undefined;
    case 'members':
    case 'ideas': {
      const ids = uniqueUuids(value);
      return ids.length ? ids : undefined;
    }
    case 'tags': {
      const tags = uniqueStrings(value);
      return tags.length ? tags : undefined;
    }
    case 'scale':
      return intInRange(value, 1, 5) ?? undefined;
    default:
      return undefined;
  }
}

function sanitizeCriteria(data) {
  const seen = new Set();
  const criteria = [];
  for (const row of Array.isArray(data?.criteria) ? data.criteria : []) {
    const label = cleanLine(row?.label, 80);
    if (!label) continue;
    let key = isKey(row?.key) ? row.key : slugKey(label);
    while (seen.has(key)) key = `${key}-x`.slice(0, 60);
    seen.add(key);
    criteria.push({
      key,
      label,
      description: cleanLine(row?.description, 240),
      weight: intInRange(row?.weight, 0, 5) ?? 1,
    });
    if (criteria.length >= 30) break;
  }
  return { criteria };
}

function sanitizeScore(data) {
  const scores = {};
  const notes = {};
  for (const [ideaId, values] of Object.entries(data?.scores || {})) {
    if (!isUuid(ideaId) || !values || typeof values !== 'object') continue;
    const clean = {};
    for (const [key, value] of Object.entries(values)) {
      const n = intInRange(value, 1, 5);
      if (isKey(key) && n !== null) clean[key] = n;
    }
    if (Object.keys(clean).length) scores[ideaId] = clean;
  }
  for (const [ideaId, note] of Object.entries(data?.notes || {})) {
    const clean = cleanText(note, 2000);
    if (isUuid(ideaId) && clean) notes[ideaId] = clean;
  }
  return { scores, notes };
}

function sanitizeAxis(list) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(list) ? list : []) {
    const label = cleanLine(row?.label, 80);
    const id = typeof row?.id === 'string' && /^[a-z0-9-]{1,40}$/.test(row.id) ? row.id : null;
    if (!label || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
    if (out.length >= 20) break;
  }
  return out;
}

function sanitizeGenerator(data) {
  const rows = sanitizeAxis(data?.rows);
  const cols = sanitizeAxis(data?.cols);
  const rowIds = new Set(rows.map((r) => r.id));
  const colIds = new Set(cols.map((c) => c.id));
  const cells = {};
  for (const [key, cell] of Object.entries(data?.cells || {})) {
    const [rowId, colId] = key.split(':');
    if (!rowIds.has(rowId) || !colIds.has(colId)) continue;
    const text = cleanText(cell?.text, 4000);
    const potential = intInRange(cell?.potential, 0, 3) ?? 0;
    if (text || potential) cells[key] = { text, potential };
  }
  return { rows, cols, cells };
}

// Valido per costruzione: ogni salvataggio passa da qui e i campi sconosciuti o malformati vengono scartati.
export function sanitizeSnapshot(kind, snapshot) {
  const def = KINDS[kind];
  if (!def) throw new Error(`Tipo sconosciuto: ${kind}`);
  const raw = snapshot?.data && typeof snapshot.data === 'object' ? snapshot.data : {};
  let data = {};

  if (kind === 'criteria') data = sanitizeCriteria(raw);
  else if (kind === 'score') data = sanitizeScore(raw);
  else if (kind === 'generator') data = sanitizeGenerator(raw);
  else {
    for (const f of def.fields) {
      const value = sanitizeField(f, raw[f.key]);
      if (value !== undefined) data[f.key] = value;
    }
    if (kind === 'canvas') {
      const validated = {};
      for (const block of CANVAS_BLOCKS) {
        if (raw.validated?.[block.key] === true) validated[block.key] = true;
      }
      if (Object.keys(validated).length) data.validated = validated;
    }
    if (kind === 'idea' && typeof raw.origin === 'string' && /^[a-z0-9-]{1,40}:[a-z0-9-]{1,40}$/.test(raw.origin)) {
      data.origin = raw.origin;
    }
  }

  const status = def.statuses
    ? def.statuses.some(([v]) => v === snapshot?.status)
      ? snapshot.status
      : defaultStatus(kind)
    : null;
  let ideaId = isUuid(snapshot?.idea_id) ? snapshot.idea_id : null;
  if (!['canvas', 'experiment', 'interview'].includes(kind)) ideaId = null;

  return {
    title: cleanLine(snapshot?.title, LIMITS.title),
    status,
    idea_id: ideaId,
    data,
  };
}

export function snapshotProblem(kind, snapshot) {
  const def = KINDS[kind];
  if (BOARD_KINDS.includes(kind) && !snapshot.title) return `Manca il campo "${def.titleLabel}".`;
  if (def.needsIdea && !snapshot.idea_id) return 'Scegli l\'idea a cui appartiene.';
  return null;
}

export function autoInterviewTitle(data) {
  const parts = [data.role, data.organization].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Intervista';
}

const TOP_LABELS = { title: null, status: 'Stato', idea_id: 'Idea collegata' };

// Etichetta leggibile per un percorso dello storico, come "data.problem" o "data.scores.<id>.mercato".
export function describePath(kind, path, ctx = {}) {
  if (path === 'title') return KINDS[kind]?.titleLabel || 'Titolo';
  if (path in TOP_LABELS) return TOP_LABELS[path];
  const rest = path.replace(/^data\./, '');
  const [head, ...tail] = rest.split('.');

  if (kind === 'score') {
    const [, ideaId, criterion] = rest.split('.');
    const ideaTitle = ctx.ideaTitle?.(ideaId) || 'Idea';
    if (head === 'notes') return `Note › ${ideaTitle}`;
    return `Voti › ${ideaTitle} › ${ctx.criterionLabel?.(criterion) || criterion || ''}`.trim();
  }
  if (kind === 'criteria') {
    if (rest === 'criteria.#order') return 'Criteri › ordine';
    const match = rest.match(/^criteria#([^.]+)\.(\w+)$/);
    if (match) {
      const prop = { label: 'Nome', description: 'Descrizione', weight: 'Peso' }[match[2]] || match[2];
      return `Criteri › ${ctx.criterionLabel?.(match[1]) || match[1]} › ${prop}`;
    }
  }
  if (kind === 'generator') {
    const axis = head.match(/^(rows|cols)(?:#(.+))?$/);
    if (axis) {
      const name = axis[1] === 'rows' ? 'Righe' : 'Colonne';
      if (rest.endsWith('#order')) return `${name} › ordine`;
      return axis[2] ? `${name} › ${ctx.axisLabel?.(axis[2]) || axis[2]}` : name;
    }
    if (head === 'cells') {
      const [rowId, colId] = (tail[0] || '').split(':');
      const what = tail[1] === 'potential' ? ' › potenziale' : '';
      return `${ctx.axisLabel?.(rowId) || rowId} × ${ctx.axisLabel?.(colId) || colId}${what}`;
    }
  }
  if (kind === 'canvas' && head === 'validated') {
    return `${CANVAS_BLOCKS.find((b) => b.key === tail[0])?.label || tail[0]} › validato`;
  }
  if (kind === 'idea' && head === 'origin') return 'Origine nel generatore';
  return fieldOf(kind, head)?.label || head;
}

export function formatValue(kind, path, value, ctx = {}) {
  if (value === undefined || value === null) return '';
  if (path === 'status') return statusLabel(kind, value);
  if (path === 'idea_id') return ctx.ideaTitle?.(value) || 'Idea';
  const key = path.replace(/^data\./, '').split('.')[0];
  const def = fieldOf(kind, key);
  if (def) {
    if (def.type === 'select') return optionLabel(def, value);
    if (def.type === 'member') return ctx.memberName?.(value) || 'Membro';
    if (def.type === 'experiment') return ctx.itemTitle?.(value) || 'Esperimento';
    if (def.type === 'members') return (Array.isArray(value) ? value : [value]).map((id) => ctx.memberName?.(id) || 'Membro');
    if (def.type === 'ideas') return (Array.isArray(value) ? value : [value]).map((id) => ctx.ideaTitle?.(id) || 'Idea');
    if (def.type === 'scale') return `${value}/5`;
  }
  if (typeof value === 'boolean') return value ? 'sì' : 'no';
  return value;
}

export function routeFor(item) {
  if (!item) return '#/';
  if (item.kind === 'idea') return `#/idea/${item.id}`;
  if (item.kind === 'criteria' || item.kind === 'score') return '#/valutazione';
  if (item.kind === 'generator') return '#/generatore';
  return `#/elemento/${item.id}`;
}

export const DEFAULT_CRITERIA = [
  { key: 'cliente', label: 'Cliente che conosciamo', description: 'Conosciamo di persona almeno un possibile cliente', weight: 3 },
  { key: 'demo', label: 'Demo in due mesi', description: 'Possiamo mostrare qualcosa di concreto entro due mesi', weight: 2 },
  { key: 'dati', label: 'Accesso ai dati', description: 'Abbiamo o possiamo ottenere i dati necessari', weight: 3 },
  { key: 'competenze', label: 'Competenze di settore', description: 'Nel team o tra i partner c\'è chi conosce il settore', weight: 3 },
  { key: 'mercato', label: 'Mercato', description: 'Dimensione e disponibilità a pagare', weight: 2 },
  { key: 'concorrenza', label: 'Spazio rispetto ai concorrenti', description: '5 = pochi concorrenti forti o un elemento distintivo chiaro', weight: 2 },
  { key: 'difendibile', label: 'Vantaggio difendibile', description: 'Dati, tecnologia o relazioni difficili da copiare', weight: 2 },
  { key: 'team', label: 'Fit con il team', description: 'Usa le nostre competenze e ci motiva', weight: 2 },
  { key: 'ricavi', label: 'Tempo ai primi ricavi', description: '5 = ricavi entro sei mesi', weight: 2 },
  { key: 'norme', label: 'Semplicità normativa', description: '5 = nessun ostacolo normativo rilevante', weight: 1 },
];
