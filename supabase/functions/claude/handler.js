import { TASKS, systemPrompt, userMessage } from './prompts.js';

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_OUTPUT_CHARS = 20000;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https?:\/\/[^/\s]+$/.test(s));
}

function corsHeaders(origin, allowed) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(status, body, cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } });
}

// Validazione a strati: dimensione, poi formato, poi regole di dominio.
export async function readRequest(req) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'Richiesta troppo grande.');
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new HttpError(413, 'Richiesta troppo grande.');

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Richiesta non valida.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Richiesta non valida.');
  const extra = Object.keys(body).filter((k) => k !== 'task' && k !== 'context');
  if (extra.length || typeof body.task !== 'string' || typeof body.context !== 'string') {
    throw new HttpError(400, 'Richiesta non valida.');
  }

  if (!Object.hasOwn(TASKS, body.task)) throw new HttpError(400, 'Compito non riconosciuto.');
  const task = TASKS[body.task];
  const context = body.context.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!context) throw new HttpError(400, 'Non c\'è contenuto da analizzare.');
  if (context.length > task.maxContext) throw new HttpError(413, 'C\'è troppo testo da analizzare in una volta.');
  return { task: body.task, context };
}

// Nessuna fiducia nella risposta del modello: si accetta solo testo, di lunghezza limitata.
export function extractText(message) {
  if (!message || typeof message !== 'object') throw new HttpError(502, 'Risposta di Claude non valida.');
  if (message.stop_reason === 'refusal') throw new HttpError(422, 'Claude non può rispondere a questa richiesta.');
  const blocks = Array.isArray(message.content) ? message.content : [];
  const text = blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new HttpError(502, 'Claude non ha restituito testo.');
  const truncated = message.stop_reason === 'max_tokens' || text.length > MAX_OUTPUT_CHARS;
  return { text: text.slice(0, MAX_OUTPUT_CHARS), truncated };
}

export function createHandler(deps) {
  const allowed = parseOrigins(deps.allowedOrigins);
  const dailyLimit = Number.isInteger(deps.dailyLimit) && deps.dailyLimit > 0 ? deps.dailyLimit : 40;
  const log = deps.log || ((event, fields) => console.log(JSON.stringify({ event, ...fields })));

  return async function handle(req) {
    const origin = req.headers.get('origin');
    const cors = corsHeaders(origin, allowed);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: origin && allowed.includes(origin) ? 204 : 403, headers: cors });
    }
    if (!origin || !allowed.includes(origin)) return json(403, { error: 'Origine non autorizzata.' }, cors);
    if (req.method !== 'POST') return json(405, { error: 'Metodo non consentito.' }, cors);

    let userId = null;
    try {
      const caller = await deps.verifyCaller(req.headers.get('authorization'));
      if (!caller?.userId) throw new HttpError(401, 'Accesso richiesto.');
      if (!caller.member) throw new HttpError(403, 'Serve un account del team con la verifica in due passaggi.');
      userId = caller.userId;

      const { task, context } = await readRequest(req);

      const used = await deps.countUsageToday(userId);
      if (used >= dailyLimit) throw new HttpError(429, `Hai raggiunto il limite di ${dailyLimit} richieste a Claude nelle ultime 24 ore.`);
      const usageId = await deps.recordUsage({ userId, task });

      const message = await deps.callClaude({ system: systemPrompt(task), user: userMessage(context) });
      const { text, truncated } = extractText(message);
      await deps
        .finishUsage(usageId, { model: message.model, inputTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens })
        .catch(() => log('usage_update_failed', { task }));

      log('claude_ok', { task, truncated, outputTokens: message.usage?.output_tokens ?? null });
      return json(200, { text, truncated, remaining: Math.max(0, dailyLimit - used - 1) }, cors);
    } catch (error) {
      if (error instanceof HttpError) {
        log('claude_rejected', { status: error.status });
        return json(error.status, { error: error.message }, cors);
      }
      log('claude_failed', { kind: error?.name || 'Error', status: error?.status ?? null });
      return json(502, { error: 'Claude non è disponibile in questo momento. Riprova più tardi.' }, cors);
    }
  };
}
