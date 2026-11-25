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

/** Copies text; a failure is always reported as a toast. Resolves to whether it worked. */
export async function copyText(text: string, ui: Ui): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    ui.toast({ kind: "error", text: "Couldn't copy. Click inside the panel and try again." });
    return false;
  }
}

/**
 * Copies a task's brief. `quiet` skips the success toast for a CopyButton,
 * which confirms in place; the keyboard shortcut has no button, so it toasts.
 */
export async function copyBrief(workflow: IWorkflowState, taskId: string, ui: Ui, { quiet = false } = {}): Promise<boolean> {
  const ok = await copyText(buildBrief(workflow, taskId), ui);
  if (ok && !quiet) ui.toast({ kind: "info", text: "Brief copied. Paste it into any AI chat or agent." });
  return ok;
}

export async function clearResumeBadge(): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: APP_NAME });
  } catch {
    /* not critical */
  }
}
