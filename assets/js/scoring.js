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

// Classifica di una fotografia: si ricalcola dai voti salvati, con i criteri e i pesi di quel momento.
export function photoRanking(photo, keep = () => true) {
  const items = Object.entries(photo?.votes || {}).map(([memberId, scores]) => ({ created_by: memberId, data: { scores } }));
  return ranking((photo?.ideas || []).filter(keep), photo?.criteria || [], items);
}

function placings(photo, keep) {
  const out = new Map();
  let position = 0;
  for (const r of photoRanking(photo, keep)) {
    if (r.score === null) continue;
    position += 1;
    out.set(r.idea.id, { rank: position, score: r.score, title: r.idea.title, perCriterion: r.perCriterion });
  }
  return out;
}

function criteriaChanges(before, after) {
  const old = new Map((before?.criteria || []).map((c) => [c.key, c]));
  const now = new Map((after?.criteria || []).map((c) => [c.key, c]));
  const out = [];
  for (const c of now.values()) {
    const o = old.get(c.key);
    if (!o) out.push({ key: c.key, label: c.label, change: 'added', to: c.weight });
    else if (o.weight !== c.weight) out.push({ key: c.key, label: c.label, change: 'weight', from: o.weight, to: c.weight });
    else if (o.label !== c.label) out.push({ key: c.key, label: c.label, change: 'renamed', from: o.label });
  }
  for (const o of old.values()) if (!now.has(o.key)) out.push({ key: o.key, label: o.label, change: 'removed', from: o.weight });
  return out;
}

function voteChanges(before, after) {
  const members = new Set([...Object.keys(before?.votes || {}), ...Object.keys(after?.votes || {})]);
  const out = [];
  for (const memberId of members) {
    const x = before?.votes?.[memberId] || {};
    const y = after?.votes?.[memberId] || {};
    const counts = { changed: 0, added: 0, removed: 0 };
    for (const ideaId of new Set([...Object.keys(x), ...Object.keys(y)])) {
      for (const key of new Set([...Object.keys(x[ideaId] || {}), ...Object.keys(y[ideaId] || {})])) {
        const a = x[ideaId]?.[key];
        const b = y[ideaId]?.[key];
        if (a === undefined) counts.added += 1;
        else if (b === undefined) counts.removed += 1;
        else if (a !== b) counts.changed += 1;
      }
    }
    if (counts.changed || counts.added || counts.removed) {
      out.push({ memberId, name: after?.names?.[memberId] || before?.names?.[memberId] || null, ...counts });
    }
  }
  return out;
}

// Confronto tra due fotografie, o tra una fotografia e la situazione attuale: posizioni, punteggi, criteri e voti cambiati.
export function comparePhotos(before, after, keep = () => true) {
  const a = placings(before, keep);
  const b = placings(after, keep);
  const labels = new Map([...(before?.criteria || []), ...(after?.criteria || [])].map((c) => [c.key, c.label]));
  const rows = [...new Set([...b.keys(), ...a.keys()])].map((ideaId) => {
    const x = a.get(ideaId) || null;
    const y = b.get(ideaId) || null;
    const means = [];
    if (x && y) {
      for (const [key, label] of labels) {
        const from = x.perCriterion[key]?.mean ?? null;
        const to = y.perCriterion[key]?.mean ?? null;
        if (from === null && to === null) continue;
        if (from === null || to === null || Math.abs(to - from) >= 0.05) means.push({ key, label, from, to });
      }
    }
    return {
      ideaId,
      title: y?.title || x?.title,
      before: x && { rank: x.rank, score: x.score },
      after: y && { rank: y.rank, score: y.score },
      delta: x && y ? y.score - x.score : null,
      move: x && y ? x.rank - y.rank : null,
      means,
    };
  });
  const order = (r) => [r.after?.rank ?? Infinity, r.before?.rank ?? Infinity];
  rows.sort((p, q) => {
    const [pa, pb] = order(p);
    const [qa, qb] = order(q);
    return pa !== qa ? pa - qa : pb - qb;
  });
  return { rows, criteria: criteriaChanges(before, after), voters: voteChanges(before, after) };
}
