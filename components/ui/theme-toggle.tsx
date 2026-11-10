"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS, STYLES, useTheme, type ThemePref } from "@/lib/theme";

export const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

/** Header button: one click opens Light / Dark / System. */
export function ThemeToggle() {
  const { pref, resolved, setPref } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey); window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Change appearance" title="Appearance"
        className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer pointer-coarse:size-11">
        <Icon className="size-[18px]" suppressHydrationWarning />
      </button>
      {open && (
        <div role="menu" aria-label="Appearance" className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-lg border bg-card p-1 shadow-[var(--shadow-pop)]">
          {THEME_OPTIONS.map((o) => (
            <button key={o.value} role="menuitemradio" aria-checked={pref === o.value} onClick={() => { setPref(o.value); setOpen(false); }}
              className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent cursor-pointer", pref === o.value && "font-medium")}>
              <o.icon className="size-4 text-muted-foreground" />{o.label}{pref === o.value && <Check className="ml-auto size-3.5 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Settings card control: three large previews. */
export function ThemePicker() {
  const { pref, setPref } = useTheme();
  return (
    <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Appearance">
      {THEME_OPTIONS.map((o) => {
        const on = pref === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => setPref(o.value)}
            className={cn("group rounded-xl border p-2 text-left transition-all cursor-pointer hover:border-primary/50", on && "border-primary ring-2 ring-primary/25")}>
            <div className={cn("relative h-16 overflow-hidden rounded-md border", o.value === "dark" ? "bg-[#0e1014]" : o.value === "light" ? "bg-[#f6f7f9]" : "bg-gradient-to-r from-[#f6f7f9] from-50% to-[#0e1014] to-50%")}>
              <div className={cn("absolute left-2 top-2 h-2 w-8 rounded-full", o.value === "dark" ? "bg-[#8c9bf5]" : "bg-[#3d52e0]")} />
              <div className={cn("absolute bottom-2 left-2 right-8 h-5 rounded", o.value === "dark" ? "bg-[#1f2229]" : o.value === "light" ? "bg-white shadow-sm" : "bg-white/80")} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 px-0.5 text-sm font-medium"><o.icon className="size-3.5 text-muted-foreground" />{o.label}{on && <Check className="ml-auto size-3.5 text-primary" />}</p>
          </button>
        );
      })}
    </div>
  );
}

/** Accent palette picker: each tile previews the real colors for the mode you're currently in. */
export function AccentPicker() {
  const { accent, resolved, setAccent } = useTheme();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label="Color theme">
      {ACCENTS.map((a) => {
        const on = accent === a.id; const c = resolved === "dark" ? a.dark : a.light;
        const card = resolved === "dark" ? "rgba(255,255,255,0.07)" : "#ffffff";
        return (
          <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => setAccent(a.id)}
            className={cn("group rounded-xl border p-2 text-left transition-all cursor-pointer hover:-translate-y-px hover:border-primary/50", on && "border-primary ring-2 ring-primary/25")}>
            <div className="relative h-14 overflow-hidden rounded-md border" style={{ backgroundColor: c.bg }}>
              <div className="absolute left-2 top-2 h-1.5 w-7 rounded-full" style={{ backgroundColor: c.p }} />
              <div className="absolute bottom-2 left-2 h-5 w-[58%] rounded" style={{ backgroundColor: card, boxShadow: "0 1px 2px rgba(0,0,0,.12)" }} />
              <div className="absolute bottom-2 right-2 size-5 rounded-full" style={{ backgroundColor: c.p }} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 px-0.5 text-sm font-medium">{a.label}{on && <Check className="ml-auto size-3.5 text-primary" />}</p>
            <p className="px-0.5 text-xs text-muted-foreground">{a.blurb}</p>
          </button>
        );
      })}
    </div>
  );
}

/** Interface style: Classic (flat) or Liquid Glass (frosted, Apple-inspired). Works with every color theme and mode. */
export function StylePicker() {
  const { style, accent, resolved, setStyle } = useTheme();
  const a = ACCENTS.find((x) => x.id === accent) ?? ACCENTS[0];
  const c = resolved === "dark" ? a.dark : a.light;
  const dark = resolved === "dark";
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Interface style">
      {STYLES.map((o) => {
        const on = style === o.id; const glass = o.id === "glass";
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setStyle(o.id)}
            className={cn("group rounded-xl border p-2 text-left transition-all cursor-pointer hover:border-primary/50", on && "border-primary ring-2 ring-primary/25")}>
            <div className="relative h-20 overflow-hidden rounded-md border" style={{ backgroundColor: c.bg }}>
              {glass && <>
                <div className="absolute -left-4 -top-6 size-16 rounded-full opacity-70 blur-xl" style={{ backgroundColor: c.p }} />
                <div className="absolute -bottom-6 right-0 size-16 rounded-full opacity-40 blur-xl" style={{ backgroundColor: dark ? "#6ea8ff" : "#ff9ac2" }} />
              </>}
              <div className="absolute left-2 top-2 h-1.5 w-7 rounded-full" style={{ backgroundColor: c.p }} />
              <div className={cn("absolute bottom-2 left-2 right-2 h-9", glass ? "rounded-xl" : "rounded")}
                style={glass
                  ? { background: dark ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.62)", backdropFilter: "blur(8px)", boxShadow: `inset 0 1px 0 rgba(255,255,255,${dark ? ".18" : ".9"}), 0 6px 14px -6px rgba(0,0,0,.25)` }
                  : { background: dark ? "rgba(255,255,255,.07)" : "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.12)" }} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 px-0.5 text-sm font-medium">{o.label}{on && <Check className="ml-auto size-3.5 text-primary" />}</p>
            <p className="px-0.5 text-xs text-muted-foreground">{o.blurb}</p>
          </button>
        );
      })}
    </div>
  );
}
