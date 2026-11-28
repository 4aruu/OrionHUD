// In-page capture box for Alt+Shift+S (save point) and Alt+Shift+Q (inbox).
//
// Injected on demand into one tab via activeTab; never auto-injected.
// Security: closed shadow root (page JS can't reach it), plain DOM APIs and
// textContent only (no innerHTML), a constructable stylesheet (not blocked
// by page CSP), and key events stopped so page shortcuts don't fire.

import { APP_NAME } from "../shared/brand";
import { captureStyles, parseCaptureConfig, type CaptureConfig } from "./captureConfig";

const HOST_ID = "orionhud-capture-host";

function readConfig(): CaptureConfig | null {
  const g = globalThis as unknown as { __orionCapture?: unknown };
  const raw = g.__orionCapture;
  // Consumed once: a later injection that skips the config step can't reuse a stale one.
  delete g.__orionCapture;
  return parseCaptureConfig(raw);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mount(config: CaptureConfig): void {
  document.getElementById(HOST_ID)?.remove();
  const previousFocus = document.activeElement as HTMLElement | null;

  const host = el("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(captureStyles(config.theme));
  shadow.adoptedStyleSheets = [sheet];

  const backdrop = el("div", "backdrop");
  const box = el("div", "box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", config.mode === "save" ? `${APP_NAME} save point` : `${APP_NAME} inbox capture`);
  const label = el("div", "label", config.label || APP_NAME);
  const input = el("input");
  input.type = "text";
  input.maxLength = config.mode === "save" ? 280 : 500;
  input.placeholder = config.mode === "save" ? "Next step when you're back? (optional)" : "Capture a side quest…";
  input.setAttribute("aria-label", input.placeholder);
  const hint = el("div", "hint");
  const left = el("span", undefined, config.mode === "save" ? "Enter to save · Esc to cancel" : "Enter to add · Esc to cancel");
  const right = el("span", "brand", APP_NAME);
  hint.append(left, right);
  box.append(label, input, hint);
  backdrop.append(box);
  shadow.append(backdrop);
  document.documentElement.append(host);

  let busy = false;
  const close = (): void => {
    host.remove();
    previousFocus?.focus?.();
  };

  const submit = (): void => {
    if (busy) return;
    const text = input.value.trim();
    if (config.mode === "inbox" && !text) return;
    busy = true;
    input.disabled = true;
    chrome.runtime
      .sendMessage({ type: "ORION_CAPTURE_SUBMIT", mode: config.mode, text })
      .then((res: unknown) => {
        const r = res as { ok?: boolean; error?: string } | undefined;
        if (r?.ok) {
          hint.className = "hint ok";
          left.textContent = config.mode === "save" ? `Saved. You can pick this up in ${APP_NAME}.` : "Added to inbox.";
          setTimeout(close, 900);
        } else {
          throw new Error(r?.error ?? "Couldn't save.");
        }
      })
      .catch((err: unknown) => {
        busy = false;
        input.disabled = false;
        hint.className = "hint err";
        left.textContent = err instanceof Error ? err.message : "Couldn't save.";
      });
  };

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
  // Keep page-level key handlers (e.g. site shortcuts) from seeing our typing.
  for (const type of ["keyup", "keypress"] as const) input.addEventListener(type, (e) => e.stopPropagation());
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });

  input.focus();
}

const config = readConfig();
if (config) mount(config);

export {};
