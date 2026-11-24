import { useCallback, useEffect, useRef, useState } from "react";
import { APP_NAME } from "../../shared/brand";
import { getLiveTabs, getMeta, listWorkflows } from "../../shared/db";
import { isOwnSender, parseExtensionMessage } from "../../shared/messages";
import type { IAppMeta, ILiveTabs, IWorkflowState } from "../../shared/types";

export interface OrionData {
  workflows: IWorkflowState[];
  meta: IAppMeta;
  live: ILiveTabs | null;
}

/**
 * Single source of truth for the panel: always read from IndexedDB, and
 * re-read whenever the service worker says something changed or the panel
 * regains focus. No state is ever pushed in a message payload, so a missed
 * message can't leave the panel showing stale data for long.
 */
export function useOrion() {
  const [data, setData] = useState<OrionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [workflows, meta, live] = await Promise.all([listWorkflows(), getMeta(), getLiveTabs()]);
      if (mine === seq.current) {
        setData({ workflows, meta, live });
        setLoadError(null);
      }
    } catch (err) {
      console.error(`[${APP_NAME}] load failed`, err);
      if (mine === seq.current) setLoadError("Couldn't read your saved work. Reload the panel to retry.");
    }
  }, []);

  useEffect(() => {
    void reload();
    const onMessage = (raw: unknown, sender: chrome.runtime.MessageSender) => {
      if (!isOwnSender(sender, chrome.runtime.id)) return;
      if (parseExtensionMessage(raw)?.type === "ORION_STATE_CHANGED") void reload();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);

  return { data, loadError, reload };
}

/** Re-renders every `ms` while enabled (live countdowns, "5 min ago"). */
export function useNow(ms: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}
