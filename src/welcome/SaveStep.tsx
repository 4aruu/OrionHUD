import { LIMITS } from "../shared/validators";
import { BusyButton } from "../sidepanel/components/Buttons";
import { Step } from "./Step";
import type { StepStatus } from "./steps";

interface Props {
  status: StepStatus;
  hasTask: boolean;
  /** The save-point binding; null when unassigned, undefined while loading. */
  shortcut: string | null | undefined;
  draft: string;
  onDraft: (value: string) => void;
  saving: boolean;
  onSaveNow: () => void;
  onSetShortcut: () => void;
}

/** "Alt+Shift+S" as keys. macOS bindings come back as one glyph string ("⌥⇧S") and stay one key. */
function Keys({ shortcut }: { shortcut: string }) {
  const parts = shortcut.split("+");
  return (
    <>
      {parts.map((k, i) => (
        <span key={i}>
          {i > 0 && "+"}
          <kbd>{k}</kbd>
        </span>
      ))}
    </>
  );
}

/** Step 3: an optional next step, then a save point (shortcut or button). */
export function SaveStep({ status, hasTask, shortcut, draft, onDraft, saving, onSaveNow, onSetShortcut }: Props) {
  if (status === "done") {
    return (
      <Step n={3} status={status} title="Save your place" titleId="step-save">
        <p className="wstep-text">Saved. That card is what you'll see when you come back.</p>
      </Step>
    );
  }
  if (!hasTask) {
    return (
      <Step n={3} status={status} title="Save your place" titleId="step-save">
        <p className="wstep-text">Start a task in step 1 first, then save your place here.</p>
      </Step>
    );
  }
  return (
    <Step n={3} status={status} title="Save your place" titleId="step-save">
      <form
        className="wform"
        onSubmit={(e) => {
          e.preventDefault();
          onSaveNow();
        }}
      >
        <label className="field">
          <span>
            What's the very next thing you'll do? <span className="wopt">Optional</span>
          </span>
          <input value={draft} maxLength={LIMITS.nextStep} placeholder="e.g. Tighten the tagline" onChange={(e) => onDraft(e.target.value)} />
        </label>
      </form>
      {shortcut === undefined ? null : shortcut ? (
        <>
          <p className="wstep-text">
            Press <Keys shortcut={shortcut} /> and watch the card fill in.
          </p>
          <p className="wlisten">
            <span className="wlisten-dot" aria-hidden="true" />
            Listening for the shortcut…
          </p>
        </>
      ) : (
        <p className="wstep-text">The save shortcut isn't set. Another extension may be using it.</p>
      )}
      <p className="wstep-links">
        <button type="button" className="link-btn" onClick={onSetShortcut}>
          {shortcut === null ? "Set a shortcut" : "Shortcut not working? Set it here"}
        </button>
        <span aria-hidden="true">·</span>
        <BusyButton type="button" className="link-btn" busy={saving} onClick={onSaveNow}>
          Save without the shortcut
        </BusyButton>
      </p>
    </Step>
  );
}
