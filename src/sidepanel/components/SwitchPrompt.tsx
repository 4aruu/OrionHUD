import { useState } from "react";
import { useBusy } from "../hooks/useBusy";
import { BusyButton } from "./Buttons";

interface Props {
  leavingTitle: string;
  targetTitle: string | null;
  onConfirm: (nextStep: string) => Promise<void>;
  onCancel: () => void;
}

/** One field, skippable: what to do first when you come back to the task you're leaving. */
export function SwitchPrompt({ leavingTitle, targetTitle, onConfirm, onCancel }: Props) {
  const [text, setText] = useState("");
  const [busy, run] = useBusy();
  const confirm = (step: string) => void run(() => onConfirm(step));
  return (
    <form
      className="switch-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        confirm(text);
      }}
    >
      <div className="switch-head">
        Leaving <strong>{leavingTitle}</strong>
        {targetTitle ? (
          <>
            {" "}
            for <strong>{targetTitle}</strong>
          </>
        ) : (
          " (pausing)"
        )}
      </div>
      <input
        autoFocus
        value={text}
        maxLength={280}
        readOnly={busy}
        placeholder="Next step when you're back? (Enter to save, Esc to skip)"
        aria-label="Next step for the task you're leaving"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            confirm("");
          }
        }}
      />
      <div className="switch-actions">
        <BusyButton className="btn btn-primary btn-sm" type="submit" busy={busy}>
          {targetTitle ? "Save & switch" : "Save & pause"}
        </BusyButton>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
