import { h, autoGrow } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { CANVAS_BLOCKS } from '../schema.js';

const AREAS = ['prob', 'sol', 'met', 'uvp', 'adv', 'chan', 'seg', 'cost', 'rev'];

function blocksByArea() {
  const map = new Map(AREAS.map((a) => [a, []]));
  for (const block of CANVAS_BLOCKS) map.get(block.area).push(block);
  return map;
}

export function canvasView(canvas) {
  const data = canvas.data || {};
  return h(
    'div',
    { class: 'lean-canvas' },
    [...blocksByArea()].map(([area, blocks]) =>
      h(
        'section',
        { class: ['lc-cell', `lc-${area}`] },
        blocks.map((block) =>
          h(
            'div',
            { class: ['lc-block', !block.main && 'lc-sub'] },
            h(
              'h3',
              null,
              block.label,
              block.main && data.validated?.[block.key]
                ? h('span', { class: 'validated', title: 'Validato con dati' }, icon('check', 14), 'validato')
                : null,
            ),
            data[block.key] ? h('div', { class: 'text-block' }, data[block.key]) : h('p', { class: 'muted small' }, block.help || '-'),
          ),
        ),
      ),
    ),
  );
}

export function canvasEditor(working, onChange) {
  working.data.validated = working.data.validated || {};
  return h(
    'div',
    { class: 'lean-canvas is-editing' },
    [...blocksByArea()].map(([area, blocks]) =>
      h(
        'section',
        { class: ['lc-cell', `lc-${area}`] },
        blocks.map((block) => {
          const textarea = autoGrow(
            h('textarea', {
              class: 'input',
              rows: block.main ? 4 : 2,
              placeholder: block.help || '',
              value: working.data[block.key] || '',
              'aria-label': block.label,
              onInput: (event) => {
                working.data[block.key] = event.target.value;
                onChange();
              },
            }),
          );
          return h(
            'div',
            { class: ['lc-block', !block.main && 'lc-sub'] },
            h(
              'div',
              { class: 'lc-head' },
              h('h3', null, block.label),
              block.main
                ? h(
                    'label',
                    { class: 'check' },
                    h('input', {
                      type: 'checkbox',
                      checked: working.data.validated[block.key] === true,
                      onChange: (event) => {
                        if (event.target.checked) working.data.validated[block.key] = true;
                        else delete working.data.validated[block.key];
                        onChange();
                      },
                    }),
                    'validato',
                  )
                : null,
            ),
            textarea,
          );
        }),
      ),
    ),
  );
}
