import { supabase, authFlags } from './supabase.js';
import { CONFIG } from '../config.js';
import { isUuid } from './validate.js';

export const NOTE_BUCKET = 'note-immagini';

export class AppError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

const AUTH_MESSAGES = {
  invalid_credentials: 'Email o password non corretti.',
  mfa_verification_failed: 'Codice non valido. Controlla l\'orario del telefono e riprova.',
  mfa_challenge_expired: 'Il codice è scaduto. Inseriscine uno nuovo.',
  over_request_rate_limit: 'Troppi tentativi. Aspetta qualche minuto e riprova.',
  over_email_send_rate_limit: 'Troppe email inviate. Riprova più tardi.',
  weak_password: 'Password troppo debole.',
  same_password: 'La nuova password deve essere diversa da quella attuale.',
  reauthentication_needed: 'Per sicurezza esci, rientra e riprova.',
  insufficient_aal: 'Serve la verifica in due passaggi.',
  session_not_found: 'Sessione scaduta. Accedi di nuovo.',
  user_banned: 'Account disattivato.',
  email_not_confirmed: 'Account non ancora attivo. Contatta l\'amministratore.',
  mfa_factor_name_conflict: 'Esiste già un dispositivo con questo nome.',
  email_provider_disabled: 'L\'accesso con email e password è disattivato. Avvisa l\'amministratore.',
  signup_disabled: 'Le registrazioni sono chiuse: gli account li crea l\'amministratore.',
};

const DB_MESSAGES = {
  '42501': 'Non hai i permessi per questa operazione.',
  '23505': 'Esiste già un elemento di questo tipo.',
  '23514': 'Alcuni dati non sono validi.',
  '22P02': 'Alcuni dati non sono validi.',
  PGRST301: 'Sessione scaduta. Accedi di nuovo.',
};

export function toAppError(error, fallback = 'Operazione non riuscita. Riprova.') {
  if (error instanceof AppError) return error;
  if (!error) return new AppError(fallback);
  const code = error.code ?? null;
  const status = error.status ?? null;
  if (code && AUTH_MESSAGES[code]) return new AppError(AUTH_MESSAGES[code], { code, status });
  if (code === 'P0001' && typeof error.message === 'string') {
    return new AppError(error.message.slice(0, 300), { code, status });
  }
  if (code && DB_MESSAGES[code]) return new AppError(DB_MESSAGES[code], { code, status });
  if (status === 429) return new AppError(AUTH_MESSAGES.over_request_rate_limit, { code, status });
  if (error.name === 'TypeError' || error.name === 'AuthRetryableFetchError' || error.name === 'FunctionsFetchError') {
    return new AppError('Connessione non riuscita. Controlla la rete e riprova.', { code: 'network', status });
  }
  return new AppError(fallback, { code, status });
}

async function unwrap(promise, fallback) {
  let result;
  try {
    result = await promise;
  } catch (error) {
    throw toAppError(error, fallback);
  }
  if (result?.error) throw toAppError(result.error, fallback);
  return result?.data;
}

function requireUuid(value) {
  if (!isUuid(value)) throw new AppError('Identificativo non valido.', { code: 'invalid_id' });
  return value;
}

const PAGE = 1000;
const REVISION_COLUMNS = 'id,item_id,version,op,kind,idea_id,title,status,changed,author_id,message,created_at';

