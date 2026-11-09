import { createSession, NotLoggedInError } from "./lib/canvas-fetch.js";

const $ = (id) => document.getElementById(id);
const status = (msg, cls = "") => { $("status").textContent = msg; $("status").className = cls; };

function normalize(v) {
  let raw = v.trim();
  if (!raw) throw new Error("Enter your Canvas address.");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("Canvas must use https.");
  if (!u.hostname.includes(".") || /^\d+(\.\d+){3}$/.test(u.hostname)) throw new Error("Use your school's public Canvas address.");
  return u.origin;
}

chrome.storage.local.get("canvasOrigin").then(async ({ canvasOrigin }) => {
  if (!canvasOrigin) return;
  $("origin").value = canvasOrigin;
  const ok = await chrome.permissions.contains({ origins: [`${canvasOrigin}/*`] });
  status(ok ? "Access granted. Open CoursePilot and click Sync." : "Saved, but access isn't granted yet. Click Grant access.", ok ? "ok" : "");
});

$("save").addEventListener("click", async () => {
  try {
    const origin = normalize($("origin").value);
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) return status("Permission was not granted.", "err");
    await chrome.storage.local.set({ canvasOrigin: origin });
    $("origin").value = origin;
    status("Saved. Open CoursePilot → Integrations and click Sync.", "ok");
  } catch (e) { status(e.message, "err"); }
});

$("test").addEventListener("click", async () => {
  try {
    const origin = normalize($("origin").value);
    if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) return status("Click “Grant access & save” first.", "err");
    status("Checking…");
    const me = await createSession(origin).get("/api/v1/users/self");
    status(`Connected as ${me.name ?? "you"}.`, "ok");
  } catch (e) { status(e instanceof NotLoggedInError ? "Log into Canvas in this browser first, then test again." : e.message, "err"); }
});
