import { h } from '../lib/dom.js';
import { ALL } from '../lib/mentions.js';
import { state } from '../store.js';

// «@Nome» evidenziato se è un membro (o «tutti»), con un colore diverso se riguarda chi legge.
export function mentionChip(name) {
  const member = state.members.find((m) => m.display_name.toLowerCase() === name.toLowerCase());
  const everyone = name.toLowerCase() === ALL;
  if (!member && !everyone) return `@${name}`;
  const me = everyone || member.user_id === state.user?.id;
  return h('span', { class: ['mention', me && 'is-me'], title: everyone ? 'Tutta la squadra' : member.display_name }, `@${everyone ? ALL : member.display_name}`);
}

export const mentionsMe = (text) => {
  const me = state.members.find((m) => m.user_id === state.user?.id)?.display_name?.toLowerCase();
  return [...String(text || '').matchAll(/@\[([^\]\n]{1,80})\]/g)].some((m) => {
    const name = m[1].trim().toLowerCase();
    return name === ALL || name === me;
  });
};
