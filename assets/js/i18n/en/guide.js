// Same entries as ../it/guide.js, which is the reference: tests/unit/i18n.test.mjs checks it.
export const guide = {
  title: 'Guide',
  subtitle: 'The roadmap to follow for each idea, in order: from the team to the company. Each idea has an interactive copy in its Roadmap tab, where you tick off the steps you have done.',
  tabs: {
    roadmap: 'Roadmap',
    concepts: 'Concepts',
  },
  progress: {
    title: 'Where your ideas stand',
    empty: 'No ideas yet: the roadmap of each idea will appear here.',
    columns: ['Idea', 'Status', 'Progress', 'Phase', 'Next step'],
    complete: 'Complete',
  },
  howTo: {
    title: 'How to use the roadmap',
    order: (phases, steps) => `${phases} phases and ${steps} steps, in the order that lowers the risk: people and the problem first, then the solution, and the company only at the end.`,
    points: [
      'Each step says what to do, how to do it, when it counts as done and the most common mistake to avoid.',
      'A step is done only when you tick it: who ticked it and when stays on record, and the tick can be removed. If the data on the site suggests it is done, for example 20 interviews recorded, the roadmap points it out.',
      'Each phase ends with a gate: what must be true before you move on. If a phase is not complete, the next one reminds you.',
      'Each idea has its own roadmap, because team, customers and timing can differ from one idea to the next.',
    ],
    example: (name) => `Example of an advanced roadmap: ${name}`,
  },
  toolsTitle: 'The tools on the board',
  tools: {
    idea: { name: 'Idea', text: 'The starting sheet: one sentence, problem, customer, solution.' },
    roadmap: { name: 'Roadmap', text: 'All the steps in order, with what each idea still has to do.' },
    canvas: { text: 'The hypotheses of the business model, block by block.' },
    customers: { name: 'Customers', text: 'Buyer personas and the Value Proposition Canvas.' },
    market: { name: 'Market', text: 'TAM, SAM, SOM and competitor analysis.' },
    deepTech: { text: 'TRL, intellectual property, university, rules and grants.' },
    experiments: { name: 'Experiments', text: 'Javelin board: one assumption per experiment, criterion decided beforehand.' },
    interviews: { name: 'Interviews', text: 'Facts, quotes and commitments made.' },
    decisions: { name: 'Decisions', text: 'What was decided, with the alternatives and the reasons.' },
    team: { name: 'Team', text: 'Team Canvas, equity, availability and hours worked.' },
  },
};
