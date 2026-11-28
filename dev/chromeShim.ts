// Dev-only stand-in for the chrome.* APIs the side panel touches, so the real
// panel UI can run in a normal browser tab for visual and keyboard QA.
// Never bundled into the extension (lives outside src/, own Vite config).

import manifest from "../manifest.json";

type Listener = (...args: unknown[]) => unknown;

const fakeTabs: chrome.tabs.Tab[] = [
  { id: 1, url: "https://claude.ai/chat/7f3c", title: "Token refresh retry design", pinned: false },
  { id: 2, url: "https://github.com/acme/payments/pull/412", title: "PR #412 · refresh tokens", pinned: false },
  { id: 3, url: "https://developer.mozilla.org/en-US/docs/Web/API/fetch", title: "fetch() - MDN", pinned: false },
  { id: 4, url: "chrome://extensions", title: "Extensions", pinned: false },
] as chrome.tabs.Tab[];

let tabsGranted = true;
let bridgeGranted = false;
const sessionStore: Record<string, unknown> = {
  bridgeStatus: { state: "not-installed", detail: null, hostVersion: null, at: Date.now() },
};
const storageListeners = new Set<Listener>();
type PermReq = { permissions?: string[] };
const isBridge = (p: PermReq) => p.permissions?.includes("nativeMessaging") ?? false;
let badge = "";
const messageListeners = new Set<Listener>();
const log = (...a: unknown[]) => console.info("[chrome-shim]", ...a);

const shim = {
  runtime: {
    id: "dev-harness",
    onMessage: {
      addListener: (l: Listener) => messageListeners.add(l),
      removeListener: (l: Listener) => messageListeners.delete(l),
    },
    sendMessage: async (msg: unknown) => {
      messageListeners.forEach((l) => l(msg, { id: "dev-harness" }, () => undefined));
    },
    // Real version from the manifest, marked as the harness build.
    getManifest: () => ({ version: `${manifest.version}-dev` }),
    getURL: (p: string) => `/${p}`,
  },
  action: {
    setBadgeText: async ({ text }: { text: string }) => {
      badge = text;
      log("badge", badge);
    },
    setTitle: async () => undefined,
    setBadgeBackgroundColor: async () => undefined,
  },
  permissions: {
    contains: async (p: PermReq) => (isBridge(p) ? bridgeGranted : tabsGranted),
    request: async (p: PermReq) => {
      if (isBridge(p)) bridgeGranted = true;
      else tabsGranted = true;
      return true;
    },
    remove: async (p: PermReq) => {
      if (isBridge(p)) bridgeGranted = false;
      else tabsGranted = false;
      return true;
    },
  },
  storage: {
    session: {
      get: async (key: string) => ({ [key]: sessionStore[key] }),
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) {
          const oldValue = sessionStore[k];
          sessionStore[k] = v;
          storageListeners.forEach((l) => l({ [k]: { oldValue, newValue: v } }, "session"));
        }
      },
    },
    onChanged: {
      addListener: (l: Listener) => storageListeners.add(l),
      removeListener: (l: Listener) => storageListeners.delete(l),
    },
  },
  tabs: {
    query: async () => (tabsGranted ? fakeTabs : []),
    create: async ({ url }: { url: string }) => {
      log("open tab", url);
      return { id: Math.floor(Math.random() * 1e6), url };
    },
    group: async () => 99,
  },
  tabGroups: {
    query: async () => [],
    update: async (_id: number, props: unknown) => log("group", props),
  },
  windows: {
    getLastFocused: async () => ({ id: 1 }),
    // Reopen tabs focuses the user's window, or opens one when none is left.
    update: async (id: number, props: unknown) => {
      log("window", id, props);
      return { id };
    },
    create: async ({ url }: { url?: string }) => {
      log("open window", url);
      return { id: 2, tabs: [{ id: Math.floor(Math.random() * 1e6), url }] };
    },
  },
  alarms: {
    create: async (name: string, info: unknown) => log("alarm", name, info),
    clear: async () => true,
    get: async () => undefined,
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = shim;
(globalThis as unknown as { __orionShim: unknown }).__orionShim = {
  get badge() {
    return badge;
  },
  setTabsGranted(v: boolean) {
    tabsGranted = v;
  },
};
