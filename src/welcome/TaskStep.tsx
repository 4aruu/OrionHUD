import { useRef, useState } from "react";
import { LIMITS, validateWorkflowName } from "../shared/validators";
import { BusyButton } from "../sidepanel/components/Buttons";
import { useBusy } from "../sidepanel/hooks/useBusy";
import type { Ui } from "../sidepanel/lib/ui";
import { pickUpTask, startFromWelcome } from "./actions";
import { Step } from "./Step";
import type { WelcomeState } from "./steps";

const HINT = "Type what you're working on, like “Fix the login bug”.";

/** Step 1: name the work (creates and starts it), or pick up an open task. */
export function TaskStep({ state, ui }: { state: WelcomeState; ui: Ui }) {
  const { taskMode, active, recent } = state;
  const title = taskMode === "pick" ? "Pick up where you were" : "What are you working on right now?";

  return (
    <Step n={1} status={state.steps.task} title={title} titleId="step-task">
      {taskMode === "done" && active && <p className="wstep-text wstep-answer">{active.task.title}</p>}
      {taskMode === "pick" && (
        <>
          <ul className="wpick" aria-labelledby="step-task">
            {recent.map((t) => (
              <li key={t.taskId}>
                <PickButton ui={ui} workflowId={t.workflowId} taskId={t.taskId} title={t.title} workflowName={t.workflowName} />
              </li>
            ))}
          </ul>
          <p className="wstep-text" id="step-task-new">
            or start something new
          </p>
          <StartForm ui={ui} labelledBy="step-task-new" />
        </>
      )}
      {taskMode === "create" && <StartForm ui={ui} labelledBy="step-task" />}
    </Step>
  );
}

function PickButton({ ui, workflowId, taskId, title, workflowName }: { ui: Ui; workflowId: string; taskId: string; title: string; workflowName: string }) {
  const [busy, run] = useBusy();
  return (
    <button className="wpick-btn" aria-busy={busy || undefined} onClick={() => void run(() => ui.run(() => pickUpTask(workflowId, taskId)))}>
      <span className="wpick-title">{title}</span>
      {workflowName !== title && <span className="wpick-wf">{workflowName}</span>}
    </button>
  );
}

function StartForm({ ui, labelledBy }: { ui: Ui; labelledBy: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const inputRef = useRef<HTMLInputElement>(null);

  async function start() {
    if (!validateWorkflowName(value)) {
      setError(HINT);
      inputRef.current?.focus();
      return;
    }
    await run(() => ui.run(() => startFromWelcome(value)));
  }

  return (
    <form
      className="wform"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="inline-form">
        <input
          ref={inputRef}
          value={value}
          maxLength={LIMITS.workflowName}
          placeholder="e.g. Fix the login bug"
          aria-labelledby={labelledBy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "step-task-error" : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        <BusyButton className="btn btn-primary" type="submit" busy={busy}>
          Start
        </BusyButton>
      </div>
      {error && (
        <p id="step-task-error" className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