async function allPages(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await unwrap(build().range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export const api = {
  async getSession() {
    const data = await unwrap(supabase.auth.getSession());
    return data?.session ?? null;
  },

  isRecovery() {
    return authFlags.recovery;
  },

  clearRecovery() {
    authFlags.recovery = false;
  },

  onAuthChange(handler) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => handler(event, session));
    return () => data.subscription.unsubscribe();
  },

  async signIn(email, password) {
    return unwrap(supabase.auth.signInWithPassword({ email, password }), 'Accesso non riuscito.');
  },

  async signOut(scope = 'local') {
    await supabase.auth.signOut({ scope });
  },

  async requestPasswordReset(email, redirectTo) {
    await unwrap(supabase.auth.resetPasswordForEmail(email, { redirectTo }), 'Invio non riuscito.');
  },

  async updatePassword(password) {
    await unwrap(supabase.auth.updateUser({ password }), 'Cambio password non riuscito.');
  },

  async getAssurance() {
    return unwrap(supabase.auth.mfa.getAuthenticatorAssuranceLevel());
  },

  async listFactors() {
    const data = await unwrap(supabase.auth.mfa.listFactors());
    return data?.all ?? [];
  },

  async enrollTotp(friendlyName) {
    return unwrap(supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName }), 'Attivazione non riuscita.');
  },

  async verifyTotp(factorId, code) {
    return unwrap(supabase.auth.mfa.challengeAndVerify({ factorId, code }), 'Verifica non riuscita.');
  },

  async unenrollFactor(factorId) {
    await unwrap(supabase.auth.mfa.unenroll({ factorId }), 'Rimozione non riuscita.');
  },

  async myRole() {
    return unwrap(supabase.rpc('my_role'));
  },

  async membersOverview() {
    return unwrap(supabase.rpc('members_overview'));
  },

  async listItems() {
    return allPages(() => supabase.from('items').select('*').order('created_at', { ascending: true }));
  },

  async createItem({ kind, title, status, data, ideaId, message }) {
    return unwrap(
      supabase.rpc('create_item', {
        p_kind: kind,
        p_title: title,
        p_status: status ?? null,
        p_data: data ?? {},
        p_idea_id: ideaId ?? null,
        p_message: message || null,
      }),
      'Creazione non riuscita.',
    );
  },

  async saveItem({ id, baseVersion, snapshot, message }) {
    return unwrap(
      supabase.rpc('save_item', {
        p_id: requireUuid(id),
        p_base_version: baseVersion,
        p_title: snapshot.title,
        p_status: snapshot.status ?? null,
        p_data: snapshot.data ?? {},
        p_idea_id: snapshot.idea_id ?? null,
        p_message: message || null,
      }),
      'Salvataggio non riuscito.',
    );
  },

  async deleteItem(id, baseVersion, message) {
    return unwrap(
      supabase.rpc('delete_item', { p_id: requireUuid(id), p_base_version: baseVersion, p_message: message || null }),
      'Archiviazione non riuscita.',
    );
  },

  async restoreItem(id, message) {
    return unwrap(supabase.rpc('restore_item', { p_id: requireUuid(id), p_message: message || null }), 'Ripristino non riuscito.');
  },

  async revertItem(id, toVersion, baseVersion, message) {
    return unwrap(
      supabase.rpc('revert_item', {
        p_id: requireUuid(id),
        p_to_version: toVersion,
        p_base_version: baseVersion,
        p_message: message || null,
      }),
      'Ripristino non riuscito.',
    );
  },

  async listRevisions({ itemId, ideaId, authorId, kind, beforeId, sinceIso, limit = 50 } = {}) {
    let query = supabase.from('revisions').select(REVISION_COLUMNS).order('id', { ascending: false }).limit(limit);
    if (itemId) query = query.eq('item_id', requireUuid(itemId));
    if (ideaId) query = query.or(`idea_id.eq.${requireUuid(ideaId)},item_id.eq.${ideaId}`);
    if (authorId) query = query.eq('author_id', requireUuid(authorId));
    if (kind) query = query.eq('kind', kind);
    if (Number.isInteger(beforeId)) query = query.lt('id', beforeId);
    if (sinceIso) query = query.gt('created_at', sinceIso);
    return unwrap(query);
  },

  async itemHistory(itemId) {
    return unwrap(supabase.from('revisions').select('*').eq('item_id', requireUuid(itemId)).order('version', { ascending: true }));
  },

  async getRevision(itemId, version) {
    return unwrap(
      supabase.from('revisions').select('*').eq('item_id', requireUuid(itemId)).eq('version', version).maybeSingle(),
    );
  },

  // Novità per le notifiche: revisioni e commenti più recenti di una data, in ordine dal più nuovo.
  async activityFeed(sinceIso, limit = 60) {
    const [revisions, comments] = await Promise.all([
      unwrap(
        supabase
          .from('revisions')
          .select('id,item_id,kind,op,title,status,changed,author_id,created_at')
          .gt('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      unwrap(
        supabase
          .from('comments')
          .select('id,item_id,author_id,ai_task,created_at,edited_at,deleted_at')
          .gt('created_at', sinceIso)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
    ]);
    return { revisions: revisions || [], comments: comments || [] };
  },

  async activitySince(sinceIso) {
    return unwrap(supabase.from('revisions').select('author_id,created_at').gt('created_at', sinceIso).limit(5000));
  },

  // Commenti di un elemento o di più elementi insieme (un'idea e le sue schede).
  async listComments(itemIds) {
    const ids = [itemIds].flat().map(requireUuid);
    const query = supabase.from('comments').select('*');
    const filtered = ids.length === 1 ? query.eq('item_id', ids[0]) : query.in('item_id', ids);
    return unwrap(filtered.is('deleted_at', null).order('created_at'));
  },

  async commentCounts() {
    const rows = await allPages(() => supabase.from('comments').select('item_id').is('deleted_at', null));
    const counts = new Map();
    for (const row of rows) counts.set(row.item_id, (counts.get(row.item_id) || 0) + 1);
    return counts;
  },

  async addComment(itemId, body, aiTask = null) {
    return unwrap(
      supabase.from('comments').insert({ item_id: requireUuid(itemId), body, ai_task: aiTask }).select().single(),
      'Commento non salvato.',
    );
  },

  async editComment(id, body) {
    return unwrap(supabase.from('comments').update({ body }).eq('id', requireUuid(id)).select().single(), 'Modifica non salvata.');
  },

  async deleteComment(id) {
    await unwrap(
      supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', requireUuid(id)),
      'Eliminazione non riuscita.',
    );
  },

  async updateMember(userId, patch) {
    return unwrap(
      supabase.from('members').update(patch).eq('user_id', requireUuid(userId)).select().single(),
      'Modifica non salvata.',
    );
  },

  async removeMember(userId) {
    await unwrap(supabase.from('members').delete().eq('user_id', requireUuid(userId)), 'Rimozione non riuscita.');
  },

  async addMember(email, displayName, role) {
    return unwrap(supabase.rpc('add_member', { p_email: email, p_display_name: displayName, p_role: role }), 'Aggiunta non riuscita.');
  },

  async auditLog(limit = 100) {
    return unwrap(supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(limit));
  },

  async aiUsageLastDay(userId) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const { count, error } = await supabase
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', requireUuid(userId))
      .gte('created_at', since.toISOString());
    if (error) throw toAppError(error);
    return count ?? 0;
  },

  async invokeClaude(task, context) {
    const { data, error } = await supabase.functions.invoke(CONFIG.claudeFunction, { body: { task, context } });
    if (error) {
      let message = 'Claude non è disponibile in questo momento. Riprova più tardi.';
      try {
        const body = await error.context?.json?.();
        if (typeof body?.error === 'string') message = body.error.slice(0, 300);
      } catch {
        // risposta non JSON: resta il messaggio generico
      }
      throw new AppError(message, { code: 'claude', status: error.context?.status ?? null });
    }
    return data;
  },

  async exportAll() {
    const [items, revisions, comments, chats, chatMessages] = await Promise.all([
      allPages(() => supabase.from('items').select('*').order('created_at')),
      allPages(() => supabase.from('revisions').select('*').order('id')),
      allPages(() => supabase.from('comments').select('*').order('created_at')),
      allPages(() => supabase.from('chats').select('*').order('created_at')),
      allPages(() => supabase.from('chat_messages').select('*').order('created_at')),
    ]);
    return { items, revisions, comments, chats, chatMessages };
  },

  // Chat della squadra: una Generale e chat per argomento, messaggi e letture.
  async listChats() {
    return unwrap(supabase.from('chats').select('*').order('created_at'));
  },

  async chatOverview() {
    return (await unwrap(supabase.rpc('chat_overview'))) || [];
  },

  async createChat({ title, ideaId = null }) {
    return unwrap(supabase.from('chats').insert({ title, idea_id: ideaId }).select().single(), 'Chat non creata.');
  },

  async updateChat(id, patch) {
    return unwrap(supabase.from('chats').update(patch).eq('id', requireUuid(id)).select().single(), 'Modifica non salvata.');
  },

  async listMessages(chatId, { before = null, limit = 50 } = {}) {
    let query = supabase.from('chat_messages').select('*').eq('chat_id', requireUuid(chatId)).order('created_at', { ascending: false }).limit(limit);
    if (before) query = query.lt('created_at', before);
    return ((await unwrap(query)) || []).reverse();
  },

  async sendMessage(chatId, body, replyTo = null) {
    const row = { chat_id: requireUuid(chatId), body, reply_to: replyTo ? requireUuid(replyTo) : null };
    return unwrap(supabase.from('chat_messages').insert(row).select().single(), 'Messaggio non inviato.');
  },

  // I messaggi citati in una risposta che non sono tra quelli già caricati.
  async getMessages(ids) {
    if (!ids.length) return [];
    return (await unwrap(supabase.from('chat_messages').select('*').in('id', ids.map(requireUuid)))) || [];
  },

  async editMessage(id, body) {
    return unwrap(supabase.from('chat_messages').update({ body }).eq('id', requireUuid(id)).select().single(), 'Modifica non salvata.');
  },

  async deleteMessage(id) {
    return unwrap(
      supabase.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', requireUuid(id)).select().single(),
      'Eliminazione non riuscita.',
    );
  },

  async markChatRead(chatId) {
    await unwrap(supabase.rpc('mark_chat_read', { p_chat: requireUuid(chatId) }));
  },

  // Immagini delle note: spazio privato su Supabase Storage, regole nel database.
  async uploadNoteImage(path, blob) {
    const { error } = await supabase.storage.from(NOTE_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw toAppError(error, 'Caricamento dell\'immagine non riuscito.');
  },

  async downloadNoteImage(path) {
    const { data, error } = await supabase.storage.from(NOTE_BUCKET).download(path);
    if (error || !data) throw toAppError(error, 'Immagine non disponibile.');
    return data;
  },

  async removeNoteImages(paths) {
    if (!paths.length) return;
    const { error } = await supabase.storage.from(NOTE_BUCKET).remove(paths);
    if (error) throw toAppError(error, 'Pulizia delle immagini non riuscita.');
  },

  async noteImageOrphans(paths = null) {
    const rows = await unwrap(supabase.rpc('note_image_orphans', { p_paths: paths }), 'Controllo delle immagini non riuscito.');
    return (rows || []).map((row) => (typeof row === 'string' ? row : row.note_image_orphans)).filter(Boolean);
  },

  async setRealtimeAuth() {
    const session = await api.getSession();
    if (session) await supabase.realtime.setAuth(session.access_token);
  },

  subscribeDb({ onItem, onRevision, onComment, onMembers, onChat, onChatMessage, onStatus }) {
    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (p) => onItem?.(p.new))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'revisions' }, (p) => onRevision?.(p.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (p) => onComment?.(p.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => onMembers?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, (p) => onChat?.(p.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (p) => onChatMessage?.(p.new, p.eventType))
      .subscribe((status) => onStatus?.(status));
    return () => supabase.removeChannel(channel);
  },

  joinPresence(userId, onSync) {
    const channel = supabase.channel('board', { config: { private: true, presence: { key: userId } } });
    let current = null;
    channel.on('presence', { event: 'sync' }, () => onSync(channel.presenceState()));
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && current) channel.track(current);
    });
    return {
      track(meta) {
        current = meta;
        channel.track(meta).catch(() => {});
      },
      leave() {
        supabase.removeChannel(channel);
      },
    };
  },
};
