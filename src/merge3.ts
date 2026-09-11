/* ── Three-way line merge ──
   Used when better rule pages ship and the user has edited their copy. We know three versions: what we delivered
   (base), what they have now (theirs), and what we want to give them (ours). Regions only one side changed can be
   taken without asking; regions both sides changed differently are a conflict.

   Conflict markers are deliberately never produced. The result of a merge is a page an agent reads as instructions,
   and `<<<<<<<` in that page would be read as part of the rules. A conflict means "do not merge", not "merge messily". */

/** Longest common subsequence over lines, as pairs of indices into a and b. */
function lcs(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/** Lines of `side` that correspond to base[from, to): the slice between the surrounding anchors. */
function sliceFor(anchors: Map<number, number>, side: string[], from: number, to: number, prevAnchor: number, nextAnchor: number): string[] {
  const start = prevAnchor >= 0 ? (anchors.get(prevAnchor) ?? -1) + 1 : 0;
  const end = nextAnchor >= 0 ? (anchors.get(nextAnchor) ?? side.length) : side.length;
  void from; void to;
  return side.slice(start, Math.max(start, end));
}

export interface MergeResult { clean: boolean; text: string | null; conflicts: number }

/**
 * Merge `theirs` and `ours`, both derived from `base`.
 * Returns the merged text when every differing region was changed by only one side, otherwise reports a conflict and
 * no text. Identical changes on both sides are not a conflict.
 */
export function merge3(base: string, theirs: string, ours: string): MergeResult {
  if (theirs === ours) return { clean: true, text: ours, conflicts: 0 };
  if (base === theirs) return { clean: true, text: ours, conflicts: 0 };   // they never changed anything
  if (base === ours) return { clean: true, text: theirs, conflicts: 0 };   // we shipped nothing new

  const B = base.split('\n'), T = theirs.split('\n'), O = ours.split('\n');
  const tAnchors = new Map(lcs(B, T));           // base line → theirs line
  const oAnchors = new Map(lcs(B, O));           // base line → ours line
  // Only base lines both sides kept can anchor a region.
  const anchors = [...tAnchors.keys()].filter(i => oAnchors.has(i)).sort((a, b) => a - b);

  const out: string[] = [];
  let conflicts = 0;
  let prev = -1;
  for (const anchor of [...anchors, -2]) {        // -2 marks the tail region
    const next = anchor === -2 ? -1 : anchor;
    const bSeg = B.slice(prev + 1, next === -1 ? B.length : next);
    const tSeg = sliceFor(tAnchors, T, prev + 1, next, prev, next);
    const oSeg = sliceFor(oAnchors, O, prev + 1, next, prev, next);
    const tChanged = tSeg.join('\n') !== bSeg.join('\n');
    const oChanged = oSeg.join('\n') !== bSeg.join('\n');

    if (!tChanged && !oChanged) out.push(...bSeg);
    else if (tChanged && !oChanged) out.push(...tSeg);
    else if (!tChanged && oChanged) out.push(...oSeg);
    else if (tSeg.join('\n') === oSeg.join('\n')) out.push(...tSeg);       // same edit on both sides
    else conflicts++;

    if (next !== -1) out.push(B[next]);
    prev = next;
  }
  return conflicts ? { clean: false, text: null, conflicts } : { clean: true, text: out.join('\n'), conflicts: 0 };
}
