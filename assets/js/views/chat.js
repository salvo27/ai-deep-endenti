import { h, mount, autoGrow, confirmDialog, openModal, promptDialog, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api } from '../lib/api.js';
import { dayKey, dayLabel, fmtDateTime } from '../lib/format.js';
import { renderMarkdown } from '../lib/markdown.js';
import { isUuid } from '../lib/validate.js';
import { chatList, chatState, createChat, lastMessageAt, markChatRead, setActiveChat, unreadOf } from '../chat.js';
import { imagePointer, noteExcerpt, noteImageNode, removeUnusedImages, uploadNoteImage } from '../notes.js';
import { emit, getItem, ideas, memberName, on, state } from '../store.js';
import { navigate } from '../router.js';
import { avatar, button, emptyState, itemLink, timeAgo } from './components.js';

const PAGE = 50;
const MAX_MESSAGE = 4000;

function newChatDialog() {
  const title = h('input', { type: 'text', class: 'input', maxlength: 80, placeholder: 'Per esempio: Nutrizione' });
  const idea = h(
    'select',
    {
      class: 'input',
      onChange: () => {
        const chosen = getItem(idea.value);
        if (chosen && !title.value.trim()) title.value = chosen.title.slice(0, 80);
      },
    },
    h('option', { value: '' }, 'Nessuna: argomento libero'),
    ideas().map((i) => h('option', { value: i.id }, i.title)),
  );
  openModal({
    title: 'Nuova chat',
    body: h(
      'div',
      { class: 'stack' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nome'), title),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Idea collegata'), idea),
      h('p', { class: 'muted small' }, 'Le chat si possono archiviare, non cancellare.'),
    ),
    actions: [
      { label: 'Annulla', value: false },
      {
        label: 'Crea',
        kind: 'primary',
        onClick: async () => {
          const name = title.value.trim();
          if (!name) {
            title.focus();
            return true;
          }
          try {
            const chat = await createChat({ title: name, ideaId: idea.value || null });
            navigate(`/chat/${chat.id}`);
            return false;
          } catch (error) {
            toast(error.message, { type: 'error' });
            return true;
          }
        },
      },
    ],
  });
  setTimeout(() => title.focus(), 0);
}

