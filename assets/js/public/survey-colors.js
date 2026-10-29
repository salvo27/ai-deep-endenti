// Colori della pagina pubblica dei questionari, senza DOM né rete: li usa anche l'editor del sito per l'anteprima.

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// Luminanza relativa e contrasto come nelle WCAG.
function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Testo sul colore del questionario: nero o bianco, quello che contrasta di più.
export const contrastText = (hex) => (contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000') ? '#ffffff' : '#000000');

const toHex = (channels) => `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const channels = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

export function mixColor(from, to, amount) {
  const [a, b] = [channels(from), channels(to)];
  return toHex(a.map((c, i) => c + (b[i] - c) * amount));
}

// Il colore si sposta verso il nero o il bianco a piccoli passi, solo finché non basta.
function shiftUntil(hex, toward, ok) {
  for (let step = 0; step <= 50; step += 1) {
    const color = mixColor(hex, toward, step / 50);
    if (ok(color)) return color;
  }
  return toward;
}

// Pagina, scheda e righe dei temi in survey.css: chiaro (l), seppia (s) e scuro (d).
export const THEME_BACKGROUNDS = Object.freeze({
  l: ['#f4f3ef', '#ffffff', '#faf9f6'],
  s: ['#ede3cf', '#f8f1e3', '#f3ead8'],
  d: ['#141518', '#1c1d21', '#222328'],
});

// Il colore del questionario adattato a ogni tema, come variabili CSS: almeno 3:1 sugli sfondi per righe scelte,
// barra e bordi, almeno 4,5:1 per il testo sopra e per il testo colorato. Con contrasto elevato serve 7:1, altrimenti nero.
export function accentTokens(accent) {
  const tokens = {};
  for (const [key, backgrounds] of Object.entries(THEME_BACKGROUNDS)) {
    const toward = key === 'd' ? '#ffffff' : '#000000';
    const ui = shiftUntil(accent, toward, (c) => backgrounds.every((bg) => contrastRatio(c, bg) >= 3) && Math.max(contrastRatio(c, '#ffffff'), contrastRatio(c, '#000000')) >= 4.5);
    const tint = mixColor(backgrounds[1], ui, key === 'd' ? 0.2 : 0.12);
    const text = shiftUntil(ui, toward, (c) => [backgrounds[1], backgrounds[2], tint].every((bg) => contrastRatio(c, bg) >= 4.5));
    Object.assign(tokens, { [`--ui-${key}`]: ui, [`--on-${key}`]: contrastText(ui), [`--tint-${key}`]: tint, [`--text-${key}`]: text });
  }
  const strong = contrastRatio(accent, '#ffffff') >= 7;
  return { ...tokens, '--ui-h': strong ? accent : '#000000', '--on-h': '#ffffff' };
}
