// Phase 3 stub: Shadow DOM root + minimal React placeholder to prove
// content-script injection works. Phase 6 replaces HudPlaceholder
// with the real HudOverlay and PipelineChart components.

import React from "react";
import ReactDOM from "react-dom/client";

function HudPlaceholder() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 2147483647,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 13,
        fontWeight: 500,
        color: "#e2e8f0",
        background: "rgba(13,15,20,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(99,102,241,0.4)",
        borderRadius: 10,
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#6366f1",
          boxShadow: "0 0 6px #6366f1",
        }}
      />
      OrionHUD injected ✓
    </div>
  );
}

// Only mount once per tab — guard against re-injection.
const MOUNT_ID = "orion-hud-root";
if (!document.getElementById(MOUNT_ID)) {
  const host = document.createElement("div");
  host.id = MOUNT_ID;
  document.documentElement.appendChild(host);

  // "closed" mode: host-page JavaScript cannot reach OrionHUD's DOM
  // via host.shadowRoot — the reference is null from outside this script.
  const shadow = host.attachShadow({ mode: "closed" });
  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  ReactDOM.createRoot(mountPoint).render(
    <React.StrictMode>
      <HudPlaceholder />
    </React.StrictMode>
  );
}
