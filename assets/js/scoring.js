// Calcolo della classifica: media dei voti per criterio, pesata con i pesi dei criteri.

export const DISAGREEMENT_SPREAD = 2;

export function criterionStats(votes) {
  const values = votes.filter((v) => Number.isInteger(v));
  if (!values.length) return { count: 0, mean: null, min: null, max: null, spread: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { count: values.length, mean: sum / values.length, min, max, spread: max - min };
}

export function ideaScore(ideaId, criteria, scoreItems) {
  const perCriterion = {};
  let weighted = 0;
  let weightSum = 0;
  let disagreements = 0;
  const voters = new Set();

  for (const criterion of criteria) {
    const votes = [];
    const byMember = [];
    for (const item of scoreItems) {
      const value = item.data?.scores?.[ideaId]?.[criterion.key];
      if (Number.isInteger(value)) {
        votes.push(value);
        byMember.push({ memberId: item.created_by, value });
        voters.add(item.created_by);
      }
    }
    const stats = criterionStats(votes);
    perCriterion[criterion.key] = { ...stats, byMember, disagreement: stats.spread >= DISAGREEMENT_SPREAD };
    if (stats.spread >= DISAGREEMENT_SPREAD) disagreements += 1;
    if (stats.mean !== null && criterion.weight > 0) {
      weighted += stats.mean * criterion.weight;
      weightSum += criterion.weight;
    }
  }

  const average = weightSum ? weighted / weightSum : null;
  const votedCriteria = criteria.filter((c) => perCriterion[c.key].count > 0).length;
  return {
    ideaId,
    average,
    score: average === null ? null : Math.round(((average - 1) / 4) * 100),
    coverage: criteria.length ? votedCriteria / criteria.length : 0,
    voters: [...voters],
    disagreements,
    perCriterion,
  };
}

export function ranking(ideas, criteria, scoreItems) {
  return ideas
    .map((idea) => ({ idea, ...ideaScore(idea.id, criteria, scoreItems) }))
    .sort((a, b) => {
      if (a.score === null && b.score === null) return a.idea.title.localeCompare(b.idea.title, 'it');
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score || a.idea.title.localeCompare(b.idea.title, 'it');
    });
}
