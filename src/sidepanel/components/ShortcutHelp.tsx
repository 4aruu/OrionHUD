import { useEffect, useRef } from "react";
import { APP_NAME } from "../../shared/brand";

const KEYS: [string, string][] = [
  ["↑ ↓", "Move between tasks"],
  ["← →", "Collapse / expand, or jump to parent / child"],
  ["Enter", "New task below"],
  ["Shift+Enter", "New subtask"],
  ["Tab / Shift+Tab", "Nest / un-nest"],
  ["Alt+↑ / Alt+↓", "Reorder"],
  ["Space", "Complete / reopen"],
  ["e or F2", "Rename"],
  [".", "Work on this task (saves where you were)"],
  ["m", "Toggle milestone"],
  ["c", "Copy handoff brief for AI"],
  ["Delete", "Delete (with undo)"],
  ["?", "This help"],
];

const GLOBAL: [string, string][] = [
  ["Alt+Shift+S", "Save point from any page"],
  ["Alt+Shift+Q", "Capture a side quest from any page"],
  ["Alt+Shift+O", `Open ${APP_NAME} in its own window`],
  ["Right-click text", "Pin as a decision / Send to inbox"],
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-head">
          <h3>Keyboard</h3>
          <button ref={closeRef} className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <h4>In the task list</h4>
        <dl className="keys">
          {KEYS.map(([k, d]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
        <h4>Anywhere in your browser</h4>
        <dl className="keys">
          {GLOBAL.map(([k, d]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
