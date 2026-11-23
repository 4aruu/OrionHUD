import "./chromeShim";
import "../src/sidepanel/index.css";

// A real side panel never restores scroll; match that on harness reloads.
history.scrollRestoration = "manual";

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.has("reset")) {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("orion-hud");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
  if (params.has("seed")) {
    const { seedDemo } = await import("./seed");
    await seedDemo();
  }
  const [{ default: React }, { default: ReactDOM }, { default: App }] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("../src/sidepanel/App"),
  ]);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void boot();
