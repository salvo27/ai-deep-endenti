// Same entries as ../it/common.js, which is the reference: tests/unit/i18n.test.mjs checks it.
export const common = {
  appName: 'ai-deep-endenti',
  format: {
    now: 'just now',
    today: 'Today',
    yesterday: 'Yesterday',
    money: (amount) => `€${amount}`,
    millions: (amount) => `€${amount}m`,
    billions: (amount) => `€${amount}bn`,
  },
};
