import { api, AppError } from './lib/api.js';
import { CANVAS_BLOCKS, KINDS, optionLabel, statusLabel } from './schema.js';
import { fmtDate, fmtMoney } from './lib/format.js';

export const AI_TASKS = {
  critique: 'Critica',
  next_experiment: 'Prossimo esperimento',
  interview_questions: 'Domande per le interviste',
  interview_synthesis: 'Sintesi delle interviste',
  cell_ideas: 'Idee per la cella',
};

export const MAX_CONTEXT = 40000;

// Minimizzazione dei dati: a Claude va solo il contenuto delle board, mai persone o contatti.
const EXCLUDED_TYPES = new Set(['member', 'members']);
const EXCLUDED_KEYS = new Set(['contact']);

function valueText(def, value) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return def.type === 'ideas' ? null : value.join(', ');
  if (def.type === 'select') return optionLabel(def, value);
  if (def.type === 'date') return fmtDate(value);
  if (def.type === 'scale') return `${value}/5`;
  if (def.type === 'money') return fmtMoney(value);
  if (def.type === 'experiment' || def.type === 'interview') return null;
  return String(value);
}

export function itemText(item, { heading = '#' } = {}) {
  const def = KINDS[item.kind];
  const lines = [`${heading} ${def.label}: ${item.title}`];
  if (item.status) lines.push(`Stato: ${statusLabel(item.kind, item.status)}`);
  if (item.kind === 'canvas') {
    for (const block of CANVAS_BLOCKS) {
      const value = item.data?.[block.key];
      if (!value) continue;
      const validated = item.data?.validated?.[block.key] ? ' (validato con dati)' : '';
      lines.push(`${block.label}${validated}: ${value}`);
    }
    return lines.join('\n');
  }
  if (item.kind === 'competitors') {
    const data = item.data || {};
    const names = new Map([['noi', 'Noi'], ...(data.rivals || []).map((r) => [r.id, r.name])]);
    for (const r of data.rivals || []) lines.push(`Concorrente ${r.type}: ${r.name}${r.note ? ` (${r.note})` : ''}`);
    for (const f of data.features || []) {
      const who = [...names].filter(([id]) => data.cells?.[`${f.id}:${id}`]).map(([, name]) => name);
      lines.push(`Funzionalità «${f.label}» (importanza ${f.importance}): ${who.length ? who.join(', ') : 'nessuno'}`);
    }
  }
  for (const f of def.fields) {
    if (EXCLUDED_TYPES.has(f.type) || EXCLUDED_KEYS.has(f.key)) continue;
    const text = valueText(f, item.data?.[f.key]);
    if (text) lines.push(`${f.label}: ${text}`);
  }
  return lines.join('\n');
}

export function buildContext(task, { item, idea, canvases = [], experiments = [], interviews = [], boards = [], cell, existingIdeas = [] } = {}) {
  const parts = [];
  if (task === 'cell_ideas') {
    parts.push(`Capacità del team: ${cell?.row || ''}`, `Settore: ${cell?.col || ''}`);
    if (cell?.text) parts.push(`Spunti già scritti:\n${cell.text}`);
    if (existingIdeas.length) parts.push(`Idee già presenti nella board:\n${existingIdeas.map((t) => `- ${t}`).join('\n')}`);
  } else {
    if (idea) parts.push(itemText(idea));
    if (item && item.id !== idea?.id) parts.push(itemText(item));
    for (const canvas of canvases) if (canvas.id !== item?.id) parts.push(itemText(canvas, { heading: '##' }));
    for (const board of boards) if (board.id !== item?.id) parts.push(itemText(board, { heading: '##' }));
    for (const experiment of experiments) if (experiment.id !== item?.id) parts.push(itemText(experiment, { heading: '##' }));
    interviews.forEach((interview) => parts.push(itemText(interview, { heading: '##' })));
  }
  const context = parts.filter(Boolean).join('\n\n').trim();
  if (!context) throw new AppError('Non c\'è ancora abbastanza contenuto da mandare a Claude.', { code: 'empty' });
  if (context.length > MAX_CONTEXT) {
    throw new AppError('C\'è troppo testo da mandare a Claude in una volta. Riduci il numero di interviste o accorcia i campi.', { code: 'too_long' });
  }
  return context;
}

export async function askClaude(task, context) {
  if (!AI_TASKS[task]) throw new AppError('Richiesta non valida.', { code: 'invalid_task' });
  const response = await api.invokeClaude(task, context);
  const text = typeof response?.text === 'string' ? response.text.trim() : '';
  if (!text) throw new AppError('Claude non ha restituito una risposta utilizzabile.', { code: 'empty_response' });
  return {
    text: text.slice(0, 20000),
    truncated: response?.truncated === true,
    remaining: Number.isInteger(response?.remaining) ? response.remaining : null,
  };
}
