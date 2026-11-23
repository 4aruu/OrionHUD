// Paste-an-outline: indented text (or a Markdown checklist an AI gave you)
// becomes a nested task tree. Pure, no storage.

import { LIMITS } from "./validators";

export interface OutlineItem {
  title: string;
  children: OutlineItem[];
}

const BULLET = /^(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|\[[ xX]\]\s+)/;

function indentWidth(line: string): number {
  let w = 0;
  for (const ch of line) {
    if (ch === " ") w += 1;
    else if (ch === "\t") w += 4;
    else break;
  }
  return w;
}

/**
 * Parses lines into a tree. Indentation is relative (any consistent width
 * works). Markdown headings start a new top-level item. Depth is capped at
 * maxDepth levels (deeper lines attach at the deepest allowed level).
 */
export function parseOutline(text: string, maxDepth: number = LIMITS.maxDepth): OutlineItem[] {
  const roots: OutlineItem[] = [];
  // Stack of [indent, item]; stack[0] is the deepest open ancestor chain.
  const stack: { indent: number; item: OutlineItem }[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const isHeading = /^\s*#{1,6}\s+/.test(rawLine);
    // Headings sit "above" column 0 so the list under them nests inside.
    const indent = isHeading ? -1 : indentWidth(rawLine);
    const title = rawLine
      .trim()
      .replace(/^#{1,6}\s+/, "")
      .replace(BULLET, "")
      .trim()
      .slice(0, LIMITS.taskTitle);
    if (!title) continue;

    const item: OutlineItem = { title, children: [] };
    if (isHeading) stack.length = 0;
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop();
    if (stack.length >= maxDepth) stack.length = maxDepth - 1;

    const parent = stack[stack.length - 1];
    if (parent) parent.item.children.push(item);
    else roots.push(item);
    stack.push({ indent, item });
  }
  return roots;
}

export function countOutline(items: OutlineItem[]): number {
  return items.reduce((n, i) => n + 1 + countOutline(i.children), 0);
}

export function outlineHeight(items: OutlineItem[]): number {
  return items.reduce((h, i) => Math.max(h, 1 + outlineHeight(i.children)), 0);
}
