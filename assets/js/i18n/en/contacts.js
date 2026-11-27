// Same entries as ../it/contacts.js, which is the reference: tests/unit/i18n.test.mjs checks it.
const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;

export const contacts = {
  title: 'Contacts',
  subtitle: 'The people to talk to for every idea. Each one needs an owner and a date.',
  filters: {
    tutte: 'All',
    mie: 'Mine',
    senza: 'Without an owner',
    settimana: 'To talk to this week',
  },
  which: 'Which people',
  status: 'Status',
  idea: 'Idea',
  allStatuses: 'All',
  allIdeas: 'All',
  noDate: 'no date',
  late: (n) => `overdue by ${days(n)}`,
  today: 'today',
  tomorrow: 'tomorrow',
  inDays: (n) => `in ${days(n)}`,
  summary: (s, forIdea) =>
    `${people(s.total)}${forIdea ? ' for this idea' : ''}: ${s.toContact} to contact, ${s.withOwner} with an owner, ${s.thisWeek} to talk to this week${s.overdue ? ` (${s.overdue} overdue)` : ''}.`,
  statusOf: (title) => `Status: ${title}`,
  ownerOf: (title) => `Owner: ${title}`,
  nextOf: (title) => `Next contact: ${title}`,
  ownerMessage: (name) => `Owner: ${name}`,
  ownerNone: 'nobody',
  nextMessage: (date) => `Next contact: ${date}`,
  nextNone: 'no date',
  interview: 'Interview',
  logConversation: 'Log the conversation',
  logConversationHint: 'Write how it went: the person is linked to the interview and moves to “In touch”',
  empty: 'Nobody on the list yet. You add people from the page of each idea, in the “People and interviews” tab.',
  noMatch: 'Nobody matches these filters.',
  headers: {
    person: 'Person',
    idea: 'Idea',
    status: 'Status',
    owner: 'Owner',
    next: 'Next contact',
  },
  add: 'Add a person',
};