async function updateChat(chat, patch) {
  try {
    const row = await api.updateChat(chat.id, patch);
    chatState.chats.set(row.id, row);
    emit('chats');
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

const messageBody = (body) => h('div', { class: 'markdown chat-body' }, renderMarkdown(body, { image: noteImageNode, links: true }));

export function chatView(outlet, params) {
  const chatId = isUuid(params.id) ? params.id : null;
  let messages = [];
  let hasMore = false;
  let loaded = false;
  let showArchived = false;
  let editingId = null;
  let replyTo = null;
  const quoted = new Map();
  const replyBar = h('div', { class: 'chat-reply-bar', hidden: true });

  const listHost = h('nav', { class: 'chat-list', 'aria-label': 'Elenco delle chat' });
  const panel = h('section', { class: 'chat-panel' });
  const messagesHost = h('div', { class: 'chat-messages', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messaggi' });
  mount(outlet, h('div', { class: ['chat-layout', chatId && 'has-active'] }, listHost, panel));

  const chat = () => (chatId ? chatState.chats.get(chatId) : null);
  const nearBottom = () => messagesHost.scrollHeight - messagesHost.scrollTop - messagesHost.clientHeight < 120;
  const toBottom = () => {
    messagesHost.scrollTop = messagesHost.scrollHeight;
  };

  function renderList() {
    const active = chatList();
    const archived = chatList({ archived: true });
    const entry = (c) =>
      h(
        'a',
        { class: ['chat-entry', c.id === chatId && 'is-active'], href: `#/chat/${c.id}`, 'aria-current': c.id === chatId ? 'page' : undefined },
        h('span', { class: 'chat-entry-icon' }, icon(c.is_general ? 'users' : c.idea_id ? 'idea' : 'comment', 16)),
        h(
          'span',
          { class: 'chat-entry-main' },
          h('strong', null, c.title),
          h('span', { class: 'muted small' }, lastMessageAt(c.id) ? timeAgo(lastMessageAt(c.id)) : c.is_general ? 'Tutta la squadra' : 'Nessun messaggio'),
        ),
        unreadOf(c.id) ? h('span', { class: 'nav-badge' }, String(unreadOf(c.id))) : null,
      );
    mount(
      listHost,
      h('div', { class: 'chat-list-head' }, h('h1', null, 'Chat'), button('Nuova', { iconName: 'plus', onClick: newChatDialog })),
      chatState.loaded ? h('div', { class: 'chat-entries' }, active.map(entry)) : h('p', { class: 'muted small' }, 'Caricamento…'),
      archived.length
        ? h(
            'div',
            { class: 'chat-archived' },
            h('button', { type: 'button', class: 'link-btn small', onClick: () => { showArchived = !showArchived; renderList(); } }, `${showArchived ? 'Nascondi' : 'Mostra'} le archiviate (${archived.length})`),
            showArchived ? h('div', { class: 'chat-entries' }, archived.map(entry)) : null,
          )
        : null,
    );
  }

  const findMessage = (id) => messages.find((m) => m.id === id) || quoted.get(id) || null;

  // Il messaggio compare subito; quando il server risponde diventa quello vero. Si inviano in ordine, uno alla volta.
  let queue = Promise.resolve();
  function deliver(draft) {
    const pending = { ...draft, created_at: new Date().toISOString(), pending: true, failed: false };
    upsert(pending);
    queue = queue.then(async () => {
      try {
        const row = await api.sendMessage(pending.chat_id, pending.body, pending.reply_to);
        messages = messages.filter((m) => m.id !== pending.id);
        upsert(row);
        markChatRead(pending.chat_id);
      } catch (error) {
        upsert({ ...pending, pending: false, failed: true });
        toast(error.message, { type: 'error' });
      }
    });
  }

  // Citazioni di messaggi non ancora caricati: si recuperano tutte insieme.
  let fetchingQuotes = false;
  async function fetchQuotes() {
    const missing = [...new Set(messages.map((m) => m.reply_to).filter((id) => id && !findMessage(id)))];
    if (!missing.length || fetchingQuotes) return;
    fetchingQuotes = true;
    try {
      for (const row of await api.getMessages(missing)) quoted.set(row.id, row);
      renderMessages();
    } catch {
      // resta «messaggio precedente»
    } finally {
      fetchingQuotes = false;
    }
  }

  async function jumpTo(id) {
    for (let tries = 0; !messagesHost.querySelector(`#msg-${id}`) && hasMore && tries < 5; tries += 1) await loadOlder();
    const target = messagesHost.querySelector(`#msg-${id}`);
    if (!target) return;
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    target.classList.add('is-highlight');
    setTimeout(() => target.classList.remove('is-highlight'), 1600);
  }

  const quoteOf = (original, extra = {}) =>
    h(
      original ? 'button' : 'div',
      { class: 'chat-quote', type: original ? 'button' : undefined, ...extra },
      original ? h('strong', null, memberName(original.author_id)) : null,
      h('span', null, !original ? 'Messaggio precedente' : original.deleted_at ? 'Messaggio eliminato' : noteExcerpt(original.body, 140) || 'Immagine'),
    );

  function setReply(m) {
    replyTo = m;
    if (!m) {
      replyBar.hidden = true;
      mount(replyBar);
      return;
    }
    replyBar.hidden = false;
    mount(
      replyBar,
      h('span', { class: 'muted small' }, 'Rispondi a'),
      quoteOf(m),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Annulla la risposta', onClick: () => setReply(null) }, icon('close', 14)),
    );
    panel.querySelector('textarea.chat-input')?.focus();
  }

  function messageRow(m) {
    const mine = m.author_id === state.user?.id;
    const time = h('time', { datetime: m.created_at, title: fmtDateTime(m.created_at) }, new Date(m.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    let body;
    if (m.deleted_at) body = h('p', { class: 'muted small' }, 'Messaggio eliminato');
    else if (editingId === m.id) {
      const input = autoGrow(h('textarea', { class: 'input', rows: 2, maxlength: MAX_MESSAGE, value: m.body }));
      body = h(
        'div',
        { class: 'stack' },
        input,
        h(
          'div',
          { class: 'row' },
          button('Salva', {
            kind: 'primary',
            onClick: async () => {
              const text = input.value.trim();
              if (!text) return;
              try {
                const row = await api.editMessage(m.id, text);
                editingId = null;
                upsert(row);
                removeUnusedImages(m.body, row.body).catch(() => {});
              } catch (error) {
                toast(error.message, { type: 'error' });
              }
            },
          }),
          button('Annulla', { onClick: () => { editingId = null; renderMessages(); } }),
        ),
      );
      setTimeout(() => input.focus(), 0);
    } else body = messageBody(m.body);
    return h(
      'article',
      { class: ['chat-message', mine && 'is-mine', m.pending && 'is-pending', m.failed && 'is-failed'], id: `msg-${m.id}` },
      avatar(m.author_id, 32),
      h(
        'div',
        { class: 'chat-message-main' },
        h(
          'div',
          { class: 'chat-message-head' },
          h('strong', null, memberName(m.author_id)),
          time,
          m.edited_at && !m.deleted_at ? h('span', { class: 'muted small' }, 'modificato') : null,
          m.pending ? h('span', { class: 'muted small chat-pending' }, 'Invio…') : null,
          m.failed
            ? h(
                'span',
                { class: 'chat-failed small' },
                'Non inviato · ',
                h('button', { type: 'button', class: 'link-btn small', onClick: () => { messages = messages.filter((x) => x.id !== m.id); deliver(m); } }, 'Riprova'),
                ' · ',
                h('button', { type: 'button', class: 'link-btn small', onClick: () => { messages = messages.filter((x) => x.id !== m.id); renderMessages(); } }, 'Scarta'),
              )
            : null,
          !m.deleted_at && !m.pending && !m.failed && editingId !== m.id && !chat()?.archived_at
            ? h(
                'span',
                { class: 'chat-message-actions' },
                h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Rispondi al messaggio', title: 'Rispondi', onClick: () => setReply(m) }, icon('back', 14)),
                mine ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Modifica il messaggio', onClick: () => { editingId = m.id; renderMessages(); } }, icon('edit', 14)) : null,
                !mine
                  ? null
                  : h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn',
                    'aria-label': 'Elimina il messaggio',
                    onClick: async () => {
                      if (!(await confirmDialog('Eliminare il messaggio? Il testo verrà cancellato.', { okLabel: 'Elimina', danger: true }))) return;
                      try {
                        upsert(await api.deleteMessage(m.id));
                        removeUnusedImages(m.body, '').catch(() => {});
                      } catch (error) {
                        toast(error.message, { type: 'error' });
                      }
                    },
                  },
                  icon('trash', 14),
                ),
              )
            : null,
        ),
        m.reply_to && !m.deleted_at ? quoteOf(findMessage(m.reply_to), { onClick: () => jumpTo(m.reply_to) }) : null,
        body,
      ),
    );
  }

  function renderMessages() {
    const rows = [];
    if (hasMore) rows.push(h('div', { class: 'chat-more' }, button('Messaggi precedenti', { onClick: loadOlder })));
    let lastDay = null;
    for (const m of messages) {
      const day = dayKey(m.created_at);
      if (day !== lastDay) {
        rows.push(h('div', { class: 'chat-day' }, h('span', null, dayLabel(day))));
        lastDay = day;
      }
      rows.push(messageRow(m));
    }
    if (loaded && !messages.length) rows.push(emptyState(chat()?.is_general ? 'Nessun messaggio ancora: scrivete qui alla squadra.' : 'Nessun messaggio ancora in questa chat.'));
    if (!loaded) rows.push(h('p', { class: 'muted small' }, 'Caricamento dei messaggi…'));
    mount(messagesHost, rows);
    fetchQuotes();
  }

  function upsert(row) {
    // Il mio messaggio vero, arrivato dal vivo, prende il posto della sua copia in invio.
    if (!row.pending && !row.failed && row.author_id === state.user?.id) {
      const twin = messages.findIndex((m) => m.pending && m.body === row.body && m.chat_id === row.chat_id);
      if (twin >= 0) messages.splice(twin, 1);
    }
    const index = messages.findIndex((m) => m.id === row.id);
    const stick = nearBottom();
    if (index >= 0) messages[index] = row;
    else messages = [...messages, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
    renderMessages();
    if (index < 0 && (stick || row.author_id === state.user?.id)) toBottom();
  }

  async function loadOlder() {
    const before = messages[0]?.created_at;
    try {
      const older = await api.listMessages(chatId, { before, limit: PAGE });
      hasMore = older.length === PAGE;
      const height = messagesHost.scrollHeight;
      messages = [...older, ...messages];
      renderMessages();
      messagesHost.scrollTop = messagesHost.scrollHeight - height;
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  function composer(c) {
    if (c.archived_at) return h('p', { class: 'banner' }, 'Chat archiviata: si può leggere, ma non scrivere. ', h('button', { type: 'button', class: 'link-btn', onClick: () => updateChat(c, { archived_at: null }) }, 'Riattivala'));
    const input = autoGrow(
      h('textarea', {
        class: 'input chat-input',
        rows: 1,
        maxlength: MAX_MESSAGE,
        placeholder: 'Scrivi un messaggio. Invio per mandarlo, Maiusc+Invio per andare a capo.',
        'aria-label': 'Messaggio',
        onKeydown: (e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            send();
          }
          if (e.key === 'Escape' && replyTo) setReply(null);
        },
      }),
    );
    const sendButton = button('Invia', { kind: 'primary', onClick: () => send() });
    function send() {
      const text = input.value.trim();
      if (!text) return;
      deliver({ id: `tmp-${crypto.randomUUID()}`, chat_id: c.id, author_id: state.user?.id, body: text, reply_to: replyTo?.id || null });
      setReply(null);
      input.value = '';
      input.dispatchEvent(new Event('input'));
      input.focus();
    }
    const fileInput = h('input', {
      type: 'file',
      class: 'file-input',
      accept: 'image/jpeg,image/png,image/webp,image/*',
      onChange: async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          const path = await uploadNoteImage(c.id, file);
          const start = input.selectionStart ?? input.value.length;
          input.value = `${input.value.slice(0, start)}${start ? '\n' : ''}${imagePointer(path, file.name.replace(/\.[^.]+$/, ''))}\n${input.value.slice(start)}`;
          input.dispatchEvent(new Event('input'));
          input.focus();
        } catch (error) {
          toast(error.message, { type: 'error' });
        }
      },
    });
    return h(
      'div',
      { class: 'chat-composer-wrap' },
      replyBar,
      h(
        'div',
        { class: 'chat-composer' },
        h('label', { class: 'btn btn-ghost btn-icon', title: 'Aggiungi un\'immagine', 'aria-label': 'Aggiungi un\'immagine' }, icon('image', 16), fileInput),
        input,
        sendButton,
      ),
    );
  }

  function renderPanel() {
    const c = chat();
    if (!chatId) {
      mount(panel, emptyState('Scegli una chat dall\'elenco, o creane una nuova per un argomento o un\'idea.'));
      return;
    }
    if (!c) {
      mount(panel, chatState.loaded ? emptyState('Chat non trovata.') : h('p', { class: 'muted' }, 'Caricamento…'));
      return;
    }
    const idea = c.idea_id ? getItem(c.idea_id) : null;
    mount(
      panel,
      h(
        'header',
        { class: 'chat-head' },
        h('a', { class: 'back-link chat-back', href: '#/chat' }, icon('back', 16), h('span', null, 'Tutte le chat')),
        h(
          'div',
          { class: 'chat-head-main' },
          h('h2', null, c.title, c.archived_at ? h('span', { class: 'badge badge-soft' }, 'archiviata') : null),
          idea ? h('span', { class: 'muted small' }, 'Idea: ', itemLink(idea)) : c.is_general ? h('span', { class: 'muted small' }, 'La chat di tutta la squadra') : null,
        ),
        c.is_general
          ? null
          : h(
              'div',
              { class: 'row' },
              button('Rinomina', {
                iconName: 'edit',
                onClick: async () => {
                  const title = await promptDialog({ title: 'Rinomina la chat', label: 'Nome', value: c.title, maxLength: 80, okLabel: 'Salva' });
                  if (title?.trim()) updateChat(c, { title: title.trim() });
                },
              }),
              c.archived_at
                ? null
                : button('Archivia', {
                    iconName: 'trash',
                    onClick: async () => {
                      if (await confirmDialog('Archiviare la chat? Resterà leggibile tra le archiviate, ma non ci si potrà più scrivere.', { okLabel: 'Archivia' })) {
                        updateChat(c, { archived_at: new Date().toISOString() });
                      }
                    },
                  }),
            ),
      ),
      messagesHost,
      composerOf(c),
    );
    renderMessages();
  }

  // Il riquadro di scrittura resta lo stesso finché la chat non viene archiviata o riattivata: il testo non si perde.
  let composerEl = null;
  let composerArchived = null;
  function composerOf(c) {
    if (!composerEl || composerArchived !== Boolean(c.archived_at)) {
      composerEl = composer(c);
      composerArchived = Boolean(c.archived_at);
    }
    return composerEl;
  }

  async function loadMessages() {
    try {
      messages = await api.listMessages(chatId, { limit: PAGE });
      hasMore = messages.length === PAGE;
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
    loaded = true;
    renderMessages();
    toBottom();
    markChatRead(chatId);
  }

  renderList();
  renderPanel();
  setActiveChat(chatId);
  if (chatId) loadMessages();

  let lastChat = JSON.stringify(chat());
  const onVisible = () => {
    if (document.visibilityState === 'visible' && chatId) markChatRead(chatId);
  };
  document.addEventListener('visibilitychange', onVisible);
  const offs = [
    on('chats', () => {
      renderList();
      const now = JSON.stringify(chat());
      if (now !== lastChat) {
        lastChat = now;
        const scroll = messagesHost.scrollTop;
        renderPanel();
        messagesHost.scrollTop = scroll;
      }
    }),
    on('chat-message', ({ row }) => {
      if (row.chat_id !== chatId) return;
      upsert(row);
      if (document.visibilityState === 'visible') markChatRead(chatId);
    }),
  ];
  return () => {
    setActiveChat(null);
    document.removeEventListener('visibilitychange', onVisible);
    offs.forEach((off) => off());
  };
}
