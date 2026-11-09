import { createSession, fetchAllCanvasData, NotLoggedInError } from "./lib/canvas-fetch.js";

const VERSION = chrome.runtime.getManifest().version;

async function settings() {
  const { canvasOrigin } = await chrome.storage.local.get("canvasOrigin");
  if (!canvasOrigin) return { canvasOrigin: null, granted: false };
  const granted = await chrome.permissions.contains({ origins: [`${canvasOrigin}/*`] });
  return { canvasOrigin, granted };
}

// One-shot questions from the bridge content script (only our own content script can reach this).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg?.type === "ping") {
    settings().then((s) => sendResponse({ ok: true, version: VERSION, ...s }));
    return true;
  }
  return false;
});

// Long-running sync over a port; progress messages also keep the service worker alive.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "canvas-sync" || port.sender?.id !== chrome.runtime.id) { port.disconnect(); return; }
  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== "start") return;
    try {
      const { canvasOrigin, granted } = await settings();
      if (!canvasOrigin || !granted) { port.postMessage({ type: "error", code: "not_configured", error: "Open the extension popup, enter your Canvas address, and click Grant access." }); return; }
      const data = await fetchAllCanvasData(createSession(canvasOrigin), (p) => port.postMessage({ type: "progress", ...p }));
      port.postMessage({ type: "result", baseUrl: canvasOrigin, ...data });
    } catch (e) {
      port.postMessage({ type: "error", code: e instanceof NotLoggedInError ? "not_logged_in" : "failed", error: e instanceof Error ? e.message : "Canvas sync failed." });
    }
  });
});
