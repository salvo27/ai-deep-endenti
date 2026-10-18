import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createHandler, HttpError } from './handler.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5';
const EFFORT = (Deno.env.get('CLAUDE_EFFORT') ?? 'medium') as 'low' | 'medium' | 'high';
const WINDOW_MS = 24 * 3600 * 1000;

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 120_000, maxRetries: 1 });
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function verifyCaller(authorization: string | null) {
  if (!authorization?.startsWith('Bearer ')) return null;
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data?.user) return null;
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // can_read controlla membro del team e 2FA (aal2) sul token di chi chiama.
  const { data: member, error: rpcError } = await asUser.rpc('can_read');
  return { userId: data.user.id, member: !rpcError && member === true };
}

async function countUsageToday(userId: string) {
  const { count, error } = await admin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - WINDOW_MS).toISOString());
  if (error) throw error;
  return count ?? 0;
}

async function recordUsage({ userId, task }: { userId: string; task: string }) {
  const { data, error } = await admin.from('ai_usage').insert({ user_id: userId, task }).select('id').single();
  if (error) throw error;
  return data.id as number;
}

async function finishUsage(id: number, usage: { model?: string; inputTokens?: number; outputTokens?: number }) {
  const { error } = await admin
    .from('ai_usage')
    .update({ model: usage.model ?? null, input_tokens: usage.inputTokens ?? null, output_tokens: usage.outputTokens ?? null })
    .eq('id', id);
  if (error) throw error;
}

async function callClaude({ system, user }: { system: string; user: string }) {
  try {
    return await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT },
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new HttpError(503, 'Claude è molto richiesto in questo momento. Riprova tra un minuto.');
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      throw new HttpError(504, 'Claude ci sta mettendo troppo. Riprova con meno testo.');
    }
    throw error;
  }
}

Deno.serve(
  createHandler({
    allowedOrigins: Deno.env.get('ALLOWED_ORIGINS') ?? '',
    dailyLimit: Number(Deno.env.get('AI_DAILY_LIMIT') ?? 40),
    verifyCaller,
    countUsageToday,
    recordUsage,
    finishUsage,
    callClaude,
  }),
);
