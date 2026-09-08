/* Line diff for the version-compare view. LCS over lines (O(n·m) memory, fine for wiki pages; pages over 3,000 lines
   fall back to a plain "changed" view so the browser never stalls). */
export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n'), b = newText.split('\n');
  if (a.length * b.length > 9_000_000) return [...a.map(text => ({ kind: 'del' as const, text })), ...b.map(text => ({ kind: 'add' as const, text }))];
  // Trim the common prefix/suffix first: most edits touch a small region
  let start = 0; while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length; while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const A = a.slice(start, endA), B = b.slice(start, endB);
  const n = A.length, m = B.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = a.slice(0, start).map(text => ({ kind: 'same', text }));
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ kind: 'same', text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: A[i] }); i++; }
    else { out.push({ kind: 'add', text: B[j] }); j++; }
  }
  while (i < n) out.push({ kind: 'del', text: A[i++] });
  while (j < m) out.push({ kind: 'add', text: B[j++] });
  for (const text of a.slice(endA)) out.push({ kind: 'same', text });
  return out;
}

/** Collapse long unchanged runs to `context` lines on each side; returns null entries where lines were skipped. */
export function withContext(lines: DiffLine[], context = 3): (DiffLine | { kind: 'skip'; count: number })[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => { if (l.kind !== 'same') for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true; });
  const out: (DiffLine | { kind: 'skip'; count: number })[] = [];
  let skipped = 0;
  lines.forEach((l, i) => { if (keep[i]) { if (skipped) { out.push({ kind: 'skip', count: skipped }); skipped = 0; } out.push(l); } else skipped++; });
  if (skipped) out.push({ kind: 'skip', count: skipped });
  return out;
}
