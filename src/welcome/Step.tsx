import type { ReactNode } from "react";
import type { StepStatus } from "./steps";

interface Props {
  n: number;
  status: StepStatus;
  title: string;
  /** id of the heading, so a step's field can be labelled by it. */
  titleId: string;
  children: ReactNode;
}

/** One numbered step: a number, a green tick when done, amber while it's the current one. */
export function Step({ n, status, title, titleId, children }: Props) {
  return (
    <li className={`wstep wstep-${status}`} aria-current={status === "current" ? "step" : undefined}>
      <span className="wstep-num" aria-hidden="true">
        {status === "done" ? "✓" : n}
      </span>
      <div className="wstep-body">
        <h2 className="wstep-title" id={titleId}>
          <span className="sr-only">{`Step ${n}${status === "done" ? ", done" : ""}: `}</span>
          {title}
        </h2>
        {children}
      </div>
    </li>
  );
}
