import { TASKS, systemPrompt, userMessage } from './prompts.js';
import { DEFAULT_LANGUAGE, errorText, isLanguage } from './texts.js';

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_OUTPUT_CHARS = 20000;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const FIELDS = new Set(['task', 'context', 'project', 'language']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// code: il nome dell'errore (texts.js); il testo si sceglie solo alla fine, nella lingua della richiesta.
export class HttpError extends Error {
  constructor(status, code, params = []) {
    super(code);
    this.status = status;
    this.code = code;
    this.params = params;
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

const failure = (error, language, cors) => json(error.status, { error: errorText(language, error.code, error.params), code: error.code }, cors);

// Prima la dimensione, prima ancora di leggere: oltre il limite non si guarda il contenuto.
export async function readBody(req) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'too_large');
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large');
  return raw;
}

function parseJson(raw) {
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// La lingua degli errori, anche di quelli che arrivano prima della validazione: quella chiesta, se è valida.
export function requestLanguage(raw) {
  const language = parseJson(raw)?.language;
  return isLanguage(language) ? language : DEFAULT_LANGUAGE;
}

// Validazione a strati: formato, poi progetto e lingua, poi regole di dominio.
export function parseRequest(raw) {
  const body = parseJson(raw);
  if (!body) throw new HttpError(400, 'invalid_request');
  const extra = Object.keys(body).filter((k) => !FIELDS.has(k));
  if (extra.length || typeof body.task !== 'string' || typeof body.context !== 'string') throw new HttpError(400, 'invalid_request');
  if (body.language != null && !isLanguage(body.language)) throw new HttpError(400, 'invalid_request');
  if (typeof body.project !== 'string' || !UUID.test(body.project)) throw new HttpError(400, 'invalid_project');

  if (!Object.hasOwn(TASKS, body.task)) throw new HttpError(400, 'unknown_task');
  const task = TASKS[body.task];
  const context = body.context.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!context) throw new HttpError(400, 'empty_context');
  if (context.length > task.maxContext) throw new HttpError(413, 'context_too_long');
  return { task: body.task, context, project: body.project.toLowerCase(), language: body.language ?? DEFAULT_LANGUAGE };
}

export async function readRequest(req) {
  return parseRequest(await readBody(req));
}

// Nessuna fiducia nella risposta del modello: si accetta solo testo, di lunghezza limitata.
export function extractText(message) {
  if (!message || typeof message !== 'object') throw new HttpError(502, 'invalid_response');
  if (message.stop_reason === 'refusal') throw new HttpError(422, 'refusal');
  const blocks = Array.isArray(message.content) ? message.content : [];
  const text = blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new HttpError(502, 'empty_response');
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
    if (!origin || !allowed.includes(origin)) return failure(new HttpError(403, 'origin_not_allowed'), DEFAULT_LANGUAGE, cors);
    if (req.method !== 'POST') return failure(new HttpError(405, 'method_not_allowed'), DEFAULT_LANGUAGE, cors);

    let language = DEFAULT_LANGUAGE;
    try {
      const raw = await readBody(req);
      language = requestLanguage(raw);

      // Prima chi è, poi la richiesta, poi se può leggere il progetto che la richiesta nomina.
      const authorization = req.headers.get('authorization');
      const caller = await deps.verifyCaller(authorization);
      if (!caller?.userId) throw new HttpError(401, 'sign_in_required');
      const userId = caller.userId;
      const { task, context, project } = parseRequest(raw);
      if ((await deps.canRead(authorization, project)) !== true) throw new HttpError(403, 'not_member');

      // Il limite è della persona, in tutti i suoi progetti insieme.
      const used = await deps.countUsageToday(userId);
      if (used >= dailyLimit) throw new HttpError(429, 'daily_limit', [dailyLimit]);
      const usageId = await deps.recordUsage({ userId, task });

      const message = await deps.callClaude({ system: systemPrompt(task, language), user: userMessage(context, language) });
      const { text, truncated } = extractText(message);
      await deps
        .finishUsage(usageId, { model: message.model, inputTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens })
        .catch(() => log('usage_update_failed', { task }));

      log('claude_ok', { task, truncated, outputTokens: message.usage?.output_tokens ?? null });
      return json(200, { text, truncated, remaining: Math.max(0, dailyLimit - used - 1) }, cors);
    } catch (error) {
      if (error instanceof HttpError) {
        log('claude_rejected', { status: error.status, code: error.code });
        return failure(error, language, cors);
      }
      log('claude_failed', { kind: error?.name || 'Error', status: error?.status ?? null });
      return failure(new HttpError(502, 'unavailable'), language, cors);
    }
  };
}
