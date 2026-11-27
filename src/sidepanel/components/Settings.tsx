import { useEffect, useRef, useState } from "react";
import type { IWorkflowState } from "../../shared/types";
import { deleteWorkflowCascade, exportBackup } from "../../shared/workflowActions";
import { WELCOME_PAGE } from "../../shared/pages";
import { openShortcutSettings } from "../../platform/commands";
import { importBackupFile } from "../lib/backup";
import { hasTabsPermission, requestTabsPermission, TABS_PERMISSION } from "../../platform/tabs";
import { backupFileName, countLabel } from "../lib/format";
import type { Ui } from "../lib/ui";
import { BrandName } from "./BrandName";
import { BridgeSettings } from "./BridgeSettings";
import { ConfirmDialog } from "./ConfirmDialog";
import { BusyButton } from "./Buttons";
import { useBusy } from "../hooks/useBusy";
import { walk } from "../../shared/taskTree";
import { applyTheme, readThemePref, writeThemePref, type ThemePref } from "../../shared/theme";

const THEME_CHOICES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function taskCount(w: IWorkflowState): number {
  let n = 0;
  walk(w.rootNodes, () => n++);
  return n;
}

interface Props {
  workflows: IWorkflowState[];
  ui: Ui;
  onBack: () => void;
}

export function Settings({ workflows, ui, onBack }: Props) {
  const [tabsOn, setTabsOn] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<ThemePref>("system");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, runExport] = useBusy();
  const [importing, runImport] = useBusy();
  const pendingDelete = workflows.find((w) => w.id === confirmDelete) ?? null;

  useEffect(() => {
    void hasTabsPermission().then(setTabsOn);
    void readThemePref().then(setTheme);
  }, []);

  function chooseTheme(pref: ThemePref) {
    const previous = theme;
    setTheme(pref);
    applyTheme(pref);
    writeThemePref(pref).catch(() => {
      setTheme(previous);
      applyTheme(previous);
      ui.toast({ kind: "error", text: "Couldn't save your appearance choice. Try again." });
    });
  }

  function toggleTabs() {
    if (tabsOn) {
      void chrome.permissions.remove(TABS_PERMISSION).then(() => setTabsOn(false));
      return;
    }
    // Called directly in the click handler: Chrome requires a user gesture.
    void requestTabsPermission().then((granted) => {
      setTabsOn(granted);
      ui.toast(granted ? { kind: "info", text: "Tab memory is on." } : { kind: "info", text: "No problem. Save points will keep just the next step." });
    });
  }

  async function doExport() {
    const json = await ui.run(() => exportBackup());
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName(new Date());
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function doImport(file: File) {
    const r = await ui.run(() => importBackupFile(file));
    if (r) ui.toast({ kind: "info", text: `Imported ${countLabel(r.imported, "workflow")}.` });
  }

  function showWelcome() {
    chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) }).catch(() => {
      ui.toast({ kind: "error", text: "Couldn't open the welcome tab. Try again." });
    });
  }

  return (
    <div className="settings">
      <header className="wf-head">
        <button className="icon-btn" aria-label="Back" data-tip="Back" data-tip-align="start" onClick={onBack}>
          ←
        </button>
        <div className="wf-title">
          <h2>Settings</h2>
        </div>
      </header>

      <fieldset className="card">
        <legend className="card-legend">Appearance</legend>
        <div className="row-buttons">
          {THEME_CHOICES.map((c) => (
            <label key={c.value} className={`btn btn-ghost btn-sm radio-chip ${theme === c.value ? "btn-on" : ""}`}>
              <input type="radio" name="appearance" value={c.value} checked={theme === c.value} onChange={() => chooseTheme(c.value)} />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <section className="card">
        <h3>Tab memory</h3>
        <p className="muted">
          Save points remember the tabs and AI threads you had open for each task, so “Reopen tabs” brings them all back. Also powers the distraction guard.
          Your browser will describe this as “Read your browsing history”. Tab addresses stay on this computer, never uploaded.
        </p>
        <button className={`btn ${tabsOn ? "btn-ghost" : "btn-primary"}`} onClick={toggleTabs} disabled={tabsOn === null}>
          {tabsOn ? "Turn off tab memory" : "Turn on tab memory"}
        </button>
      </section>

      <BridgeSettings ui={ui} />

      <section className="card">
        <h3>Shortcuts</h3>
        <ul className="plain">
          <li>
            <kbd>Alt+Shift+S</kbd> save point from any page
          </li>
          <li>
            <kbd>Alt+Shift+Q</kbd> capture a side quest
          </li>
          <li>
            <kbd>Alt+Shift+O</kbd> open <BrandName /> in its own window
          </li>
          <li>Right-click selected text → <BrandName /> › Pin as a decision</li>
        </ul>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => openShortcutSettings().catch(() => ui.toast({ kind: "error", text: "Couldn't open the shortcuts page. Try again." }))}
        >
          Change shortcuts
        </button>
      </section>

      <section className="card">
        <h3>Backup</h3>
        <p className="muted">
          Everything lives in this browser. Export a backup before reinstalling or switching machines. The file contains your tasks, notes and saved tab
          addresses in plain text, so store it like any other private document.
        </p>
        <div className="row-buttons">
          <BusyButton className="btn btn-ghost btn-sm" busy={exporting} onClick={() => void runExport(doExport)}>
            Export backup
          </BusyButton>
          <BusyButton className="btn btn-ghost btn-sm" busy={importing} onClick={() => fileRef.current?.click()}>
            Import backup
          </BusyButton>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void runImport(() => doImport(f));
            }}
          />
        </div>
      </section>

      {workflows.length > 0 && (
        <section className="card">
          <h3>Delete a workflow</h3>
          <ul className="plain">
            {workflows.map((w) => (
              <li key={w.id} className="delete-row">
                <span>{w.name}</span>
                <button className="btn btn-ghost btn-sm" aria-label={`Delete ${w.name}`} onClick={() => setConfirmDelete(w.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete workflow “${pendingDelete.name}”?`}
          confirmLabel="Delete workflow"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            setConfirmDelete(null);
            void ui.run(() => deleteWorkflowCascade(pendingDelete.id), `Deleted “${pendingDelete.name}”.`);
          }}
        >
          <p>
            Its {countLabel(taskCount(pendingDelete), "task")}, notes, decisions and save points are removed from this browser. This can't be undone; export a
            backup first if you might need them.
          </p>
        </ConfirmDialog>
      )}

      <p className="muted small pad">
        <BrandName /> {chrome.runtime.getManifest().version} · local-only · no accounts, no tracking ·{" "}
        <button className="link-btn" onClick={showWelcome}>
          Show welcome again
        </button>
      </p>
    </div>
  );
}
