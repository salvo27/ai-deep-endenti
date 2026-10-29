import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createHandler } from './handler.js';

// Gira dentro Supabase con la chiave di servizio. La chiamano i job di pg_cron, con il segreto condiviso,
// e il sito per l'anteprima e l'invio a mano del riepilogo, con il token di un admin.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

// is_admin controlla ruolo e verifica in due passaggi (aal2) sul token di chi chiama.
async function verifyAdmin(authorization: string | null) {
  if (!authorization?.startsWith('Bearer ')) return null;
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data?.user) return null;
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin, error: rpcError } = await asUser.rpc('is_admin');
  return { userId: data.user.id, admin: !rpcError && isAdmin === true };
}

// Gli errori del database diventano un messaggio generico: nei log non finiscono dettagli o dati.
async function rpc(name: string, params?: Record<string, unknown>) {
  const { data, error } = await admin.rpc(name, params);
  if (error) throw new Error(`Chiamata ${name} non riuscita`);
  return data;
}

Deno.serve(
  createHandler({
    env: (name: string) => Deno.env.get(name),
    verifyAdmin,
    fetch: (url: string, init: RequestInit) => fetch(url, init),
    recipients: () => rpc('notify_recipients'),
    pendingMentions: (since: string) => rpc('notify_pending_mentions', { p_since: since }),
    claimMentions: async (ids: number[]) => ((await rpc('notify_claim_mentions', { p_ids: ids })) ?? []).map((row: { id: number }) => row.id),
    releaseMentions: (ids: number[]) => rpc('notify_release_mentions', { p_ids: ids }),
    weeklyData: (since: string) => rpc('notify_weekly_data', { p_since: since }),
    claimWeekly: async (userId: string, week: string) => (await rpc('notify_claim_weekly', { p_user: userId, p_week: week })) === true,
    releaseWeekly: (userId: string, week: string) => rpc('notify_release_weekly', { p_user: userId, p_week: week }),
  }),
);
