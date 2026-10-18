import { JSDOM } from 'jsdom';

// DOM simulato per i test dell'interfaccia. Va chiamato prima di importare le viste.
export function setupDom(url = 'https://board.example/#/') {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url, pretendToBeVisual: true });
  const { window } = dom;
  const globals = {
    window,
    document: window.document,
    location: window.location,
    history: window.history,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    Node: window.Node,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
  return dom;
}

export const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

export async function flush(times = 5) {
  for (let i = 0; i < times; i += 1) await tick();
}

export function text(el) {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
}

export function byText(root, selector, needle) {
  return [...root.querySelectorAll(selector)].find((el) => text(el).includes(needle)) || null;
}

export function typeInto(input, value) {
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}
