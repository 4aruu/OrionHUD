import { BrandName } from "../sidepanel/components/BrandName";
import { Step } from "./Step";
import type { StepStatus } from "./steps";

/** Step 4: pin the toolbar icon. Ticks itself where the browser reports pin state. */
export function PinStep({ status, pinned }: { status: StepStatus; pinned: boolean | null }) {
  return (
    <Step n={4} status={status} title="Pin it to your toolbar" titleId="step-pin">
      {pinned ? (
        <p className="wstep-text">
          Pinned. Click the icon any time to open <BrandName />.
        </p>
      ) : (
        <p className="wstep-text">
          Click the puzzle piece, then the pin next to <BrandName />.
        </p>
      )}
    </Step>
  );
}
