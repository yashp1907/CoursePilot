import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/helpers";

/** Run a server action from a client component, toasting errors. Returns the result data or null on failure. */
export async function run<T>(p: Promise<ActionResult<T>>, success?: string): Promise<{ ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  try {
    const r = await p;
    if (!r.ok) toast.error(r.error);
    else if (success) toast.success(success);
    return r;
  } catch {
    toast.error("Something went wrong. Please try again.");
    return { ok: false, error: "Request failed." };
  }
}
