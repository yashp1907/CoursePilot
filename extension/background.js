import { createSession, fetchAllCanvasData, NotLoggedInError } from "./lib/canvas-fetch.js";

const VERSION = chrome.runtime.getManifest().version;

async function settings() {
  const { canvasOrigin, hintOrigin } = await chrome.storage.local.get(["canvasOrigin", "hintOrigin"]);
  if (!canvasOrigin) return { canvasOrigin: null, granted: false, hintOrigin: hintOrigin ?? null };
  const granted = await chrome.permissions.contains({ origins: [`${canvasOrigin}/*`] });
  return { canvasOrigin, granted, hintOrigin: hintOrigin ?? null };
}

// Right after install/update, wake up any CoursePilot tabs that are already open so the page can find the
// extension without a manual reload.
chrome.runtime.onInstalled.addListener(async () => {
  const { content_scripts: cs, host_permissions: hosts } = chrome.runtime.getManifest();
  try {
    const tabs = await chrome.tabs.query({ url: hosts });
    for (const tab of tabs) {
      if (tab.id != null) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: cs[0].js }).catch(() => {});
    }
  } catch { /* best effort */ }
});

// One-shot questions from the bridge content script (only our own content script can reach this).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg?.type === "ping") {
    settings().then((s) => sendResponse({ ok: true, version: VERSION, ...s }));
    return true;
  }
  if (msg?.type === "hint") {
    // The CoursePilot page suggests the student's Canvas address so the popup can prefill it. Only ever a hint:
    // the student still has to approve Chrome's permission prompt themselves.
    try {
      const u = new URL(String(msg.canvasOrigin));
      if (u.protocol === "https:") chrome.storage.local.set({ hintOrigin: u.origin });
    } catch { /* ignore */ }
    sendResponse({ ok: true });
    return false;
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
