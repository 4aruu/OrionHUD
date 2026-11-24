# Orion Waypoint privacy policy

Last updated: 2026-11-24

Orion Waypoint is a browser extension that stores your work plan and save points so you can resume interrupted work.

## What it stores

- Workflows, tasks, notes, decisions and inbox items you create.
- Save points: a next step you type, the time, and, only if you turn on **tab memory**, the addresses (URLs) and titles of tabs in your current window when the save point is made.
- For text you pin from a page (right-click → Pin as decision / Send to inbox): the selected text and that page's address.

## Where it goes

Nowhere. Everything is stored locally in your browser's extension storage (IndexedDB) on your computer. Orion Waypoint makes no network requests: no servers, no accounts, no analytics, no third-party code, no remote fonts. Nothing is sold or shared.

Data leaves your computer only when **you** do it: copying a handoff brief to your clipboard, or exporting a backup file.

## Permissions

- **Tab memory (`tabs`, optional):** off by default. When you turn it on, Chrome describes it as "Read your browsing history". Orion Waypoint only reads tab URLs and titles at the moment a save point or distraction check happens, and only stores them inside your save points. You can turn it off at any time in Settings.
- The extension never injects scripts into pages on its own. The capture box appears only on the tab where you press its shortcut.

## Deleting your data

Delete a workflow in Settings, or remove the extension (Chrome deletes its storage).

## Contact

Open an issue in the project's repository.
