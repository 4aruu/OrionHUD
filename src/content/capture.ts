// In-page capture box for Alt+Shift+S (save point) and Alt+Shift+Q (inbox).
//
// Injected on demand into one tab via activeTab; never auto-injected.
// Security: closed shadow root (page JS can't reach it), plain DOM APIs and
// textContent only (no innerHTML), a constructable stylesheet (not blocked
// by page CSP), and key events stopped so page shortcuts don't fire.

import { APP_NAME } from "../shared/brand";

type Mode = "save" | "inbox";

interface CaptureConfig {
  mode: Mode;
  label: string;
}

const HOST_ID = "orionhud-capture-host";

function readConfig(): CaptureConfig | null {
  const g = globalThis as unknown as { __orionCapture?: unknown };
  const raw = g.__orionCapture as Partial<CaptureConfig> | undefined;
  delete g.__orionCapture;
  if (!raw || (raw.mode !== "save" && raw.mode !== "inbox")) return null;
  return { mode: raw.mode, label: typeof raw.label === "string" ? raw.label.slice(0, 120) : "" };
}

const STYLES = `
:host { all: initial; }
.backdrop { position: fixed; inset: 0; z-index: 2147483647; display: flex; justify-content: center;
  align-items: flex-start; padding-top: 18vh; background: rgba(5,7,12,.35); }
.box { width: min(560px, calc(100vw - 32px)); background: #0f121a; color: #f1f5f9;
  border: 1px solid rgba(99,102,241,.55); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.55);
  padding: 14px 16px; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.label { font-size: 11px; font-weight: 600; letter-spacing: .04em; color: #a5b4fc; text-transform: uppercase;
  margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
input { all: unset; box-sizing: border-box; width: 100%; padding: 10px 12px; border-radius: 8px;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); color: #f1f5f9; font-size: 14px; }
input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.25); }
.hint { margin-top: 8px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; gap: 8px; }
.hint .brand { white-space: nowrap; }
.hint.ok { color: #34d399; } .hint.err { color: #f87171; }
@media (prefers-reduced-motion: no-preference) { .box { animation: in 140ms ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } } }
`;

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
  sheet.replaceSync(STYLES);
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
          left.textContent = config.mode === "save" ? "Saved. You can pick this up from the side panel." : "Added to inbox.";
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
