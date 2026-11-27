// Same entries as ../it/mentions.js, which is the reference: tests/unit/i18n.test.mjs checks it.
export const mentions = {
  tagged: (who, where) => `${who} tagged you ${where}`,
  inChat: (title) => `in “${title}”`,
  inNote: (title) => `in the note “${title}”`,
  inComment: (title) => `in a comment on “${title}”`,
  note: 'note',
  card: 'a card',
  everyone: 'everyone',
  wholeTeam: 'The whole team',
  notifyEveryone: 'notify the whole team',
  image: 'image',
  suggestions: 'People to tag',
  panel: {
    title: 'Mentions',
    unread: (count) => `Mentions, ${count} to read`,
    markAllRead: 'Mark all as read',
    empty: 'No mentions. When someone tags you with @ in a chat, a comment or a note, you see it here.',
  },
};
