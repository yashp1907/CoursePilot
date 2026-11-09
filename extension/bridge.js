// Runs on your CoursePilot tab only. Relays messages between the CoursePilot page and the extension.
// It never touches Canvas, cookies, or credentials; it only forwards what the background worker returns.
(() => {
  const FROM_PAGE = "coursepilot-page";
  const FROM_EXT = "coursepilot-extension";
  const send = (id, payload) => window.postMessage({ source: FROM_EXT, id, ...payload }, location.origin);

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.source !== FROM_PAGE || typeof m.id !== "string") return;

    if (m.type === "ping") {
      chrome.runtime.sendMessage({ type: "ping" }).then((r) => send(m.id, { type: "pong", ...r })).catch(() => send(m.id, { type: "error", error: "Extension unavailable. Reload the page." }));
    } else if (m.type === "fetch") {
      let done = false;
      let port;
      try { port = chrome.runtime.connect({ name: "canvas-sync" }); } catch { send(m.id, { type: "error", code: "failed", error: "Extension was updated. Reload this page." }); return; }
      port.onMessage.addListener((msg) => { if (msg.type === "result" || msg.type === "error") done = true; send(m.id, msg); });
      port.onDisconnect.addListener(() => { if (!done) send(m.id, { type: "error", code: "failed", error: "The extension stopped unexpectedly. Try again." }); });
      port.postMessage({ type: "start" });
    }
  });
})();
