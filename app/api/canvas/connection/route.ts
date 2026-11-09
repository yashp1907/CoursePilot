import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRouteUser } from "@/lib/canvas/route-helpers";

/** Disconnect Canvas. Imported courses/assignments stay in CoursePilot; only the stored credentials are removed. */
export async function DELETE() {
  const { supabase, user } = await requireRouteUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const { error } = await supabase.from("canvas_connections").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
