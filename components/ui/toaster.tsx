"use client";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/lib/theme";

export function Toaster() {
  const { resolved } = useTheme();
  return <Sonner position="bottom-right" richColors closeButton theme={resolved} />;
}
