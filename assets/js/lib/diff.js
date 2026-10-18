const MAX_LCS_CELLS = 2_000_000;

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// '' , null, [] e {} valgono come "assente": così svuotare un campo non crea differenze fantasma.
export function normalize(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (Array.isArray(value)) {
    const items = value.map(normalize).filter((v) => v !== undefined);
    return items.length ? items : undefined;
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const v = normalize(value[key]);
      if (v !== undefined) out[key] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

export function deepEqual(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export function snapshotOf(item) {
  return {
    title: item?.title ?? '',
    status: item?.status ?? null,
    idea_id: item?.idea_id ?? null,
    data: item?.data ?? {},
  };
}

function isKeyedArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((el) => isPlainObject(el) && (typeof el.id === 'string' || typeof el.key === 'string'))
  );
}

const rowKey = (el) => (typeof el.id === 'string' ? el.id : el.key);

export function flatten(value, path = '', out = new Map()) {
  const v = normalize(value);
  if (v === undefined) return out;
  if (isPlainObject(v)) {
    for (const key of Object.keys(v)) flatten(v[key], path ? `${path}.${key}` : key, out);
    return out;
  }
  if (isKeyedArray(value)) {
    const rows = value.filter((el) => normalize(el) !== undefined);
    out.set(`${path}.#order`, rows.map(rowKey).join(','));
    for (const el of rows) {
      const { id, key, ...rest } = el;
      flatten(rest, `${path}#${rowKey(el)}`, out);
    }
    return out;
  }
  out.set(path, v);
  return out;
}

function lcsOps(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  const ops = a.slice(0, start).map((v) => ({ t: 'eq', v }));

  if (n * m > MAX_LCS_CELLS) {
    ops.push(...midA.map((v) => ({ t: 'del', v })), ...midB.map((v) => ({ t: 'add', v })));
  } else {
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push({ t: 'eq', v: midA[i] });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ t: 'del', v: midA[i] });
        i += 1;
      } else {
        ops.push({ t: 'add', v: midB[j] });
        j += 1;
      }
    }
    while (i < n) ops.push({ t: 'del', v: midA[i++] });
    while (j < m) ops.push({ t: 'add', v: midB[j++] });
  }

  ops.push(...a.slice(endA).map((v) => ({ t: 'eq', v })));
  return ops;
}

export function diffLines(before, after) {
  const a = before ? String(before).split('\n') : [];
  const b = after ? String(after).split('\n') : [];
  return lcsOps(a, b);
}

export function diffWords(before, after) {
  const tokenize = (s) => (s ? String(s).match(/\s+|[^\s]+/g) : []) || [];
  const ops = lcsOps(tokenize(before), tokenize(after));
  const merged = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.t === op.t) last.v += op.v;
    else merged.push({ ...op });
  }
  return merged;
}

export function lineStats(before, after) {
  let add = 0;
  let del = 0;
  for (const op of diffLines(before, after)) {
    if (op.t === 'add') add += 1;
    if (op.t === 'del') del += 1;
  }
  return { add, del };
}

export function valueKind(before, after) {
  const values = [before, after].filter((v) => v !== undefined);
  if (values.some(Array.isArray)) return 'set';
  if (values.every((v) => typeof v === 'string')) {
    return values.some((v) => v.includes('\n') || v.length > 140) ? 'text' : 'inline';
  }
  return 'value';
}

export function diffSnapshots(before, after) {
  const a = flatten(before || {});
  const b = flatten(after || {});
  const paths = [...new Set([...b.keys(), ...a.keys()])];
  const changes = [];
  for (const path of paths) {
    const va = a.get(path);
    const vb = b.get(path);
    if (JSON.stringify(va) === JSON.stringify(vb)) continue;
    let type = 'changed';
    if (va === undefined) type = 'added';
    else if (vb === undefined) type = 'removed';
    const change = { path, type, before: va, after: vb, kind: valueKind(va, vb) };
    if (change.kind === 'set') {
      const listA = Array.isArray(va) ? va : va === undefined ? [] : [va];
      const listB = Array.isArray(vb) ? vb : vb === undefined ? [] : [vb];
      const keyOf = (x) => JSON.stringify(x);
      const setA = new Set(listA.map(keyOf));
      const setB = new Set(listB.map(keyOf));
      change.addedItems = listB.filter((x) => !setA.has(keyOf(x)));
      change.removedItems = listA.filter((x) => !setB.has(keyOf(x)));
    }
    if (change.kind === 'text' || change.kind === 'inline') {
      change.stats = lineStats(va ?? '', vb ?? '');
    }
    changes.push(change);
  }
  return changes;
}

export function snapshotStats(changes) {
  return changes.reduce(
    (acc, c) => {
      if (c.stats) {
        acc.add += c.stats.add;
        acc.del += c.stats.del;
      } else {
        if (c.type !== 'removed') acc.add += 1;
        if (c.type !== 'added') acc.del += 1;
      }
      return acc;
    },
    { add: 0, del: 0 },
  );
}

export function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let target = obj;
  for (const key of keys.slice(0, -1)) {
    if (!isPlainObject(target[key])) target[key] = {};
    target = target[key];
  }
  const last = keys[keys.length - 1];
  if (value === undefined) delete target[last];
  else target[last] = value;
  return obj;
}

const copy = (v) => (v === undefined ? undefined : structuredClone(v));

function mergeValue(base, mine, theirs, path, conflicts) {
  if (deepEqual(mine, theirs)) return copy(mine);
  if (deepEqual(base, mine)) return copy(theirs);
  if (deepEqual(base, theirs)) return copy(mine);
  const objects = isPlainObject(mine) && isPlainObject(theirs) && (base === undefined || isPlainObject(base));
  if (objects) {
    const out = {};
    const keys = new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(base || {})]);
    for (const key of keys) {
      const merged = mergeValue(base?.[key], mine[key], theirs[key], path ? `${path}.${key}` : key, conflicts);
      if (merged !== undefined) out[key] = merged;
    }
    return out;
  }
  conflicts.push({ path, base: copy(base), mine: copy(mine), theirs: copy(theirs) });
  return copy(mine);
}

// Unione a tre vie come in git: le modifiche su campi diversi si sommano, quelle sullo stesso campo sono conflitti.
export function merge3(base, mine, theirs) {
  const conflicts = [];
  const value = mergeValue(base, mine, theirs, '', conflicts);
  return { value: value ?? {}, conflicts };
}

export function resolveConflicts(merged, conflicts, choices) {
  const out = structuredClone(merged);
  conflicts.forEach((conflict, index) => {
    const pick = choices[index] === 'theirs' ? conflict.theirs : conflict.mine;
    setPath(out, conflict.path, copy(pick));
  });
  return out;
}

// Per ogni campo, la revisione che l'ha cambiato per ultima (come git blame).
export function blame(revisions) {
  const sorted = [...revisions].sort((a, b) => a.version - b.version);
  const result = new Map();
  let previous = new Map();
  for (const rev of sorted) {
    const current = flatten(snapshotOf(rev));
    for (const [path, value] of current) {
      if (!previous.has(path) || JSON.stringify(previous.get(path)) !== JSON.stringify(value)) {
        result.set(path, rev);
      }
    }
    for (const path of [...result.keys()]) {
      if (!current.has(path)) result.delete(path);
    }
    previous = current;
  }
  return result;
}
