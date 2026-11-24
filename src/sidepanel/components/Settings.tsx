import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "../../shared/brand";
import type { IWorkflowState } from "../../shared/types";
import { deleteWorkflowCascade, exportBackup, importBackup } from "../../shared/workflowActions";
import { hasTabsPermission, requestTabsPermission, TABS_PERMISSION } from "../../platform/tabs";
import type { Ui } from "../lib/ui";

interface Props {
  workflows: IWorkflowState[];
  ui: Ui;
  onBack: () => void;
}

export function Settings({ workflows, ui, onBack }: Props) {
  const [tabsOn, setTabsOn] = useState<boolean | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void hasTabsPermission().then(setTabsOn);
  }, []);

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
    a.download = `orionhud-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function doImport(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      ui.toast({ kind: "error", text: "Backup file is larger than 5 MB." });
      return;
    }
    const text = await file.text();
    const r = await ui.run(() => importBackup(text));
    if (r) ui.toast({ kind: "info", text: `Imported ${r.imported} workflow${r.imported === 1 ? "" : "s"}.` });
  }

  return (
    <div className="settings">
      <header className="wf-head">
        <button className="icon-btn" aria-label="Back" onClick={onBack}>
          ←
        </button>
        <div className="wf-title">
          <h2>Settings</h2>
        </div>
      </header>

      <section className="card">
        <h3>Tab memory</h3>
        <p className="muted">
          Save points remember the tabs and AI threads you had open for each task, so “Reopen tabs” brings them all back. Also powers the distraction guard.
          Chrome will describe this as “Read your browsing history”. Tab addresses stay on this computer, never uploaded.
        </p>
        <button className={`btn ${tabsOn ? "btn-ghost" : "btn-primary"}`} onClick={toggleTabs} disabled={tabsOn === null}>
          {tabsOn ? "Turn off tab memory" : "Turn on tab memory"}
        </button>
      </section>

      <section className="card">
        <h3>Shortcuts</h3>
        <ul className="plain">
          <li>
            <kbd>Alt+Shift+S</kbd> save point from any page
          </li>
          <li>
            <kbd>Alt+Shift+Q</kbd> capture a side quest
          </li>
          <li>Right-click selected text → pin as decision</li>
        </ul>
        <button className="btn btn-ghost btn-sm" onClick={() => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}>
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
          <button className="btn btn-ghost btn-sm" onClick={() => void doExport()}>
            Export backup
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void doImport(f);
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
                {confirmDelete === w.id ? (
                  <>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={() => void ui.run(() => deleteWorkflowCascade(w.id), `Deleted “${w.name}”.`).then(() => setConfirmDelete(null))}
                    >
                      Delete forever
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-xs" onClick={() => setConfirmDelete(w.id)}>
                    Delete…
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted small pad">{APP_NAME} {chrome.runtime.getManifest().version} · local-only · no accounts, no tracking</p>
    </div>
  );
}
