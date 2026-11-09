"use client";
import Link from "next/link";
import { useState } from "react";

/**
 * A Link that fully prefetches the destination (its data too) as soon as you hover, focus or touch it.
 * Until then it behaves like a normal Link (prefetching just the page shell, so the skeleton paints instantly).
 * By the time most clicks land, the page is already loaded.
 */
export function NavLink({ onMouseEnter, onFocus, onTouchStart, prefetch, ...rest }: React.ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...rest}
      prefetch={intent ? true : prefetch}
      onMouseEnter={(e) => { setIntent(true); onMouseEnter?.(e); }}
      onFocus={(e) => { setIntent(true); onFocus?.(e); }}
      onTouchStart={(e) => { setIntent(true); onTouchStart?.(e); }}
    />
  );
}
