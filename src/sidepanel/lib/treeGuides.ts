// Plan tree "branches": the hairline connectors that tie each subtask to its
// parent (a rounded └ into every subtask, a line down from every open parent).
// Pure geometry from the depths of the rows on screen, so collapsed parents and
// hidden finished tasks never leave a line pointing at nothing.

/** Extra left padding per level. */
export const TREE_INDENT = 20;
const TREE_BASE = 8;
/** Half the chevron column: a parent's line runs under its caret. */
const CHEVRON_HALF = 8;

/** Left padding of a row at `depth` (top level = 1). */
export function rowIndent(depth: number): number {
  return TREE_BASE + (depth - 1) * TREE_INDENT;
}

/** X of the line that joins the children of a row at `depth`: under its caret. */
export function guideX(depth: number): number {
  return rowIndent(depth) + CHEVRON_HALF;
}

/** Width of the └ into a row at `depth`: up to its caret, or on to the checkbox when it has no caret. */
export function elbowWidth(depth: number, hasCaret: boolean): number {
  return rowIndent(depth) - guideX(depth - 1) + (hasCaret ? 3 : 20);
}

export interface RowGuides {
  /** Depths of ancestors whose line runs straight past this row (to a later child of theirs). */
  rails: number[];
  /** The └ from the parent's line into this row (every subtask). */
  elbow: boolean;
  /** The parent's line carries on below this row to a later sibling. */
  more: boolean;
  /** This row's own children follow right below it: start its line under the caret. */
  stem: boolean;
}

/** Connectors for each row, given the depths of the visible rows in order. */
export function treeGuides(depths: readonly number[]): RowGuides[] {
  const n = depths.length;

  // hasNext[i]: a later row sits at the same depth before the tree climbs above it.
  const hasNext = new Array<boolean>(n).fill(false);
  const seen: boolean[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = depths[i]!;
    hasNext[i] = seen[d] === true;
    seen[d] = true;
    seen.length = d + 1; // anything deeper belonged to this row's subtree
  }

  const out: RowGuides[] = [];
  const lastAt: number[] = []; // most recent row index at each depth, scanning forward
  for (let i = 0; i < n; i++) {
    const d = depths[i]!;
    lastAt[d] = i;
    lastAt.length = d + 1;
    const rails: number[] = [];
    // The line under an ancestor at depth k reaches its children at k + 1. It runs past
    // this row when this row's ancestor at k + 1 still has a sibling further down.
    for (let k = 1; k <= d - 2; k++) {
      const a = lastAt[k + 1];
      if (a !== undefined && hasNext[a]) rails.push(k);
    }
    out.push({
      rails,
      elbow: d >= 2,
      more: d >= 2 && hasNext[i]!,
      stem: i + 1 < n && depths[i + 1]! > d,
    });
  }
  return out;
}
