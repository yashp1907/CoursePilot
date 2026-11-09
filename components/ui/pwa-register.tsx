"use client";
import { useEffect } from "react";
import { initInstallCapture } from "@/lib/pwa";

/** Registers the service worker in production only (in dev it would cache stale builds, so any old one is removed). */
export function PwaRegister() {
  useEffect(() => {
    initInstallCapture();
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => { /* non-fatal */ });
  }, []);
  return null;
}
