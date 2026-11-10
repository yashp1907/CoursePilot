"use client";
import { useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";
export type StyleId = "classic" | "glass";
export type AccentId = "indigo" | "ocean" | "forest" | "sunset" | "rose" | "violet" | "graphite";

/** Swatches mirror the CSS in globals.css (used only for previews). */
export const ACCENTS: { id: AccentId; label: string; blurb: string; light: { bg: string; p: string }; dark: { bg: string; p: string } }[] = [
  { id: "indigo", label: "Indigo", blurb: "Clean and focused", light: { bg: "#f6f7f9", p: "#3d52e0" }, dark: { bg: "#0e1014", p: "#8c9bf5" } },
  { id: "ocean", label: "Ocean", blurb: "Cool and calm", light: { bg: "#f2f7fa", p: "#0b72a8" }, dark: { bg: "#0a1114", p: "#5cc2ee" } },
  { id: "forest", label: "Forest", blurb: "Grounded and fresh", light: { bg: "#f3f7f4", p: "#25774a" }, dark: { bg: "#0b110e", p: "#6fcf97" } },
  { id: "sunset", label: "Sunset", blurb: "Warm and friendly", light: { bg: "#faf6f2", p: "#b04516" }, dark: { bg: "#12100d", p: "#f29a66" } },
  { id: "rose", label: "Rose", blurb: "Soft and bold", light: { bg: "#faf5f7", p: "#be2f5c" }, dark: { bg: "#130f11", p: "#f38aa9" } },
  { id: "violet", label: "Violet", blurb: "Creative and rich", light: { bg: "#f7f5fb", p: "#6b3fd4" }, dark: { bg: "#100e15", p: "#b39bf8" } },
  { id: "graphite", label: "Graphite", blurb: "Quiet and minimal", light: { bg: "#f5f5f5", p: "#262a33" }, dark: { bg: "#0f0f10", p: "#e6e7ea" } },
];

export const STYLES: { id: StyleId; label: string; blurb: string }[] = [
  { id: "classic", label: "Classic", blurb: "Crisp, flat and fast" },
  { id: "glass", label: "Liquid Glass", blurb: "Frosted, luminous, alive" },
];

const SKEY = "cp-style";
const KEY = "cp-theme";
const AKEY = "cp-accent";
const listeners = new Set<() => void>();

export function readPref(): ThemePref {
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark" || v === "system") return v; } catch { /* storage blocked */ }
  return "system";
}
export function readAccent(): AccentId {
  try { const v = localStorage.getItem(AKEY); if (ACCENTS.some((a) => a.id === v)) return v as AccentId; } catch { /* ignore */ }
  return "indigo";
}
export function readStyle(): StyleId {
  try { if (localStorage.getItem(SKEY) === "glass") return "glass"; } catch { /* ignore */ }
  return "classic";
}
export const systemPrefersDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
export const resolve = (p: ThemePref): "light" | "dark" => (p === "system" ? (systemPrefersDark() ? "dark" : "light") : p);

/** Run a DOM change inside a View Transition (GPU cross-fade) when the browser supports it. */
function smooth(change: () => void) {
  const root = document.documentElement;
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }).startViewTransition?.bind(document);
  if (vt && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-switching");
    vt(change).finished.finally(() => root.classList.remove("theme-switching"));
  } else change();
}

function paintMeta() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}

export function applyTheme(p: ThemePref, animate = false) {
  const root = document.documentElement;
  const t = resolve(p);
  const set = () => { root.dataset.theme = t; root.style.colorScheme = t; };
  if (animate && root.dataset.theme !== t) smooth(set); else set();
  paintMeta();
}
export function applyAccent(a: AccentId, animate = false) {
  const root = document.documentElement;
  const set = () => { if (a === "indigo") delete root.dataset.accent; else root.dataset.accent = a; };
  if (animate) smooth(set); else set();
  paintMeta();
}

export function applyStyle(st: StyleId, animate = false) {
  const root = document.documentElement;
  const set = () => { if (st === "glass") root.dataset.style = "glass"; else delete root.dataset.style; };
  if (animate) smooth(set); else set();
  paintMeta();
}

export function setPref(p: ThemePref) {
  try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
  applyTheme(p, true);
  listeners.forEach((l) => l());
}
export function setAccent(a: AccentId) {
  try { localStorage.setItem(AKEY, a); } catch { /* ignore */ }
  applyAccent(a, true);
  listeners.forEach((l) => l());
}

export function setStyle(st: StyleId) {
  try { localStorage.setItem(SKEY, st); } catch { /* ignore */ }
  applyStyle(st, true);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSys = () => { if (readPref() === "system") applyTheme("system"); cb(); };
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) applyTheme(readPref()); if (e.key === AKEY) applyAccent(readAccent()); if (e.key === SKEY) applyStyle(readStyle()); cb(); };
  mq.addEventListener("change", onSys); window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); mq.removeEventListener("change", onSys); window.removeEventListener("storage", onStorage); };
}

/** Light/dark preference, the resolved mode, and the accent palette. Server renders defaults and corrects after hydration. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as ThemePref);
  const resolved = useSyncExternalStore(subscribe, () => resolve(readPref()), () => "light" as const);
  const accent = useSyncExternalStore(subscribe, readAccent, () => "indigo" as AccentId);
  const style = useSyncExternalStore(subscribe, readStyle, () => "classic" as StyleId);
  return { pref, resolved, accent, style, setPref, setAccent, setStyle };
}

/** Runs before first paint (inlined in <head>) so there's never a flash of the wrong theme or accent. */
export const THEME_INIT_SCRIPT = `(function(){try{var r=document.documentElement;var p=localStorage.getItem('${KEY}');if(p!=='light'&&p!=='dark')p='system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light';var a=localStorage.getItem('${AKEY}');if(a&&a!=='indigo')r.dataset.accent=a;if(localStorage.getItem('${SKEY}')==='glass')r.dataset.style='glass';}catch(e){}})();`;
