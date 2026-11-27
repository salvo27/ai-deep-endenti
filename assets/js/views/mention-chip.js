import { h } from '../lib/dom.js';
import { ALL } from '../lib/mentions.js';
import { tx } from '../i18n/index.js';
import { state } from '../store.js';

const t = tx.mentions;

// «@Nome» evidenziato se è un membro (o tutto il progetto), con un colore diverso se riguarda chi legge. Il tag di tutti
// resta @[tutti] nel testo, come lo legge il database, e si mostra nella lingua di chi legge.
export function mentionChip(name) {
  // A member without a profile has no name: nobody can tag them.
  const member = state.members.find((m) => typeof m.display_name === 'string' && m.display_name.toLowerCase() === name.toLowerCase());
  const everyone = name.toLowerCase() === ALL;
  if (!member && !everyone) return `@${name}`;
  const me = everyone || member.user_id === state.user?.id;
  return h('span', { class: ['mention', me && 'is-me'], title: everyone ? t.wholeTeam : member.display_name }, `@${everyone ? t.everyone : member.display_name}`);
}

export const mentionsMe = (text) => {
  const me = state.members.find((m) => m.user_id === state.user?.id)?.display_name?.toLowerCase();
  return [...String(text || '').matchAll(/@\[([^\]\n]{1,80})\]/g)].some((m) => {
    const name = m[1].trim().toLowerCase();
    return name === ALL || name === me;
  });
};
