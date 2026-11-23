import { useState } from "react";

interface Props {
  leavingTitle: string;
  targetTitle: string | null;
  onConfirm: (nextStep: string) => void;
  onCancel: () => void;
}

/** One field, skippable: what to do first when you come back to the task you're leaving. */
export function SwitchPrompt({ leavingTitle, targetTitle, onConfirm, onCancel }: Props) {
  const [text, setText] = useState("");
  return (
    <form
      className="switch-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(text);
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
        placeholder="Next step when you're back? (Enter to save, Esc to skip)"
        aria-label="Next step for the task you're leaving"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onConfirm("");
          }
        }}
      />
      <div className="switch-actions">
        <button className="btn btn-primary btn-sm" type="submit">
          {targetTitle ? "Save & switch" : "Save & pause"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
