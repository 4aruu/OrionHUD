import { APP_NAME } from "../../shared/brand";
import type { ToastState } from "../components/Toast";
import { buildBrief } from "../../shared/brief";
import type { IWorkflowState } from "../../shared/types";

export interface Ui {
  /** Runs an action, reloads state, and turns failures into a toast. */
  run: <T>(fn: () => Promise<T>, okText?: string) => Promise<T | undefined>;
  toast: (t: Omit<ToastState, "id">) => void;
  reload: () => Promise<void>;
}

export async function copyBrief(workflow: IWorkflowState, taskId: string, ui: Ui): Promise<void> {
  try {
    await navigator.clipboard.writeText(buildBrief(workflow, taskId));
    ui.toast({ kind: "info", text: "Brief copied. Paste it into any AI chat or agent." });
  } catch {
    ui.toast({ kind: "error", text: "Couldn't copy. Click inside the panel and try again." });
  }
}

export async function clearResumeBadge(): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: APP_NAME });
  } catch {
    /* not critical */
  }
}
