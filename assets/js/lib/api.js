import { supabase, authFlags } from './supabase.js';
import { CONFIG } from '../config.js';
import { isUuid } from './validate.js';
import { language, tx } from '../i18n/index.js';
import { isLanguage } from '../i18n/languages.js';

const t = tx.errors;

export const NOTE_BUCKET = 'note-immagini';
export const SURVEY_BUCKET = 'questionari-immagini'; // i18n-ignore: bucket name

export class AppError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

// The database answers with a code instead of a sentence (docs/PROGETTI.md, "Errori"): the site puts it into words
// in the language of whoever reads it. An unknown code is never shown as it is: it gets the text of its SQLSTATE or
// the generic one.
const SERVER_CODE = /^[a-z_]+$/;
const isServerCode = (value) => typeof value === 'string' && SERVER_CODE.test(value);
const serverText = (code) => (Object.hasOwn(tx.serverErrors, code) ? tx.serverErrors[code] : null);
const own = (table, key) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : null);

export function toAppError(error, fallback = t.generic) {
  if (error instanceof AppError) return error;
  if (!error) return new AppError(fallback);
  const code = error.code ?? null;
  const status = error.status ?? null;
  const authText = own(t.auth, code);
  if (authText) return new AppError(authText, { code, status });
  if (error.name === 'TypeError' || error.name === 'AuthRetryableFetchError' || error.name === 'FunctionsFetchError') {
    return new AppError(t.network, { code: 'network', status });
  }
  const serverCode = isServerCode(error.message);
  const known = serverCode ? serverText(error.message) : null;
  if (known) return new AppError(known, { code: error.message, status });
  // A sentence from a trigger written before the codes: shown as it is, as before.
  if (code === 'P0001' && !serverCode && typeof error.message === 'string') {
    return new AppError(error.message.slice(0, 300), { code, status });
  }
  const dbText = own(t.database, code);
  if (dbText) return new AppError(dbText, { code, status });
  if (status === 429) return new AppError(t.auth.over_request_rate_limit, { code, status });
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
  if (!isUuid(value)) throw new AppError(t.invalidId, { code: 'invalid_id' });
  return value;
}

// The project open on this page. The store sets it when the site starts; a method that gets no project uses it,
// so the pages written before the projects keep working. Without a project nothing is read: the rules of the
// database would return the rows of every project of the person.
const context = { project: null };

function projectId(explicit) {
  if (explicit !== undefined && explicit !== null) return requireUuid(explicit);
  if (!context.project) throw new AppError(t.noProject, { code: 'no_project' });
  return context.project;
}

const ROLES = ['admin', 'member', 'advisor'];
const PROFILE_FIELDS = ['display_name', 'color', 'language'];

const PAGE = 1000;
const REVISION_COLUMNS = 'id,item_id,version,op,kind,idea_id,title,status,changed,author_id,message,created_at';
// Tables followed live, each filtered on the open project. members and profiles are not published any more.
const LIVE_TABLES = ['items', 'revisions', 'comments', 'chats', 'chat_messages', 'mentions'];

async function allPages(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await unwrap(build().range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

// Le funzioni di Supabase rispondono con { error } e uno stato: il messaggio arriva com'è, al massimo 300 caratteri.
// A code becomes its text, as in toAppError.
async function invokeFunction(name, body, fallback, code) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = fallback;
    try {
      const payload = await error.context?.json?.();
      if (isServerCode(payload?.error)) message = serverText(payload.error) ?? fallback;
      else if (typeof payload?.error === 'string') message = payload.error.slice(0, 300);
    } catch {
      // risposta non JSON: resta il messaggio generico
    }
    throw new AppError(message, { code, status: error.context?.status ?? null });
  }
  return data;
}

async function myUserId() {
  return requireUuid((await api.getSession())?.user?.id);
}

function profilePatch(patch) {
  const clean = {};
  for (const key of PROFILE_FIELDS) {
    if (!Object.hasOwn(patch || {}, key)) continue;
    if (key === 'language' && patch.language !== null && !isLanguage(patch.language)) continue;
    clean[key] = patch[key];
  }
  return clean;
}

