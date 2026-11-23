# Competitive landscape: dev context-resume in the AI era

Date: 2026-11-23 · Scope: browser extensions, AI-memory plugins, MCP
connectors and dev tools that help someone resume interrupted work.
Shelf life: short. Platform vendors ship monthly.

## The competitive set

| Category | Examples | What they do well | What they miss |
|---|---|---|---|
| Tab/session managers | Workona, Toby (AI tab grouping), OneTab, Session Buddy | Restore tab sets per project; Workona users praise fast context switching | No tasks, subtasks, next step or AI threads. They store *where you were*, not *what you were doing*. Workona's free tier is capped. |
| AI-chat memory extensions | OpenMemory (Mem0), MemoryPlugin, LocalBrain | Carry facts about *you* across ChatGPT/Claude/Gemini | Memory is flat facts, not project structure. No milestones, no "where was I". OpenMemory sends messages to the Mem0 API; MemoryPlugin needs an account. Agents can't see it. |
| Agent memory MCP servers | Pieces LTM (`ask_pieces_ltm`), Engram, Memorix, Cognee, total-agent-memory (74 tools) | Persistent project memory for Claude Code/Cursor/Copilot, often local | Agent-facing only, no human view of milestones. Blind to the browser (chats, docs, PRs). Depends on the model *choosing* to call the tool (Cursor forum caveat). |
| Agent task managers | Task Master AI (~24k stars), Agentic Tools MCP | Task trees with subtasks (`1.1`, `1.2`) that agents expand | Repo/CLI only, no interruption awareness, no human resume UX. Heavy: 36 tools, ~21k tokens loaded by default. |
| "Where was I" dev tools | where-was-i (Copilot plugin), DevContext, Dev Checkpoint, JustForContext | Rebuild state from git, editor, terminal | Blind to the browser and AI chats. No task hierarchy. Mostly manual "save". |
| Platform-native | Claude in Chrome → Cowork (cross-device sessions, connectors), ChatGPT Chrome extension (tab control/grouping; Atlas shut down Aug 2026), ChatGPT memory, Claude Projects | Deep integration, huge distribution | Vendor-locked: Claude doesn't know about your ChatGPT thread or your Cursor agent. Organized around chats, not your plan. |
| Team trackers with MCP | Linear, Jira, ClickUp, Notion, Asana | Team-level tickets, agents can read them | Too coarse for "sub-subtask I was mid-way through". Not interruption-aware. Public to the team, so personal scratch work doesn't belong there. |

## Gaps nobody fills

1. **Nobody joins the three places context lives:** the browser (tabs, AI chats, docs), agents (terminal/IDE), and the person's plan (milestones → subtasks → next step). Each tool sees one.
2. **Memory is facts or history, not intent.** No one stores "what I was about to do next" as a first-class field, and that is exactly what resuming needs.
3. **Human-facing and agent-facing are split.** MCP memories have no UI. Chat-memory extensions have no agent access. No single structure that both you and your agents read and write.
4. **Capture depends on remembering to save,** and an interruption is precisely when you forget. Almost nothing captures on idle or task switch.
5. **Vendor lock.** Most devs use several AIs. Native features stop at the vendor's wall.
6. **Pull, not push.** MCP memory only helps if the model asks. A handoff brief that travels *with* the task is pushed.
7. **Privacy.** Several send content to a cloud. Chrome's on-device Summarizer API (stable since Chrome 138; needs ~16 GB RAM or >4 GB VRAM) makes local summaries possible, and almost no one uses it.
8. **Summary rot.** Repeatedly rewritten summaries degrade (ACE, ICLR 2026). Itemized, append-only decision logs hold up better.

## Threats

- **Anthropic Cowork in Chrome** already has sessions that follow you across devices, plus connectors. A "tasks" feature there would cover much of this for Claude-only users.
- **OpenAI's Chrome extension** groups tabs and drives them. It could add project memory.
- **Pieces** is closest in spirit (local, cross-app, MCP) but is memory-first, not plan-first.

Defense: be vendor-neutral, local-first and plan-structured. Platforms are unlikely to give up any of those three.

## Positioning

> For developers who build with several AIs and agents, OrionHUD is the
> resume layer: your milestones and nested subtasks, the tabs and AI threads
> behind each one, and a handoff brief any AI or agent can pick up. It is
> captured automatically when you get interrupted, and it stays on your
> machine. Unlike chat-memory plugins it remembers your *plan*, not trivia
> about you. Unlike agent memory servers, you can see it and steer it.

## Sources

- Pieces: https://realpython.com/ref/ai-coding-tools/pieces-for-developers/
- OpenMemory: https://mem0.ai/blog/introducing-the-openmemory-chrome-extension , https://github.com/mem0ai/mem0-chrome-extension
- MemoryPlugin / LocalBrain: https://chromewebstore.google.com/detail/localbrain-ai-memory-sync/cpnladiiocfdhcflkdfjlapgeackgjlc
- Task Master: https://www.augmentcode.com/mcp/taskmaster-mcp-server , https://regis-rcr.github.io/claude-framework-research/frameworks/claude-task-master.html
- Agent memory MCPs: https://github.com/AVIDS2/memorix , https://github.com/keggan-std/Engram , https://www.cognee.ai/memory-agent-for-ai-coding-tools , https://forum.cursor.com/t/how-are-people-handling-context-across-different-ai-coding-tools/159891
- Workona / Toby: https://clickup.com/blog/workona-alternatives/ , https://toolradar.com/compare/toby-vs-workona
- Platforms: https://claude.com/blog/cowork-chrome-side-panel , https://unite.ai/openai-brings-computer-use-to-chrome-with-chatgpt-tab-controls , https://ud.hk/en/blogs/insight/article/browser-agent-after-atlas-2026-08-31
- Where-was-I tools: https://awesome-copilot.github.com/plugin/where-was-i/ , https://www.producthunt.com/p/dev-checkpoint , https://www.microsoft.com/en-us/research/publication/evaluating-cues-for-resuming-interrupted-programming-tasks/
- Context loss: https://www.martinfowler.com/articles/reduce-friction-ai/context-anchoring.html , https://www.oreilly.com/radar/why-doesnt-anyone-teach-developers-about-context-management/
- Chrome built-in AI: https://developer.chrome.com/docs/ai/summarizer-api , https://developer.chrome.com/docs/ai/built-in-apis
