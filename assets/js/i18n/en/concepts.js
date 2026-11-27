// Same entries as ../it/concepts.js, which is the reference: tests/unit/i18n.test.mjs checks it.
// Concepts from «Il manuale dello startupper» (Boceda, D'Amato, De Martino) and the added chapter on deep tech,
// explained in our own words. Rules and figures as checked on 17 October 2026.
export const concepts = {
  intro: (date) => `The concepts from the Italian book “Il manuale dello startupper” and from the chapter on deep tech, briefly explained and linked to the tools on the board. Rules and figures checked on ${date}: check them again before you decide.`,
  chapters: {
    1: 'The basics',
    2: 'Before you start',
    3: 'Validation',
    5: 'Market and competitors',
    6: 'Team',
    7: 'Funding and pitching',
    8: 'Marketing and sales',
    9: 'Economics and finance',
    10: 'Legal matters',
  },
  addedChapter: (name) => `${name} (added chapter)`,
  panel: {
    search: 'Search for a concept',
    chapter: 'Chapter',
    allChapters: 'All chapters',
    phase: 'Idea stage',
    allPhases: 'All stages',
    showMinor: 'Also show minor topics',
    noMatch: 'No concepts match these filters.',
  },
  help: {
    onBoard: (where) => `On the board: ${where}`,
    addedChapter: 'Added chapter on deep tech',
    chapter: (n, label) => `Chapter ${n}: ${label}`,
    verified: (date) => `rules and figures checked on ${date}`,
    allConcepts: 'All concepts',
    whatIs: (term) => `What it means: ${term}`,
  },
  entries: {
    // 1. The basics
    startup: {
      text: 'A temporary organisation searching for a business model that can be repeated and scaled, under deep uncertainty. If the business cannot grow much faster than its costs, it is a traditional company or a lifestyle business: that is perfectly fine, but it is something else.',
      where: 'The “Check that it is a startup” step in each idea’s roadmap',
    },
    scalabilita: {
      term: 'Scalability and replicability',
      text: 'Scaling means serving many more customers without growing people and costs at the same pace. Replicating means taking the same model to another market without redesigning it. A useful question: what breaks if you have a hundred times as many customers?',
    },
    'dieci-volte': {
      term: 'Ten times better',
      text: 'To convince people to change their habits, the solution has to be clearly better than what they use today, ideally ten times better: faster, cheaper or simpler. A 10% improvement is rarely enough for a startup.',
    },
    'ciclo-di-vita': {
      term: 'Life cycle and funding rounds',
      text: 'The typical stages are bootstrap and pre-seed (idea and validation, your own money), seed (first customers), early stage (product-market fit), early growth (Series A and B rounds to grow) and growth (Series C). It ends with an exit: a stock market listing, an acquisition or a buyback of the shares. Each stage has its own investors.',
    },
    'lifestyle-business': {
      term: 'SMEs and lifestyle businesses',
      text: 'An SME creates value and jobs but grows in a straight line; a lifestyle business exists to give its founder independence and an income. They are not startups because they do not aim for exponential growth, and seeing this early saves you from looking for investors for the wrong project.',
    },
    'incubatore-acceleratore': {
      term: 'Incubators and accelerators',
      text: 'An incubator helps projects that are still raw to build their business model, over a long time and often with public or university money. An accelerator supports startups that are already up and running for a few months, usually in exchange for shares (5-15%) and with a small investment. Before joining, look at what they ask for and how it went for those who took part.',
    },
    ecosistema: {
      term: 'Ecosystem',
      text: 'The mix of universities, incubators, investors, large companies and rules in which a startup is born. A good ecosystem does not guarantee success, but it makes it easier to find people, customers and capital; it does not necessarily stop at national borders.',
    },

    // 2. Before you start
    'quattro-risorse': {
      term: 'The four resources: time, money, network, skills',
      text: 'Before you start, take an honest stock of how much time, how much money, which contacts and which skills the team really brings. Personal skills (communicating, solving problems, leading) count as much as technical ones.',
      where: 'Team Canvas, the Strengths and Weaknesses blocks',
    },
    'perche-falliscono': {
      term: 'Why startups fail',
      text: 'Studies of startups that closed always put two causes at the top: no market that wants the product, and running out of cash. Then come the wrong team, competition, pricing, business model and timing. The lesson: validate early and spend little until you know what works.',
    },
    'scaling-prematuro': {
      term: 'Premature scaling',
      text: 'Growing (people, spending, marketing) before product and market are validated. It is the most common cause of disappointing results in the Startup Genome data: you burn cash amplifying something that does not work yet.',
    },
    'innamorarsi-idea': {
      term: 'Falling in love with the idea',
      text: 'The most dangerous bias for founders: you only look for confirmation and ignore the warning signs. The cure is to set the criteria for judging experiments beforehand and let the data decide.',
      where: 'The success criterion of each experiment',
    },
    'quando-costituire': {
      term: 'When to incorporate',
      text: 'Not straight away: validate first. Incorporate when you start signing agreements with customers, suppliers or partners, and before talking to investors, so that you do not slow down an investment.',
    },
    'errori-tipici': {
      term: 'Common mistakes',
      text: 'Setting the strategy too late, working on too many projects at once, hiring late and badly, rushing ahead, not delegating and never taking a break. They are management mistakes more than mistakes in the idea.',
    },
    'sindrome-impostore': {
      term: 'Impostor syndrome',
      text: 'The feeling that your achievements are down to luck. It is common among founders and makes them stay behind the scenes; it helps to look at the facts and keep track of the positive feedback you receive.',
    },

    // 3. Validation
    validazione: {
      term: 'Validation',
      text: 'Applying the scientific method to business: you state hypotheses about the customer and the problem, design experiments that could prove them wrong and decide based on the data. The first two things to validate are always the customer and the problem, before the solution.',
      where: 'The Experiments and Interviews of each idea',
    },
    'customer-development': {
      text: 'Steve Blank’s method starts from the customer instead of the product. Four stages: customer discovery (do the customer and the problem exist?), customer validation (does anyone buy the solution?), customer creation (demand is scaled up) and company building (the company is built). If validation fails, you go back with a pivot.',
    },
    'fuori-dall-ufficio': {
      term: 'Getting out of the building',
      text: 'The answers are not in the team’s room but in the market: as soon as the hypotheses are written down, go and talk to potential customers. On the Javelin board it marks the move from hypothesis to experiment.',
    },
    'cliente-utente': {
      term: 'Customer and user',
      text: 'The customer pays, the user uses: they can be different people, like the advertisers and the members of a social network. Both have to be described and validated, but the money comes from the customer.',
      where: 'Buyer persona, the Role in the purchase field',
    },
    'early-adopter': {
      text: 'People who have the problem, know they have it, are already trying to solve it and are not satisfied. They are the first to try, to give feedback and often to pay: focus your interviews and first launches on them.',
      where: 'Lean Canvas and Buyer persona',
    },
    'intervista-validazione': {
      term: 'Validation interviews',
      text: 'Questions about recent facts and real behaviour, never about future intentions (“the last time you...”, not “would you buy...?”). Do not pitch the solution: listen and write down the exact words. In person, one at a time, 15-30 minutes, with people in the target group rather than friends and family; end by asking for a concrete commitment.',
      where: 'The Interviews of each idea; Claude prepares the outline',
    },
    'mom-test': {
      term: 'The Mom Test',
      text: 'The name comes from a book by Rob Fitzpatrick: ask questions that even your mother could not lie to you about just to be kind. Compliments and “great idea” are worth nothing; what counts are facts, money already spent and commitments made.',
    },
    questionario: {
      term: 'Validation surveys',
      text: 'Useful when the target is broad and loosely defined, to find people to interview. Structure: an introduction with the purpose and privacy, a few demographic questions, at most ten questions about the problem in the past or present tense, an optional email, and a thank you at the end. No solution, no hypotheticals, no incentives.',
    },
    javelin: {
      term: 'Javelin board',
      text: 'On the left you write customer, problem, solution and assumptions; on the right you design experiments, one in each column. Each experiment has a riskiest assumption, a method, a success criterion decided beforehand, the result, the decision and what you learnt. The solution is written only after the problem has been validated.',
      where: 'Experiments, Javelin view',
    },
    'assunzione-rischiosa': {
      term: 'Riskiest assumption',
      text: 'Of all the hypotheses the idea rests on, the one that would bring everything down if it turned out to be false. Test it first and as cheaply as possible.',
    },
    'criterio-successo': {
      term: 'Success criterion',
      text: 'The threshold, decided before the experiment, above which the hypothesis counts as confirmed: for example “at least 6 out of 12 describe the problem in the last month”. Setting it first stops you from reinterpreting the results afterwards.',
    },
    agile: {
      term: 'Agile, Scrum and Kanban',
      text: 'Development methods that alternate building and checking in short cycles. Scrum works in sprints with fixed goals, useful when the hypotheses change quickly; Kanban pulls work from a priority list, better suited to a startup that is already up and running.',
    },

    // 4. Lean Startup
    'lean-startup': {
      text: 'Eric Ries’s method: put a minimal version in customers’ hands early and improve it based on the data, in the build, measure, learn loop. It cuts the time and money spent building something nobody wants.',
    },
    'problem-solution-fit': {
      text: 'The first milestone: a specific group of customers really has the problem, often enough and strongly enough, and the proposed solution interests them. There is no magic number: it depends on the market and the sample.',
      where: 'Guide, the Exploring stage',
    },
    'product-user-fit': {
      text: 'The second milestone: early adopters use the product, return to it and recommend it. It is measured with retention, engagement and qualitative feedback, before pushing for growth.',
    },
    'product-market-fit': {
      text: 'Being in a good market with a product that satisfies it, and knowing how to reach it. A quick check is the Sean Ellis test: if at least 40% of customers would be “very disappointed” without the product, you are close. Pair it with metrics such as paying customers, organic growth, churn and lifetime value.',
    },
    uvp: {
      term: 'Unique value proposition (UVP)',
      text: 'One sentence that says what you offer, to whom and why you are different, in the customers’ words. Useful templates: “We help X do Y by doing Z” (Steve Blank); “For [who] who [problem], [product] is a [category] that [benefit]” (Geoffrey Moore); “The [well-known company] of [industry]”. Short, concrete, no jargon.',
      where: 'Lean Canvas, the Unique value proposition block; the In one sentence field of the idea',
    },
    'smoke-test': {
      text: 'Measuring interest in a solution that does not exist yet: a page with a price and a button, a presentation to a customer. People who click must be told honestly that the product is not ready. You need tracking, metrics set beforehand and traffic from the right target group.',
      where: 'Experiments, the Landing page method',
    },
    'landing-page': {
      text: 'A single page with five elements: value proposition, an image or video, benefits, credible proof and one clear call to action. With 500-700 visitors from the target group you get a first idea; then change one element at a time with A/B tests.',
    },
    mvp: {
      text: 'The smallest version that holds all the promised value, to learn from the market while spending little: not a prototype and not a “mini” product. For a digital product, ideally stay under a month of work and a few thousand euros; in deep tech it becomes a series of demonstrators.',
      where: 'Experiments, the Demo and Concierge methods',
    },
    'tipi-mvp': {
      term: 'Types of MVP',
      text: 'Core feature (a single function), video demo (Dropbox), Wizard of Oz (it looks automatic but is done by hand), concierge (the customer knows a person is behind it), piecemeal (existing tools stitched together, like Groupon) and crowdfunding (pre-sales).',
    },
    'business-model': {
      term: 'Business model',
      text: 'How the company creates value for customers and keeps part of it: what it makes, how it sells it and how it gets paid. It has to hold up over time, with revenue higher than costs.',
    },
    bmc: {
      text: 'Nine blocks in four areas: customers (segments, channels, relationships), offer (value proposition), infrastructure (activities, resources, partners) and finance (revenue, costs). Better suited than the Lean Canvas once the idea is validated and you need to describe the company.',
    },
    'lean-canvas': {
      text: 'Ash Maurya’s adaptation for the early stages: problem, segments, solution, unique value proposition, unfair advantage, channels, key metrics, costs and revenue. Fill it in in this order, starting from the problem; every block stays a hypothesis until it is validated.',
      where: 'The Lean Canvas of each idea',
    },
    'vantaggio-sleale': {
      term: 'Unfair advantage',
      text: 'Something competitors cannot easily copy or buy: exclusive data, rare skills, a network, a protected technology. At the start there often is none, and it is right to say so instead of making one up.',
    },
    vpc: {
      text: 'Two sides that must fit together. Customer profile: jobs (what they want to get done, functional, social, emotional), pains (what gets in their way) and gains (what they would like to achieve). Value map: products, how they relieve the pains and how they create the gains. Fill in the profile first, then check it by talking to people.',
      where: 'The Customers tab of each idea',
    },
    'modelli-ricavo': {
      term: 'Revenue models',
      text: 'Transactional, marketplace (a commission between two parties), subscription (SaaS), freemium (free basics, paid features), pay as you go, rental, franchising, broker, community, affiliate, advertising. Start with one main source and add the others later.',
    },

    // 5. Market and competitors
    'tam-sam-som': {
      term: 'TAM, SAM and SOM',
      text: 'TAM is the total demand for that type of product; SAM is the part the product can reach given its target and geography; SOM is the share you can realistically win in a specific year, 3-5 years out. They are expressed in euros a year and are only as good as the sources and reasoning behind them.',
      where: 'The Market tab of each idea',
    },
    'stima-dal-basso': {
      term: 'Bottom-up estimate',
      text: 'When market data is missing, start from the customers you can reach: how many there are, how many you can look after with the resources you have, and at what price. Investors often find it more credible than a top-down estimate.',
    },
    'buyer-persona': {
      term: 'Buyer personas',
      text: 'A realistic portrait of a typical customer, based on interviews and data: who they are, their habits, needs, dreams and fears, how they solve the problem today. If there are several types of customer (for example buyers and sellers in a marketplace) you need a portrait for each.',
      where: 'The Customers tab of each idea',
    },
    concorrenti: {
      term: 'Competitor analysis',
      text: '“We have no competitors” is never true: start from the customer’s need and include direct competitors (same solution) and indirect ones (same need, different solution). Study their products, prices, sales and marketing: they are the best source of learning.',
      where: 'The Market tab of each idea',
    },
    benchmarking: {
      term: 'Benchmarking table and two-axis chart',
      text: 'The table compares you and your competitors only on the features that matter to the customer (fifteen at most, of high or medium importance); the chart places everyone on two axes you choose. Together they show the gap in the market you want to fill, in the top right corner.',
    },

    // 6. Team
    cofounder: {
      term: 'Co-founders and a balanced team',
      text: 'Better not to start alone: a co-founder shares the load and fills the gaps in your skills. The ideal team combines technical and business skills, is motivated, reliable and respectful, and avoids costly overlaps in the early stages.',
      where: 'The Team Canvas',
    },
    mentor: {
      text: 'An experienced person who gives advice without taking the founder’s place and, not being in love with the project, can suggest a pivot or stopping. It works with clear roles, concrete questions and a good personal relationship.',
    },
    'team-canvas': {
      text: 'A template the team fills in together to get aligned: people and roles, shared and personal goals, purpose, values, rules, strengths, weaknesses, needs and expectations. It puts in writing what usually stays unspoken until the first conflict.',
      where: 'The Team page',
    },

    // 7. Funding and pitching
    'capitale-debito-rischio': {
      term: 'Equity and debt',
      text: 'With equity the investor becomes a shareholder and shares the risk; with debt they lend money that has to be paid back, with or without interest. The choice depends on the stage: debt needs cash flow to repay it.',
    },
    bootstrapping: {
      text: 'Funding yourself with your own money and then with revenue. It forces you to spend only on validation, keeps control in the founders’ hands and strengthens your position in future negotiations; but it limits how fast you can grow.',
    },
    'tre-f': {
      text: 'The first to believe in the project when nobody else does. They invest out of trust, not analysis: clear written agreements keep the relationships from being spoilt.',
    },
    'business-angel': {
      text: 'Individuals who invest their own money in the early stages, from a few thousand to about 100,000 euros, also bringing experience and contacts. They invest in many startups knowing that most will fail; they often join together in networks.',
    },
    'tre-t': {
      term: 'The three Ts: team, traction, technology',
      text: 'The three things an investor looks at. If there is no traction yet, make up for it with a strong team or a truly superior technology.',
    },
    'venture-capital': {
      text: 'Funds that invest large sums in high-risk startups, with a selection process in several stages up to due diligence. They bring networks and skills but reduce the founders’ control. Corporate venture capital is the version tied to a large company.',
    },
    crowdfunding: {
      text: 'Raising money from many people through online platforms: reward (in exchange for the product), equity (in exchange for shares), donation and lending. In Italy, equity and lending go only through platforms authorised under the European ECSP regulation since 11 November 2023.',
    },
    bandi: {
      term: 'Grants and public funding',
      text: 'Public funding as grants, low-interest loans or guarantees. Read the calls carefully: who and what is eligible, allowed expenses, deadlines, first come first served or ranked; they often reimburse you afterwards, so you have to spend the money first.',
      where: 'Deep tech sheet, the Non-dilutive funding field',
    },
    pitch: {
      text: 'A short presentation to ask for something, usually an investment. The essential parts: problem and solution, market size, business model, traction, go to market, competitors, team, key figures, roadmap and the ask. Adapt it to the audience; the details go in the backup slides.',
    },
    traction: {
      text: 'Proof that people want the product and pay for it, measured with the right metrics for that business (revenue, active users, repeat orders). The trend over time matters most.',
    },
    'go-to-market': {
      text: 'How the product reaches customers: the segment to target first, channels, price, sales. It is built by trial and error, measuring and correcting.',
    },

    // 8. Marketing and sales
    'mission-vision': {
      term: 'Mission, vision and values',
      text: 'The mission says what you do, for whom and how; the vision where you want to be in a few years; the values how you behave with each other and with others. They help you decide and choose the right people, not decorate the website.',
      where: 'Team Canvas, the Purpose and Values blocks',
    },
    'brand-identity': {
      term: 'Brand identity, name and logo',
      text: 'The name, tone, logo, mission and values that make the company distinctive; Kapferer’s prism breaks it into six facets. The name is best short, unique and free as a domain and trademark; the logo simple and timeless. It comes after validation.',
    },
    'personal-branding': {
      term: 'The founder’s personal brand',
      text: 'Telling your story and the startup’s on your audience’s channels, consistently, truthfully and with restraint. The founder is often the first face of the project.',
    },
    'customer-journey': {
      text: 'The customer’s path in eight stages: awareness, consideration, comparison, purchase, adoption, use, loyalty and word of mouth. Mapping it shows where people drop off.',
    },
    aarrr: {
      term: 'Pirate funnel (AARRR)',
      text: 'The stages to measure in order to grow: awareness, acquisition, activation, revenue, retention and referral. One question and one metric for each stage; work on the weakest one.',
    },
    'growth-hacking': {
      text: 'Marketing based on fast experiments, measured on the funnel, to find the growth levers that really work. The term was coined by Sean Ellis.',
    },
    'canali-acquisizione': {
      term: 'Acquisition channels',
      text: 'Word of mouth, PR, search engines, social media, content, email, direct sales, partnerships, events, communities and more. Start by ranking the most promising, test three or four cheaply and keep those with a sustainable acquisition cost and the right customers. In B2B, direct sales are often enough.',
      where: 'Lean Canvas, the Channels block',
    },
    lancio: {
      term: 'Launching the product',
      text: 'A launch is a coordinated effort with a precise goal (selling, collecting contacts, validating). During validation go step by step: a silent launch, friends, a semi-public launch, then the general public. First you need a checklist: product, price, documents, support, channels, budget and dates.',
    },
    pivot: {
      text: 'A change of direction after learning that something does not work: change one element at a time. Eric Ries describes ten types: zoom-in, zoom-out, customer segment, customer need, platform, business architecture, value capture, engine of growth, channel and technology.',
      where: 'Decisions, and experiments whose decision is Change direction',
    },
    'unit-economics': {
      text: 'The numbers for a single customer or a single sale: margin, the cost of winning that customer and lifetime value. If a customer costs more than they bring in, growing makes things worse.',
    },

    // 9. Economics and finance
    'business-plan': {
      text: 'The document that sums up the project, market, competition, SWOT analysis, marketing, roadmap, team and a 3-5 year financial plan. It should be short, written for its reader, and updated often: no plan survives first contact with customers intact.',
    },
    'financial-plan': {
      term: 'Financial plan',
      text: 'Forecasts of cash flow and profit and loss, with revenue, costs, salaries, investments and funding needs. Margins to watch: EBITDA, EBIT, net profit. Redo it every year, review it halfway through and update it every month with real figures.',
    },
    'cash-flow': {
      term: 'Cash flow and break-even point',
      text: 'Cash is what lets you pay salaries and suppliers: you can make a profit on paper and still run out of money. The break-even point is the level of sales that covers all costs. The free cash flow available to all investors (FCFF) differs from what is left to shareholders after debt (FCFE).',
    },
    'term-sheet': {
      text: 'The preliminary agreement with an investor on the main terms: price and valuation, economic and control rights. It usually does not commit you to closing the deal but to negotiating in good faith; exclusivity, confidentiality and timing are made binding. You need a lawyer.',
    },
    'clausole-investimento': {
      term: 'Investment clauses',
      text: 'Liquidation preference (the investor gets their money back first: non-participating, participating or capped), anti-dilution (a weighted average is better than a full ratchet), lock-up, right of first offer, drag along and tag along, veto and information rights.',
    },
    vesting: {
      text: 'The shares of founders, employees and collaborators are earned over time: typically four years with a one-year cliff, then monthly. Anyone who leaves early loses the part not yet earned (reverse vesting). Investors ask for it to make sure the team stays; it does not apply to investors.',
      where: 'Team page, Equity split',
    },
    'pre-post-money': {
      term: 'Pre-money and post-money valuation',
      text: 'Pre-money is the value before the investment, post-money is pre-money plus the money invested. The investor’s share is the investment divided by post-money: 25,000 euros on a 100,000 pre-money gives 20%.',
    },
    'metodi-valutazione': {
      term: 'Valuation methods',
      text: 'Berkus (value from five risk factors), cost to duplicate, multiples of similar companies, scorecard (an industry average adjusted by factors), discounted cash flow, the venture capital method (exit value and expected return), First Chicago (a weighted average of three scenarios) and the risk factor summation.',
    },
    'work-for-equity': {
      term: 'Work for equity and participating financial instruments',
      text: 'Paying for work with shares instead of a salary, with tax advantages for innovative startups. Participating financial instruments give economic rights (not voting rights) in exchange for work or services, and become shares only if the articles of association allow it. You need an adviser.',
    },
    'stipendio-fondatore': {
      term: 'Founders’ salaries',
      text: 'Usually no salary until a suitable capital increase or enough revenue arrives; then modest amounts. The real reward, if it comes, is the exit.',
    },

    // 10. Legal matters
    costituzione: {
      term: 'Incorporating the company',
      text: 'Almost always an SRL, the Italian limited company: the minimum capital starts at 1 euro (below 10,000 euros it must all be paid in cash and part of the profits goes into a reserve). Since 2022, SRLs and simplified SRLs can be set up online with the notary on a video call; registration goes through the Comunicazione Unica to the Companies Register.',
    },
    'startup-innovativa': {
      term: 'Innovative startup',
      text: 'A status created by Decree Law 179/2012: a company limited by shares with an innovative purpose and at least one of three requirements (research and development spending of at least 15%; at least a third of the staff with PhDs, PhD students or researchers, or two thirds with a master’s degree; a patent or registered software). After Law 193/2024 you register within 5 years and the benefits last 3 years, extendable up to 5. Innovative SMEs need two out of three.',
    },
    'incentivi-investitori': {
      term: 'Incentives for investors',
      text: 'Anyone investing in the capital of an innovative startup gets a 30% tax incentive or, under the de minimis rules, a 65% deduction since 2025 (with a cap and the obligation to keep the investment for at least three years). Innovative startups are also exempt from stamp duties and chamber of commerce fees, and have simplified access to the Guarantee Fund.',
    },
    brevetto: {
      term: 'Patent',
      text: 'An exclusive right to an invention for 20 years (10 for a utility model), valid only in the countries where it is granted. The application becomes public 18 months after filing; filing online in Italy costs a few tens of euros in fees, but a patent written with an attorney costs thousands.',
      where: 'Deep tech sheet, the To protect field',
    },
    'novita-assoluta': {
      term: 'Patent before you publish',
      text: 'An invention is new only if it has never been made public, anywhere in the world: an article, a poster or a preprint by the team makes it no longer patentable. In Europe there is no grace period for your own publications, so file first.',
      where: 'Deep tech sheet, the Already published field',
    },
    'alternative-brevetto': {
      term: 'Trade secrets and registered software',
      text: 'Besides patents: keep the know-how confidential (with confidentiality agreements and controlled access), register the software (also useful for the innovative startup status) or publish on purpose to stop others from patenting. Software “as such” cannot be patented in Europe; an AI-based invention can be only if it has a technical character.',
    },
    demmler: {
      term: 'Splitting equity: the Demmler method',
      text: 'Weigh five elements from 0 to 10 (idea, business plan, industry experience, risk and commitment, responsibility), give each founder a score for each element and work out their share of the total. Avoid equal splits despite different contributions, big imbalances at the start and rewarding whoever had the idea but does not do the work.',
      where: 'Team page, Equity split',
    },

    // 11. Deep tech
    'deep-tech': {
      term: 'Deep tech startup',
      text: 'A startup built on a scientific or engineering advance: on top of the market risks it adds the risk that the technology does not work outside the lab. Longer timelines, more capital before revenue, valuable intellectual property, and customers that are often companies or institutions with long sales cycles.',
      where: 'The Deep tech sheet of each idea',
    },
    trl: {
      term: 'TRL scale',
      text: 'Technology Readiness Levels measure how mature a technology is, from 1 (basic principles observed) to 9 (system proven in real use). A paper with results on benchmark data usually sits between 3 and 4; grants and investors ask what level you are at and what the next milestone will be.',
      where: 'Deep tech sheet, TRL fields',
    },
    'due-rischi': {
      term: 'Two risks: technology and market',
      text: 'Write down the riskiest technical and market hypotheses and order the experiments by cost and risk, as on the Javelin board. Measure the value with the customer’s metrics (time, errors, euros), not with academic ones.',
    },
    'design-partner': {
      text: 'Three to five companies with the problem that agree to try the prototype on their data and give structured feedback. What counts are concrete commitments: letters of intent, access to data, a pilot even if only symbolically paid.',
      where: 'Deep tech sheet, Interviews with a Pilot commitment',
    },
    'spin-off': {
      term: 'University spin-off',
      text: 'A company born from research with professors or researchers taking part. Ministerial Decree 168/2011 requires approval by the university’s board of governors, after the academic senate has given its opinion, a project with a plan and rules on intellectual property, and bars people with certain university roles from management positions. Each university has its own rules.',
      where: 'Deep tech sheet, the Type of company field',
    },
    'invenzioni-universitarie': {
      term: 'Inventions made at university',
      text: 'Since 23 August 2023 (Law 102/2023) the rights to researchers’ inventions belong to the university, no longer to the inventor. Anyone founding a spin-off has to negotiate a licence or an assignment (exclusivity, field of use, royalties, future improvements), ideally before raising capital.',
    },
    'finanza-non-diluitiva': {
      term: 'Non-dilutive funding',
      text: 'Grants and soft loans to reduce the technical risk before giving away shares. Examples: Smart&Start Italia (zero interest on 80-90% of expenses, with a grant portion in Southern Italy), EIC Accelerator (grants up to 2.5 million plus equity, for TRL 6-8), EIC Transition (from TRL 3-4 to 5-6) and the fund set up by the Italian AI law through CDP Venture Capital.',
      where: 'Deep tech sheet, the Non-dilutive funding field',
    },
    'ai-act': {
      term: 'The AI Act and AI rules',
      text: 'The European AI regulation bans some uses, places obligations on general-purpose models and strict rules on high-risk systems (postponed to 2027-2028). Diagnostic software is generally a medical device; health data is a special category under the GDPR; assessing people’s creditworthiness is a high-risk use.',
      where: 'Deep tech sheet, the Rules to comply with field',
    },
    'primi-90-giorni': {
      term: 'First 90 days checklist',
      text: 'One use case and one segment; a map of what is published and what is new, checking with the technology transfer office; at least 20 interviews and 3 design partners; the next TRL milestone and its cost; a decision between spin-off and licence; one non-dilutive application; registered software and confidentiality agreements.',
    },
  },
};
