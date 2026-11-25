# OrionHUD privacy policy

Last updated: 2026-11-23

OrionHUD is a browser extension that stores your work plan and save points so you can resume interrupted work.

## What it stores

- Workflows, tasks, notes, decisions and inbox items you create.
- Save points: a next step you type, the time, and, only if you turn on **tab memory**, the addresses (URLs) and titles of tabs in your current window when the save point is made.
- For text you pin from a page (right-click → Pin as decision / Send to inbox): the selected text and that page's address.

## Where it goes

Nowhere. Everything is stored locally in your browser's extension storage (IndexedDB) on your computer. OrionHUD makes no network requests: no servers, no accounts, no analytics, no third-party code, no remote fonts. Nothing is sold or shared.

Data leaves your computer only when **you** do it: copying a handoff brief to your clipboard, exporting a backup file, or connecting a coding agent through the optional agent bridge.

## Permissions

- **Tab memory (`tabs`, optional):** off by default. When you turn it on, Chrome describes it as "Read your browsing history". OrionHUD only reads tab URLs and titles at the moment a save point or distraction check happens, and only stores them inside your save points. You can turn it off at any time in Settings.
- **Agent bridge (`nativeMessaging`, optional):** off by default. When you turn it on and install the bridge helper, coding agents you configure on this computer (such as Claude Code or Cursor) can read the handoff brief of the task you're working on, see its open subtasks, add and complete its subtasks, and log decisions. The connection is a local socket on your computer, protected by a random token; OrionHUD itself still makes no network requests. Whatever an agent reads is then handled by that agent and its AI provider under their own policies, just like a brief you paste yourself. Turn it off in Settings at any time.
- The extension never injects scripts into pages on its own. The capture box appears only on the tab where you press its shortcut.

## Deleting your data

Delete a workflow in Settings, or remove the extension (Chrome deletes its storage).

## Contact

Open an issue in the project's repository.
