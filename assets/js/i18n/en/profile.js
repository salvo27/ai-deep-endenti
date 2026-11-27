// Same entries as ../it/profile.js, which is the reference: tests/unit/i18n.test.mjs checks it.
export const profile = {
  language: {
    title: 'Language',
    help: 'The site follows the language of your device: Italian if it is set to Italian, English otherwise. Here you can choose one for this device.',
    label: 'Site language',
    auto: (name) => `Automatic (${name})`,
    saveFailed: 'This device does not let me save the choice.',
  },
};
