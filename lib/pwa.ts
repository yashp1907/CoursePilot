"use client";
import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Start listening as early as possible (the browser fires this event once, soon after load). */
export function initInstallCapture() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; snapshot = compute(); emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; installed = true; snapshot = compute(); emit(); });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", () => { snapshot = compute(); emit(); });
}

export interface InstallState { canPrompt: boolean; standalone: boolean; ios: boolean; installed: boolean }
const SERVER: InstallState = { canPrompt: false, standalone: false, ios: false, installed: false };

function compute(): InstallState {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return { canPrompt: !!deferred, standalone, ios, installed };
}
let snapshot: InstallState = SERVER;

function subscribe(cb: () => void) {
  initInstallCapture();
  if (snapshot === SERVER) snapshot = compute();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useInstall() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => SERVER);
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null; snapshot = compute(); emit();
    return outcome === "accepted";
  };
  return { ...state, install };
}
