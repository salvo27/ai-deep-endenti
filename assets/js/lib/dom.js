const PROPERTIES = new Set([
  'value',
  'checked',
  'disabled',
  'selected',
  'hidden',
  'multiple',
  'readOnly',
  'required',
  'indeterminate',
  'open',
]);

// Tutto il testo passa da textContent: nessun HTML generato da dati degli utenti o di Claude.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) applyAttrs(el, attrs);
  append(el, children);
  return el;
}

function applyAttrs(el, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'innerHTML' || key === 'outerHTML') throw new Error('innerHTML non è permesso');
    if (key === 'class') {
      el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    } else if (key === 'style') {
      for (const [prop, v] of Object.entries(value)) {
        if (v === undefined || v === null) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, String(v));
        else el.style[prop] = v;
      }
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (PROPERTIES.has(key)) {
      el[key] = value;
    } else if (key === 'href' || key === 'src') {
      el.setAttribute(key, safeUrl(String(value)));
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

export function safeUrl(url) {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|#|\/|\.\/|blob:|data:image\/)/i.test(trimmed)) return trimmed;
  return '#';
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function mount(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  for (const child of children) el.append(child);
  return el;
}

let toastHost = null;

// Un solo pannello aperto alla volta (menu, notifiche, menzioni, ricerca): chi si apre lo annuncia e gli altri si chiudono.
export function claimPopup(id) {
  const view = document.defaultView || window;
  document.dispatchEvent(new view.CustomEvent('popup-open', { detail: id }));
}

export function onOtherPopup(id, close) {
  const handler = (event) => {
    if (event.detail !== id) close();
  };
  document.addEventListener('popup-open', handler);
  return () => document.removeEventListener('popup-open', handler);
}

export function toast(message, { type = 'info', timeout = 4500 } = {}) {
  if (!toastHost || !toastHost.isConnected) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const el = h('div', { class: ['toast', `toast-${type}`] }, message);
  toastHost.append(el);
  setTimeout(() => el.remove(), timeout);
  return el;
}

export function openModal({ title, body, actions = [], wide = false, onClose } = {}) {
  const dialog = h('dialog', { class: ['modal', wide && 'modal-wide'], 'aria-label': title || 'Finestra' });
  const footer = h('footer', { class: 'modal-actions' });
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    dialog.remove();
    onClose?.(result);
  };
  for (const action of actions) {
    footer.append(
      h(
        'button',
        {
          type: 'button',
          class: ['btn', action.kind ? `btn-${action.kind}` : 'btn-ghost'],
          onClick: async () => {
            if (action.onClick) {
              const keepOpen = await action.onClick();
              if (keepOpen === true) return;
            }
            close(action.value);
          },
        },
        action.label,
      ),
    );
  }
  append(dialog, [
    h(
      'header',
      { class: 'modal-header' },
      h('h2', null, title || ''),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Chiudi', onClick: () => close(undefined) }, '×'),
    ),
    h('div', { class: 'modal-body' }, body),
    actions.length ? footer : null,
  ]);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close(undefined);
  });
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') {
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute('open', '');
    }
  } else {
    dialog.setAttribute('open', '');
  }
  return { dialog, close };
}

export function confirmDialog(message, { title = 'Conferma', okLabel = 'Conferma', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: h('p', null, message),
      onClose: (value) => resolve(value === true),
      actions: [
        { label: 'Annulla', value: false },
        { label: okLabel, value: true, kind: danger ? 'danger' : 'primary' },
      ],
    });
  });
}

export function promptDialog({ title, label, placeholder = '', okLabel = 'Conferma', maxLength = 500, value = '' }) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', class: 'input', placeholder, maxlength: maxLength, value });
    openModal({
      title,
      body: h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input),
      onClose: (result) => resolve(result === true ? input.value : null),
      actions: [
        { label: 'Annulla', value: false },
        { label: okLabel, value: true, kind: 'primary' },
      ],
    });
    setTimeout(() => input.focus(), 0);
  });
}

export function busy(button, promiseFactory) {
  return async (...args) => {
    if (button.disabled) return undefined;
    button.disabled = true;
    button.classList.add('is-busy');
    try {
      return await promiseFactory(...args);
    } finally {
      button.disabled = false;
      button.classList.remove('is-busy');
    }
  };
}

export function autoGrow(textarea) {
  const resize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight + 2, 640)}px`;
  };
  textarea.addEventListener('input', resize);
  globalThis.requestAnimationFrame?.(resize);
  return textarea;
}
