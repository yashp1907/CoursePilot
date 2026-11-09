"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLOR_LABEL, COURSE_COLORS, courseHex } from "@/lib/utils/colors";

/** Palette of named colors plus a custom #rrggbb picker. `value` may be a name or a hex. */
export function CourseColorPicker({ value, onChange, size = "md" }: { value: string; onChange: (v: string) => void; size?: "sm" | "md" }) {
  const hex = courseHex(value);
  const isCustom = !(COURSE_COLORS as readonly string[]).includes(value);
  const dim = size === "sm" ? "size-6" : "size-7";
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Course color">
      {COURSE_COLORS.map((c) => {
        const on = value === c;
        return (
          <button type="button" key={c} role="radio" aria-checked={on} aria-label={COLOR_LABEL[c]} title={COLOR_LABEL[c]} onClick={() => onChange(c)}
            className={cn(dim, "flex items-center justify-center rounded-full ring-offset-2 ring-offset-card transition cursor-pointer hover:scale-110", on && "ring-2 ring-foreground/70")} style={{ backgroundColor: courseHex(c) }}>
            {on && <Check className="size-3.5 text-white" strokeWidth={3} />}
          </button>
        );
      })}
      <label title="Custom color" className={cn(dim, "relative flex cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-input text-muted-foreground transition hover:scale-110", isCustom && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card border-solid")} style={isCustom ? { backgroundColor: hex } : undefined}>
        {isCustom ? <Check className="size-3.5 text-white" strokeWidth={3} /> : <Palette className="size-3.5" />}
        <input type="color" aria-label="Custom color" value={hex} onChange={(e) => onChange(e.target.value.toLowerCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

/** A small round swatch button that opens the picker in a popover. Used on cards for one-click recoloring. */
export function ColorPopover({ value, onChange, label, align = "left" }: { value: string; onChange: (v: string) => void; label: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Change color for ${label}`} aria-expanded={open} title="Change color"
        className="flex size-6 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border transition hover:scale-110 hover:ring-foreground/30 cursor-pointer">
        <span className="size-3 rounded-full" style={{ backgroundColor: courseHex(value) }} />
      </button>
      {open && (
        <div className={cn("absolute z-30 mt-2 w-[13.5rem] rounded-xl border bg-card p-3 shadow-xl", align === "right" ? "right-0" : "left-0")} role="dialog" aria-label="Choose a color">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Color for {label}</p>
          <CourseColorPicker value={value} onChange={onChange} size="sm" />
        </div>
      )}
    </div>
  );
}
