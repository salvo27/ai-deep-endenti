import { api } from './lib/api.js';
import { downloadFile, fmtDate, fmtMoney, slugFile } from './lib/format.js';
import { CANVAS_BLOCKS, IMPORTANCE, KINDS, optionLabel, statusLabel } from './schema.js';
import { criteriaList, itemsOf, labelContext, scoreItems, state } from './store.js';
import { ideaScore } from './scoring.js';
import { tx } from './i18n/index.js';

const t = tx.exporting;
// La colonna «noi» della tabella dei concorrenti: l'id salvato resta quello.
const US = 'noi';
const importanceLabel = (value) => optionLabel({ options: IMPORTANCE }, value).toLowerCase();

function mdValue(def, value) {
  if (value === undefined || value === null || value === '' || def.type === 'image') return null;
  if (def.type === 'member') return labelContext.memberName(value);
  if (def.type === 'members') return value.map(labelContext.memberName).join(', ');
  if (def.type === 'ideas') return value.map((id) => labelContext.ideaTitle(id) || KINDS.idea.label).join(', ');
  if (def.type === 'experiment' || def.type === 'interview') return labelContext.itemTitle(value) || KINDS[def.type].label;
  if (Array.isArray(value)) return value.join(', ');
  if (def.type === 'select') return optionLabel(def, value);
  if (def.type === 'date') return fmtDate(value);
  if (def.type === 'scale') return `${value}/5`;
  if (def.type === 'money') return fmtMoney(value);
  return String(value);
}

function mdFields(item, skip = []) {
  const lines = [];
  for (const def of KINDS[item.kind].fields) {
    if (skip.includes(def.key)) continue;
    const value = mdValue(def, item.data?.[def.key]);
    if (!value) continue;
    lines.push(value.includes('\n') ? `**${def.label}**\n\n${value}\n` : `**${def.label}:** ${value}  `);
  }
  return lines.join('\n');
}

function competitorsTable(data) {
  const columns = [{ id: US, name: t.competitors.us }, ...(data.rivals || [])];
  if (!data.features?.length) return '';
  const cell = (text) => String(text).replace(/\|/g, '/');
  const rows = [
    `| ${t.competitors.feature} | ${t.competitors.importance} | ${columns.map((c) => cell(c.name)).join(' | ')} |`,
    `|---|---|${columns.map(() => '---').join('|')}|`,
    ...data.features.map((f) => `| ${cell(f.label)} | ${importanceLabel(f.importance)} | ${columns.map((c) => (data.cells?.[`${f.id}:${c.id}`] ? t.competitors.yes : '-')).join(' | ')} |`),
  ];
  return rows.join('\n');
}

export function ideaMarkdown(idea) {
  // Due spazi a fine riga: in Markdown vanno a capo senza aprire un paragrafo.
  const out = [`# ${idea.title}`, '', `${t.status(statusLabel('idea', idea.status))}  `, t.exportedOn(fmtDate(new Date())), '', mdFields(idea), ''];

  const criteria = criteriaList();
  if (criteria.length) {
    const score = ideaScore(idea.id, criteria, scoreItems());
    out.push(`## ${t.scoring}`, '', t.score(score.score, score.voters.length), '');
  }

  for (const canvas of itemsOf('canvas', { ideaId: idea.id })) {
    out.push(`## ${canvas.title}`, '');
    for (const block of CANVAS_BLOCKS) {
      if (!canvas.data[block.key]) continue;
      out.push(`**${block.label}**${canvas.data.validated?.[block.key] ? ` ${t.validated}` : ''}`, '', canvas.data[block.key], '');
    }
  }

  for (const kind of ['persona', 'vpc', 'market', 'competitors', 'deeptech']) { // i18n-ignore: kinds of item
    const items = itemsOf(kind, { ideaId: idea.id });
    if (!items.length) continue;
    out.push(`## ${KINDS[kind].plural}`, '');
    for (const item of items) {
      out.push(`### ${item.title}`, '', mdFields(item), '');
      if (kind === 'competitors') out.push(competitorsTable(item.data), '');
    }
  }

  const experiments = itemsOf('experiment', { ideaId: idea.id });
  if (experiments.length) {
    out.push(`## ${t.experiments}`, '');
    for (const e of experiments) out.push(`### ${e.title} (${statusLabel('experiment', e.status)})`, '', mdFields(e, ['owner']), '');
  }

  const interviews = itemsOf('interview', { ideaId: idea.id });
  if (interviews.length) {
    out.push(`## ${t.interviews}`, '');
    for (const i of interviews) out.push(`### ${i.title}`, '', mdFields(i, ['contact', 'interviewer']), '');
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function exportIdeaMarkdown(idea) {
  downloadFile(`${slugFile(idea.title)}.md`, ideaMarkdown(idea), 'text/markdown;charset=utf-8');
}

// La copia di sicurezza si rilegge in qualunque lingua: chiavi e nome del file non si traducono.
export async function exportBackup() {
  const data = await api.exportAll();
  const backup = {
    exportedAt: new Date().toISOString(),
    exportedBy: state.user?.id ?? null,
    members: state.members.map(({ user_id, display_name, role }) => ({ user_id, display_name, role })),
    ...data,
  };
  downloadFile(`ai-deep-endenti-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2));
  return backup;
}
