// Same entries as ../it/exporting.js, which is the reference: tests/unit/i18n.test.mjs checks it.
export const exporting = {
  status: (label) => `Status: ${label}`,
  exportedOn: (date) => `Exported on ${date}`,
  scoring: 'Team scoring',
  score: (score, voters) => `Score: ${score === null ? 'no scores' : `${score}/100`} (scored by ${voters === 1 ? '1 person' : `${voters} people`})`,
  validated: '(validated)',
  experiments: 'Experiments',
  interviews: 'Interviews',
  competitors: {
    us: 'Us',
    feature: 'Feature',
    importance: 'Importance',
    yes: 'yes',
  },
};
