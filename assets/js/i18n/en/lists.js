// Same entries as ../it/lists.js, which is the reference: tests/unit/i18n.test.mjs checks it.
const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

export const lists = {
  sources: {
    colloquio: 'Conversations with people',
    ricerca: 'Online research',
  },
  all: 'All',
  filters: {
    idea: 'Idea',
    member: 'Member',
    type: 'Type',
    commitment: 'Commitment',
    text: 'Text',
  },
  late: (n) => `overdue by ${days(n)}`,
  untilDue: (n) => `${days(n)} to the deadline`,
  headers: {
    date: 'Date',
    interview: 'Interview',
    idea: 'Idea',
    interviewer: 'Interviewer',
    status: 'Status',
    commitment: 'Commitment',
    problem: 'Problem',
  },
  empty: (kinds) => `No ${kinds} match these filters.`,
  subtitles: {
    experiment: 'Every experiment tests an assumption, with a success criterion decided beforehand.',
    interview: 'Facts and commitments count more than opinions and compliments.',
    decision: 'What we decided, when and why.',
  },
  newItem: (kind) => `New: ${kind}`,
};
