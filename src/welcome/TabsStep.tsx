import { Step } from "./Step";
import type { StepStatus } from "./steps";

interface Props {
  status: StepStatus;
  granted: boolean;
  answered: boolean;
  /** Must call requestTabsPermission synchronously (user gesture). */
  onTurnOn: () => void;
  onNotNow: () => void;
}

/**
 * Step 2: explain tab memory, then let the user ask for it (or skip).
 * The spec's "Chrome will ask once" reads "Your browser" here: copy never
 * assumes Chrome (test/brand.test.ts), the extension runs in any Chromium browser.
 */
export function TabsStep({ status, granted, answered, onTurnOn, onNotNow }: Props) {
  return (
    <Step n={2} status={status} title="Remember my tabs" titleId="step-tabs">
      {granted ? (
        <p className="wstep-text">On. Save points will keep your tabs and AI chats.</p>
      ) : answered ? (
        <p className="wstep-text">Off. Save points will keep just your next step. You can turn it on in Settings.</p>
      ) : (
        <>
          <p className="wstep-text">Save points keep the tabs and AI chats you had open. Your browser will ask once. Nothing leaves your computer.</p>
          <div className="wstep-actions">
            <button className="btn btn-primary btn-sm" onClick={onTurnOn}>
              Turn on tab memory
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onNotNow}>
              Not now
            </button>
          </div>
        </>
      )}
    </Step>
  );
}
