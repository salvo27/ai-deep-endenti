import { api, AppError } from './lib/api.js';
import { CANVAS_BLOCKS, IMPORTANCE, KINDS, optionLabel, statusLabel } from './schema.js';
import { fmtDate, fmtMoney } from './lib/format.js';
import { tx } from './i18n/index.js';

const t = tx.ai;

// Le chiavi restano quelle che la Edge Function conosce; cambiano solo i nomi mostrati.
export const AI_TASKS = t.tasks;

export const MAX_CONTEXT = 40000;

// Minimizzazione dei dati: a Claude va solo il contenuto delle board, mai persone, contatti o foto.
const EXCLUDED_TYPES = new Set(['member', 'members', 'image']);
const EXCLUDED_KEYS = new Set(['contact']);
// La colonna «noi» della tabella dei concorrenti: l'id salvato resta quello.
const US = 'noi';
const importanceLabel = (value) => optionLabel({ options: IMPORTANCE }, value).toLowerCase();

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

// Le etichette seguono la lingua in uso: Claude legge il contenuto come lo legge il team.
export function itemText(item, { heading = '#' } = {}) {
  const def = KINDS[item.kind];
  const lines = [`${heading} ${def.label}: ${item.title}`];
  if (item.status) lines.push(t.context.status(statusLabel(item.kind, item.status)));
  if (item.kind === 'canvas') {
    for (const block of CANVAS_BLOCKS) {
      const value = item.data?.[block.key];
      if (!value) continue;
      const validated = item.data?.validated?.[block.key] ? ` ${t.context.validated}` : '';
      lines.push(`${block.label}${validated}: ${value}`);
    }
    return lines.join('\n');
  }
  if (item.kind === 'competitors') {
    const data = item.data || {};
    const names = new Map([[US, t.context.us], ...(data.rivals || []).map((r) => [r.id, r.name])]);
    for (const r of data.rivals || []) {
      const name = `${r.name}${r.note ? ` (${r.note})` : ''}`;
      lines.push(r.type === 'indiretto' ? t.context.indirectCompetitor(name) : t.context.directCompetitor(name));
    }
    for (const f of data.features || []) {
      const who = [...names].filter(([id]) => data.cells?.[`${f.id}:${id}`]).map(([, name]) => name);
      lines.push(t.context.feature(f.label, importanceLabel(f.importance), who.length ? who.join(', ') : t.context.nobody));
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
    parts.push(t.context.capability(cell?.row || ''), t.context.sector(cell?.col || ''));
    if (cell?.text) parts.push(t.context.cellNotes(cell.text));
    if (existingIdeas.length) parts.push(t.context.existingIdeas(existingIdeas));
  } else {
    if (idea) parts.push(itemText(idea));
    if (item && item.id !== idea?.id) parts.push(itemText(item));
    for (const canvas of canvases) if (canvas.id !== item?.id) parts.push(itemText(canvas, { heading: '##' }));
    for (const board of boards) if (board.id !== item?.id) parts.push(itemText(board, { heading: '##' }));
    for (const experiment of experiments) if (experiment.id !== item?.id) parts.push(itemText(experiment, { heading: '##' }));
    interviews.forEach((interview) => parts.push(itemText(interview, { heading: '##' })));
  }
  const context = parts.filter(Boolean).join('\n\n').trim();
  if (!context) throw new AppError(t.errors.empty, { code: 'empty' });
  if (context.length > MAX_CONTEXT) throw new AppError(t.errors.tooLong, { code: 'too_long' });
  return context;
}

export async function askClaude(task, context) {
  if (!Object.hasOwn(AI_TASKS, task)) throw new AppError(t.errors.invalidTask, { code: 'invalid_task' });
  const response = await api.invokeClaude(task, context);
  const text = typeof response?.text === 'string' ? response.text.trim() : '';
  if (!text) throw new AppError(t.errors.emptyResponse, { code: 'empty_response' });
  return {
    text: text.slice(0, 20000),
    truncated: response?.truncated === true,
    remaining: Number.isInteger(response?.remaining) ? response.remaining : null,
  };
}
