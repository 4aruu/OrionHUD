// The five MCP tools. Kept few and terse on purpose: every tool definition
// costs context tokens in every agent session.

import type { BridgeMethod } from "../../src/shared/bridgeProtocol";
import { LIMITS } from "../../src/shared/validators";

export interface ToolDef {
  name: BridgeMethod;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
}

const id = { type: "string", maxLength: 100, pattern: "^[A-Za-z0-9_-]+$" };
const none = { type: "object", properties: {}, additionalProperties: false };
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const TOOLS: ToolDef[] = [
  {
    name: "get_current_task",
    title: "Get current task",
    description:
      "Handoff brief (Markdown) for the task the user is working on in Orion Waypoint: path, milestone, progress, next step, decisions, open subtasks, links. Call this first.",
    inputSchema: none,
    annotations: readOnly,
  },
  {
    name: "list_open_subtasks",
    title: "List open subtasks",
    description: "Open subtasks of the current task, nested, with the ids that add_subtask and complete_task take.",
    inputSchema: none,
    annotations: readOnly,
  },
  {
    name: "add_subtask",
    title: "Add subtask",
    description: "Add a subtask under the current task, or under one of its subtasks via parent_id.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string", minLength: 1, maxLength: LIMITS.taskTitle }, parent_id: id },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: write,
  },
  {
    name: "complete_task",
    title: "Complete task",
    description: "Mark a subtask (or the current task) done. Fails while it still has open subtasks.",
    inputSchema: { type: "object", properties: { task_id: id }, required: ["task_id"], additionalProperties: false },
    annotations: { ...write, idempotentHint: true },
  },
  {
    name: "log_decision",
    title: "Log decision",
    description: "Record a decision on the current task (or a subtask via task_id). Append-only; the user sees it under Decisions.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", minLength: 1, maxLength: LIMITS.noteContent }, task_id: id },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: write,
  },
];