export const api = {
  /** Sets the project the methods use when they get none; anything but a valid id leaves no project open. */
  useProject(id) {
    context.project = isUuid(id) ? id : null;
  },

  currentProject() {
    return context.project;
  },

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
    return unwrap(supabase.auth.signInWithPassword({ email, password }), t.failed.signIn);
  },

  async signOut(scope = 'local') {
    await supabase.auth.signOut({ scope });
  },

  async requestPasswordReset(email, redirectTo) {
    await unwrap(supabase.auth.resetPasswordForEmail(email, { redirectTo }), t.failed.send);
  },

  async updatePassword(password) {
    await unwrap(supabase.auth.updateUser({ password }), t.failed.passwordChange);
  },

  async getAssurance() {
    return unwrap(supabase.auth.mfa.getAuthenticatorAssuranceLevel());
  },

  async listFactors() {
    const data = await unwrap(supabase.auth.mfa.listFactors());
    return data?.all ?? [];
  },

  async enrollTotp(friendlyName) {
    return unwrap(supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName }), t.failed.enroll);
  },

  async verifyTotp(factorId, code) {
    return unwrap(supabase.auth.mfa.challengeAndVerify({ factorId, code }), t.failed.verify);
  },

  async unenrollFactor(factorId) {
    await unwrap(supabase.auth.mfa.unenroll({ factorId }), t.failed.unenroll);
  },

  // Projects: the ones of the person, and for the platform administrator all of them.
  async myProjects() {
    return (await unwrap(supabase.rpc('my_projects'))) || [];
  },

  async allProjects() {
    return (await unwrap(supabase.rpc('all_projects'))) || [];
  },

  async isPlatformAdmin() {
    return (await unwrap(supabase.rpc('is_platform_admin'))) === true;
  },

  async createProject(name) {
    return unwrap(supabase.rpc('create_project', { p_name: name }), t.failed.create);
  },

  async renameProject(id, name) {
    const project = requireUuid(id);
    return unwrap(supabase.rpc('rename_project', { p_project: project, p_name: name }), t.failed.save);
  },

  async archiveProject(id) {
    const project = requireUuid(id);
    return unwrap(supabase.rpc('archive_project', { p_project: project }), t.failed.archive);
  },

  async unarchiveProject(id) {
    const project = requireUuid(id);
    return unwrap(supabase.rpc('unarchive_project', { p_project: project }), t.failed.restore);
  },

  // The platform administrators with the name of their profile (null for whoever has none yet).
  async platformAdmins() {
    const admins = (await unwrap(supabase.from('platform_admins').select('user_id,created_at').order('created_at'))) || [];
    if (!admins.length) return [];
    const profiles = (await unwrap(supabase.from('profiles').select('user_id,display_name,color').in('user_id', admins.map((a) => a.user_id)))) || [];
    const byId = new Map(profiles.map((p) => [p.user_id, p]));
    return admins.map((a) => ({ ...a, display_name: byId.get(a.user_id)?.display_name ?? null, color: byId.get(a.user_id)?.color ?? null }));
  },

  async addPlatformAdmin(email) {
    return unwrap(supabase.rpc('add_platform_admin', { p_email: email }), t.failed.add);
  },

  async removePlatformAdmin(userId) {
    const user = requireUuid(userId);
    await unwrap(supabase.rpc('remove_platform_admin', { p_user: user }), t.failed.remove);
  },

  async myRole(project) {
    const id = projectId(project);
    return unwrap(supabase.rpc('my_role', { p_project: id }));
  },

  async membersOverview(project) {
    const id = projectId(project);
    return unwrap(supabase.rpc('members_overview', { p_project: id }));
  },

  async touchActivity() {
    return unwrap(supabase.rpc('touch_activity'));
  },

  // The name and colour of a person, the same in every project, and the language of their emails and of Claude.
  async myProfile() {
    const user = await myUserId();
    return (await unwrap(supabase.from('profiles').select('user_id,display_name,color,language').eq('user_id', user).maybeSingle())) ?? null;
  },

  // Only the own row, and only name, colour and language: a language the site does not have is dropped.
  async updateProfile(patch) {
    const user = await myUserId();
    const clean = profilePatch(patch);
    if (!Object.keys(clean).length) return null;
    return unwrap(supabase.from('profiles').update(clean).eq('user_id', user).select().maybeSingle(), t.failed.edit);
  },

  // People of a project. Every statement on members names both the project and the person: the database refuses one
  // that touches two projects, and the site never sends it.
  async addMember(...args) {
    // Before the projects it was addMember(email, displayName, role): an email is never an id.
    const [project, email, displayName, role] = isUuid(args[0]) ? args : [undefined, ...args];
    const id = projectId(project);
    return unwrap(
      supabase.rpc('add_member', { p_project: id, p_email: email, p_display_name: displayName, p_role: role }),
      t.failed.add,
    );
  },

  async updateMemberRole(project, userId, role) {
    const id = projectId(project);
    const user = requireUuid(userId);
    if (!ROLES.includes(role)) throw new AppError(serverText('invalid_role') ?? t.generic, { code: 'invalid_role' });
    return unwrap(
      supabase.from('members').update({ role }).eq('project_id', id).eq('user_id', user).select().single(),
      t.failed.edit,
    );
  },

  async removeMember(...args) {
    // Before the projects it was removeMember(userId), in the open project.
    const [project, userId] = args.length >= 2 ? args : [undefined, args[0]];
    const id = projectId(project);
    const user = requireUuid(userId);
    await unwrap(supabase.from('members').delete().eq('project_id', id).eq('user_id', user), t.failed.remove);
  },

  // As before the projects: the role in the open project, name and colour in the own profile.
  async updateMember(userId, patch) {
    const user = requireUuid(userId);
    const profile = profilePatch(patch);
    if (Object.keys(profile).length && user !== (await myUserId())) {
      throw new AppError(serverText('not_allowed') ?? t.database['42501'], { code: 'not_allowed' });
    }
    let row = null;
    if (Object.hasOwn(patch || {}, 'role')) row = await api.updateMemberRole(undefined, user, patch.role);
    if (Object.keys(profile).length) row = await api.updateProfile(profile);
    return row;
  },

  async listItems(project) {
    const id = projectId(project);
    return allPages(() => supabase.from('items').select('*').eq('project_id', id).order('created_at', { ascending: true }));
  },

  async createItem({ kind, title, status, data, ideaId, message, projectId: project }) {
    const id = projectId(project);
    return unwrap(
      supabase.rpc('create_item', {
        p_project: id,
        p_kind: kind,
        p_title: title,
        p_status: status ?? null,
        p_data: data ?? {},
        p_idea: ideaId ?? null,
        p_message: message || null,
      }),
      t.failed.create,
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
      t.failed.save,
    );
  },

  async deleteItem(id, baseVersion, message) {
    return unwrap(
      supabase.rpc('delete_item', { p_id: requireUuid(id), p_base_version: baseVersion, p_message: message || null }),
      t.failed.archive,
    );
  },

  async restoreItem(id, message) {
    return unwrap(supabase.rpc('restore_item', { p_id: requireUuid(id), p_message: message || null }), t.failed.restore);
  },

  async revertItem(id, toVersion, baseVersion, message) {
    return unwrap(
      supabase.rpc('revert_item', {
        p_id: requireUuid(id),
        p_to_version: toVersion,
        p_base_version: baseVersion,
        p_message: message || null,
      }),
      t.failed.restore,
    );
  },

  async listRevisions({ itemId, ideaId, authorId, kind, beforeId, sinceIso, limit = 50, projectId: project } = {}) {
    const id = projectId(project);
    let query = supabase.from('revisions').select(REVISION_COLUMNS).eq('project_id', id).order('id', { ascending: false }).limit(limit);
    if (itemId) query = query.eq('item_id', requireUuid(itemId));
    if (ideaId) query = query.or(`idea_id.eq.${requireUuid(ideaId)},item_id.eq.${ideaId}`);
    if (authorId) query = query.eq('author_id', requireUuid(authorId));
    if (kind) query = query.eq('kind', kind);
    if (Number.isInteger(beforeId)) query = query.lt('id', beforeId);
    if (sinceIso) query = query.gt('created_at', sinceIso);
    return unwrap(query);
  },

  async itemHistory(itemId) {
    const item = requireUuid(itemId);
    const id = projectId();
    return unwrap(supabase.from('revisions').select('*').eq('project_id', id).eq('item_id', item).order('version', { ascending: true }));
  },

  async getRevision(itemId, version) {
    const item = requireUuid(itemId);
    const id = projectId();
    return unwrap(
      supabase.from('revisions').select('*').eq('project_id', id).eq('item_id', item).eq('version', version).maybeSingle(),
    );
  },

  // Novità per le notifiche: revisioni e commenti più recenti di una data, in ordine dal più nuovo.
  async activityFeed(sinceIso, limit = 60) {
    const id = projectId();
    const [revisions, comments] = await Promise.all([
      unwrap(
        supabase
          .from('revisions')
          .select('id,item_id,kind,op,title,status,changed,author_id,created_at')
          .eq('project_id', id)
          .gt('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      unwrap(
        supabase
          .from('comments')
          .select('id,item_id,author_id,ai_task,created_at,edited_at,deleted_at')
          .eq('project_id', id)
          .gt('created_at', sinceIso)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
    ]);
    return { revisions: revisions || [], comments: comments || [] };
  },

  async activitySince(sinceIso) {
    const id = projectId();
    return unwrap(supabase.from('revisions').select('author_id,created_at').eq('project_id', id).gt('created_at', sinceIso).limit(5000));
  },

  // Commenti di un elemento o di più elementi insieme (un'idea e le sue schede).
  async listComments(itemIds) {
    const ids = [itemIds].flat().map(requireUuid);
    const id = projectId();
    const query = supabase.from('comments').select('*').eq('project_id', id);
    const filtered = ids.length === 1 ? query.eq('item_id', ids[0]) : query.in('item_id', ids);
    return unwrap(filtered.is('deleted_at', null).order('created_at'));
  },

  async commentCounts(project) {
    const id = projectId(project);
    const rows = await allPages(() => supabase.from('comments').select('item_id').eq('project_id', id).is('deleted_at', null));
    const counts = new Map();
    for (const row of rows) counts.set(row.item_id, (counts.get(row.item_id) || 0) + 1);
    return counts;
  },

  // The project of a comment is the one of its item: the database copies it.
  async addComment(itemId, body, aiTask = null) {
    return unwrap(
      supabase.from('comments').insert({ item_id: requireUuid(itemId), body, ai_task: aiTask }).select().single(),
      t.failed.comment,
    );
  },

  async editComment(id, body) {
    return unwrap(supabase.from('comments').update({ body }).eq('id', requireUuid(id)).select().single(), t.failed.edit);
  },

  async deleteComment(id) {
    await unwrap(
      supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', requireUuid(id)),
      t.failed.delete,
    );
  },

  // { projectId, limit }: a project (the open one when missing) or, with projectId null, the whole platform, as the
  // platform administrator reads it. A number alone is the limit, as the pages written before the projects pass it.
  async auditLog(options = {}) {
    const { projectId: project, limit = 100 } = typeof options === 'number' ? { limit: options } : options || {};
    let query = supabase.from('audit_log').select('*');
    if (project !== null) query = query.eq('project_id', projectId(project));
    return unwrap(query.order('id', { ascending: false }).limit(limit));
  },

  // The use of Claude belongs to the person, not to a project.
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

  // The Edge Function checks that the person is in the project and answers in their language: it relies on exactly
  // these two fields.
  async invokeClaude(task, context, { project = null, language: lang = null } = {}) {
    const body = { task, context, project: projectId(project), language: isLanguage(lang) ? lang : language };
    return invokeFunction(CONFIG.claudeFunction, body, t.failed.claude, 'claude');
  },

  // Riepilogo settimanale, solo per l'admin: la sua anteprima con quante persone lo riceverebbero, e l'invio subito a tutti.
  // Both for the open project; language picks the language of the function's error texts.
  async weeklyPreview() {
    const project = projectId();
    return invokeFunction(CONFIG.notifyFunction, { job: 'weekly-preview', project, language }, t.failed.weeklyPreview, 'notify');
  },

  async sendWeeklyNow() {
    const project = projectId();
    return invokeFunction(CONFIG.notifyFunction, { job: 'weekly-now', project, language }, t.failed.weeklySend, 'notify');
  },

  // I questionari sono tra gli items; le risposte sono solo quelle visibili (questionario e idea non archiviati).
  // The backup holds the open project only.
  async exportAll() {
    const id = projectId();
    const [items, revisions, comments, chats, chatMessages, surveyResponses] = await Promise.all([
      allPages(() => supabase.from('items').select('*').eq('project_id', id).order('created_at')),
      allPages(() => supabase.from('revisions').select('*').eq('project_id', id).order('id')),
      allPages(() => supabase.from('comments').select('*').eq('project_id', id).order('created_at')),
      allPages(() => supabase.from('chats').select('*').eq('project_id', id).order('created_at')),
      allPages(() => supabase.from('chat_messages').select('*').eq('project_id', id).order('created_at')),
      allPages(() => supabase.from('survey_responses').select('*').eq('project_id', id).order('created_at').order('id')),
    ]);
    return { items, revisions, comments, chats, chatMessages, surveyResponses };
  },

  // Questionari: le risposte arrivano dalla pagina pubblica; qui il team le legge, le cancella e vede l'imbuto.
  // Ci sono anche le compilazioni interrotte (completed: false).
  async listSurveyResponses(surveyId) {
    const id = requireUuid(surveyId);
    return allPages(() =>
      supabase.from('survey_responses').select('*').eq('survey_id', id).order('created_at', { ascending: true }).order('id', { ascending: true }),
    );
  },

  // Senza ids cancella tutte le risposte e azzera anche visite e inizi. Restituisce quante risposte ha cancellato.
  async deleteSurveyResponses(surveyId, ids = null) {
    if (ids !== null && !Array.isArray(ids)) throw new AppError(t.invalidId, { code: 'invalid_id' });
    const params = { p_survey: requireUuid(surveyId), p_ids: ids === null ? null : ids.map(requireUuid) };
    return (await unwrap(supabase.rpc('delete_survey_responses', params), t.failed.responsesDelete)) ?? 0;
  },

  async surveyFunnel(surveyId) {
    const row = await unwrap(supabase.rpc('survey_funnel', { p_survey: requireUuid(surveyId) }), t.failed.stats);
    return { views: row?.views ?? 0, starts: row?.starts ?? 0, partial: row?.partial ?? 0, completed: row?.completed ?? 0 };
  },

  // Chat della squadra: una Generale e chat per argomento, messaggi e letture.
  async listChats(project) {
    const id = projectId(project);
    return unwrap(supabase.from('chats').select('*').eq('project_id', id).order('created_at'));
  },

  async chatOverview(project) {
    const id = projectId(project);
    return (await unwrap(supabase.rpc('chat_overview', { p_project: id }))) || [];
  },

  // A chat is born in the open project and never moves: whoever creates it gives the project.
  async createChat({ title, ideaId = null, projectId: project }) {
    const id = projectId(project);
    return unwrap(supabase.from('chats').insert({ project_id: id, title, idea_id: ideaId }).select().single(), t.failed.chat);
  },

  async updateChat(id, patch) {
    return unwrap(supabase.from('chats').update(patch).eq('id', requireUuid(id)).select().single(), t.failed.edit);
  },

  // Like every read, only the messages of the open project: a chat id from another project gives nothing.
  async listMessages(chatId, { before = null, limit = 50 } = {}) {
    const chat = requireUuid(chatId);
    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('project_id', projectId())
      .eq('chat_id', chat)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) query = query.lt('created_at', before);
    return ((await unwrap(query)) || []).reverse();
  },

  async sendMessage(chatId, body, replyTo = null) {
    const row = { chat_id: requireUuid(chatId), body, reply_to: replyTo ? requireUuid(replyTo) : null };
    return unwrap(supabase.from('chat_messages').insert(row).select().single(), t.failed.message);
  },

  // I messaggi citati in una risposta che non sono tra quelli già caricati.
  async getMessages(ids) {
    if (!ids.length) return [];
    const wanted = ids.map(requireUuid);
    return (await unwrap(supabase.from('chat_messages').select('*').eq('project_id', projectId()).in('id', wanted))) || [];
  },

  async editMessage(id, body) {
    return unwrap(supabase.from('chat_messages').update({ body }).eq('id', requireUuid(id)).select().single(), t.failed.edit);
  },

  async deleteMessage(id) {
    return unwrap(
      supabase.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', requireUuid(id)).select().single(),
      t.failed.delete,
    );
  },

  async markChatRead(chatId) {
    await unwrap(supabase.rpc('mark_chat_read', { p_chat: requireUuid(chatId) }));
  },

  // Menzioni: le crea il database; qui si leggono le proprie e si segnano come lette.
  async listMentions(project) {
    const id = projectId(project);
    return (await unwrap(supabase.from('mentions').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(50))) || [];
  },

  // Without ids, all the own mentions of the project: those of the other projects stay unread.
  async markMentionsRead(ids = null, project) {
    const id = projectId(project);
    await unwrap(supabase.rpc('mark_mentions_read', { p_project: id, p_ids: ids }));
  },

  // Email (menzioni non lette e riepilogo del lunedì): senza una riga salvata sono accese tutte e due.
  // They hold for every project.
  async emailPrefs(userId) {
    const row = await unwrap(supabase.from('email_prefs').select('mentions,weekly').eq('user_id', requireUuid(userId)).maybeSingle());
    return { mentions: row?.mentions !== false, weekly: row?.weekly !== false };
  },

  async setEmailPrefs({ mentions = null, weekly = null }) {
    const row = await unwrap(supabase.rpc('set_email_prefs', { p_mentions: mentions, p_weekly: weekly }), t.failed.preference);
    return { mentions: row?.mentions !== false, weekly: row?.weekly !== false };
  },

  // Immagini delle note: spazio privato su Supabase Storage, regole nel database.
  async uploadNoteImage(path, blob) {
    const { error } = await supabase.storage.from(NOTE_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw toAppError(error, t.failed.imageUpload);
  },

  async downloadNoteImage(path) {
    const { data, error } = await supabase.storage.from(NOTE_BUCKET).download(path);
    if (error || !data) throw toAppError(error, t.failed.imageUnavailable);
    return data;
  },

  async removeNoteImages(paths) {
    if (!paths.length) return;
    const { error } = await supabase.storage.from(NOTE_BUCKET).remove(paths);
    if (error) throw toAppError(error, t.failed.imageCleanup);
  },

  // Immagine della schermata iniziale dei questionari: spazio pubblico, la vede chi ha il link del questionario.
  async uploadSurveyImage(path, blob) {
    const { error } = await supabase.storage.from(SURVEY_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw toAppError(error, t.failed.imageUpload);
  },

  // Senza regole di lettura sullo spazio si scarica dall'indirizzo pubblico; il sito la mostra come blob.
  async downloadSurveyImage(path) {
    const { data } = supabase.storage.from(SURVEY_BUCKET).getPublicUrl(path);
    const response = await fetch(data.publicUrl);
    if (!response.ok) throw new AppError(t.failed.imageUnavailable);
    return response.blob();
  },

  async removeSurveyImages(paths) {
    if (!paths.length) return;
    const { error } = await supabase.storage.from(SURVEY_BUCKET).remove(paths);
    if (error) throw toAppError(error, t.failed.imageCleanup);
  },

  // Only the images of the project: the database looks at that project alone.
  async surveyImageOrphans(paths = null, project) {
    const id = projectId(project);
    const rows = await unwrap(supabase.rpc('survey_image_orphans', { p_project: id, p_paths: paths }), t.failed.imageCheck);
    return (rows || []).map((row) => (typeof row === 'string' ? row : row.survey_image_orphans)).filter(Boolean);
  },

  async noteImageOrphans(paths = null, project) {
    const id = projectId(project);
    const rows = await unwrap(supabase.rpc('note_image_orphans', { p_project: id, p_paths: paths }), t.failed.imageCheck);
    return (rows || []).map((row) => (typeof row === 'string' ? row : row.note_image_orphans)).filter(Boolean);
  },

  async setRealtimeAuth() {
    const session = await api.getSession();
    if (session) await supabase.realtime.setAuth(session.access_token);
  },

  // Live changes of the project: every table filtered on it, so a page never hears about the other projects.
  subscribeDb({ projectId: project, onItem, onRevision, onComment, onChat, onChatMessage, onMention, onStatus } = {}) {
    const id = projectId(project);
    const filter = `project_id=eq.${id}`;
    const handlers = {
      items: (p) => onItem?.(p.new),
      revisions: (p) => onRevision?.(p.new),
      comments: (p) => onComment?.(p.new),
      chats: (p) => onChat?.(p.new),
      chat_messages: (p) => onChatMessage?.(p.new, p.eventType),
      mentions: (p) => onMention?.(p.eventType === 'DELETE' ? p.old : p.new, p.eventType),
    };
    let channel = supabase.channel(`db-changes:${id}`);
    for (const table of LIVE_TABLES) {
      const event = table === 'revisions' ? 'INSERT' : '*';
      channel = channel.on('postgres_changes', { event, schema: 'public', table, filter }, handlers[table]);
    }
    channel.subscribe((status) => onStatus?.(status));
    return () => supabase.removeChannel(channel);
  },

  // Who is online: one private channel per project, which the database opens to whoever can read that project.
  joinPresence(userId, onSync, project) {
    const id = projectId(project);
    const channel = supabase.channel(`board:${id}`, { config: { private: true, presence: { key: userId } } });
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
