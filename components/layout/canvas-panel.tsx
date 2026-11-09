"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, ExternalLink, Link2, Puzzle, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { summarizeSync, syncCanvas } from "@/lib/canvas/client-sync";
import { pingExtension, type ExtensionInfo, type Progress } from "@/lib/canvas/extension-bridge";
import type { SyncSummary } from "@/lib/canvas/sync";

export interface SyncRow { id: string; status: string; summary: Partial<SyncSummary> | null; error: string | null; started_at: string; finished_at: string | null }
interface Props {
  connection: { base_url: string; auth_type: string; status: string; last_synced_at: string | null } | null;
  history: SyncRow[]; oauthConfigured: boolean; defaultBaseUrl: string; flash: { error?: string; connected?: boolean };
}

const METHOD_LABEL: Record<string, string> = { oauth: "OAuth", token: "access token", extension: "browser extension" };

export function CanvasPanel({ connection, history, oauthConfigured, defaultBaseUrl, flash }: Props) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | undefined>(flash.error);
  const [last, setLast] = useState<SyncSummary | null>(null);
  const [ext, setExt] = useState<ExtensionInfo | null | undefined>(undefined); // undefined = checking
  const [progress, setProgress] = useState<Progress | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);

  useEffect(() => { pingExtension(1200).then(setExt); }, []);

  const viaExtension = connection?.auth_type === "extension";

  async function sync(method: "api" | "extension") {
    setBusy("sync"); setError(undefined); setProgress(null); setInfoText(null);
    const r = await syncCanvas(method, { onProgress: setProgress, onInfoProgress: (label) => setInfoText(`Reading ${label} course pages…`) });
    setBusy(null); setProgress(null); setInfoText(null);
    if (r.ok && r.info?.error) toast.error(`Course pages: ${r.info.error}`);
    if (r.ok) { setLast(r.summary); toast.success(`Canvas synced: ${summarizeSync(r.summary)}`); } else setError(r.error);
    router.refresh();
  }

  async function connectToken(e: React.FormEvent) {
    e.preventDefault(); setBusy("connect"); setError(undefined);
    try {
      const res = await fetch("/api/canvas/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl, token }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Couldn't connect to Canvas."); return; }
      setToken(""); toast.success(`Connected to Canvas${j.name ? ` as ${j.name}` : ""}. Syncing…`);
      router.refresh();
      await sync("api");
    } finally { setBusy(null); }
  }

  async function disconnect() {
    if (!confirm("Disconnect Canvas? Your imported courses, assignments and grades stay in CoursePilot. Only the saved connection is removed.")) return;
    setBusy("disconnect");
    const res = await fetch("/api/canvas/connection", { method: "DELETE" });
    setBusy(null);
    if (res.ok) { toast.success("Canvas disconnected"); router.refresh(); } else toast.error("Couldn't disconnect. Try again.");
  }

  const expired = connection?.status === "expired" || connection?.status === "error";
  const extReady = !!ext && ext.granted && !!ext.canvasOrigin;
  const progressText = infoText ?? (progress ? (progress.total ? `${progress.label} (${Math.min(progress.step + 1, progress.total)}/${progress.total})` : progress.label) : "Starting…");

  return (
    <div className="max-w-3xl space-y-5">
      {(error || flash.connected) && (
        <div className={`flex gap-2 rounded-lg border p-3 text-sm ${error ? "border-destructive/30 bg-red-500/5 text-destructive" : "border-green-600/30 bg-green-500/5 text-success"}`} role={error ? "alert" : "status"}>
          {error ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          {error ?? "Canvas connected. Run your first sync below."}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">Canvas LMS{connection && <Badge variant={expired ? "danger" : "success"}>{expired ? "Needs reconnecting" : "Connected"}</Badge>}</CardTitle>
            <CardDescription>{connection ? `${connection.base_url} · via ${METHOD_LABEL[connection.auth_type] ?? connection.auth_type}${connection.last_synced_at ? ` · last synced ${formatDistanceToNow(new Date(connection.last_synced_at), { addSuffix: true })}` : " · not synced yet"}` : "Import your courses, assignments, deadlines and posted grades. CoursePilot works fine without it."}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connection && !expired && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => sync(viaExtension ? "extension" : "api")} loading={busy === "sync"} disabled={viaExtension && ext === null}><RefreshCw /> Sync now</Button>
              <Button variant="ghost" className="text-destructive" onClick={disconnect} loading={busy === "disconnect"}><Unplug /> Disconnect</Button>
              {busy === "sync" && viaExtension && <span className="text-xs text-muted-foreground">{infoText ? progressText : `Fetching ${progressText}`}</span>}
              {viaExtension && ext === null && <span className="text-xs text-warning">Extension not detected in this browser. Open this page in Chrome with the extension installed.</span>}
            </div>
          )}

          {(!connection || expired) && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium"><Puzzle className="size-4 text-primary" /> Browser extension <span className="font-normal text-muted-foreground">(use this if your school blocks access tokens)</span></p>
                  {ext === undefined ? <Badge>Checking…</Badge> : ext ? <Badge variant={extReady ? "success" : "warning"}>{extReady ? `Ready · v${ext.version}` : `Installed · v${ext.version}, needs setup`}</Badge> : <Badge variant="outline">Not detected</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">The extension reads <b>your own</b> Canvas data through the Canvas session you&apos;re already logged into, the same way the Canvas website does. It&apos;s read-only, asks Chrome for access to just your school&apos;s Canvas address, and sends your data only to this CoursePilot tab. Your Canvas password and cookies never leave your browser.</p>
                {!extReady && (
                  <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                    <li>In Chrome, open <code className="rounded bg-muted px-1">chrome://extensions</code>, turn on <b>Developer mode</b>, click <b>Load unpacked</b>, and choose the <code className="rounded bg-muted px-1">extension</code> folder of this project.</li>
                    <li>Click the extension&apos;s icon, enter your school&apos;s Canvas address, and click <b>Grant access &amp; save</b>. Make sure you&apos;re logged into Canvas in this browser.</li>
                    <li><b>Reload this page</b>, then click Sync below.</li>
                  </ol>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => sync("extension")} loading={busy === "sync"} disabled={!extReady}><RefreshCw /> {expired ? "Reconnect & sync" : "Sync with extension"}</Button>
                  {busy === "sync" && <span className="text-xs text-muted-foreground">{infoText ? progressText : `Fetching ${progressText}`}</span>}
                  {ext && !ext.granted && <span className="text-xs text-warning">Finish step 2 in the extension popup.</span>}
                </div>
              </div>

              {oauthConfigured && (
                <div className="space-y-2 rounded-lg border p-4">
                  <p className="text-sm font-medium">Sign in with Canvas</p>
                  <p className="text-xs text-muted-foreground">You&apos;ll log in on your school&apos;s Canvas page. CoursePilot never sees your password.</p>
                  <form action="/api/canvas/oauth/start" method="get" className="flex flex-wrap items-end gap-2">
                    <Field label="Canvas URL" className="min-w-60 flex-1"><Input name="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://canvas.youruniversity.edu" required /></Field>
                    <Button type="submit"><Link2 /> Continue to Canvas</Button>
                  </form>
                </div>
              )}

              <details className="rounded-lg border p-4">
                <summary className="cursor-pointer text-sm font-medium">Use an access token instead <span className="font-normal text-muted-foreground">(only if your school allows them)</span></summary>
                <form onSubmit={connectToken} className="mt-3 space-y-3">
                  <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
                    <li>In Canvas, open <b>Account → Settings</b> → <b>Approved Integrations</b> → <b>+ New Access Token</b>.</li>
                    <li>If that button is greyed out, your school restricts tokens. Use the extension above, or ask your Canvas administrators to generate one for you.</li>
                    <li>Copy the token (shown once) and paste it below. It&apos;s encrypted before it&apos;s stored and only used on the server.</li>
                  </ol>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Canvas URL"><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://canvas.youruniversity.edu" required /></Field>
                    <Field label="Access token"><Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste token" required /></Field>
                  </div>
                  <Button type="submit" loading={busy === "connect"}>Connect with token</Button>
                </form>
              </details>
            </div>
          )}

          {last && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">Last sync: {summarizeSync(last)}</p>
              <p className="text-xs text-muted-foreground">{last.courses} course{last.courses === 1 ? "" : "s"} checked{last.coursesCreated ? `, ${last.coursesCreated} created` : ""}{last.announcements ? `, ${last.announcements} announcements` : ""}.</p>
              {[...last.conflicts, ...last.notes, ...last.errors].length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{[...last.conflicts, ...last.notes, ...last.errors].slice(0, 12).map((n, i) => <li key={i}>{n}</li>)}</ul>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>How syncing works</CardTitle></div></CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>• Canvas assignments are added once (never duplicated) and updated when Canvas changes them.</p>
          <p>• If you edited a title, due date or other field yourself, CoursePilot keeps <i>your</i> value and tells you about the conflict.</p>
          <p>• Changed deadlines appear in your notifications. Past values are kept in each assignment&apos;s history.</p>
          <p>• Grades come from what Canvas has published. A grade you typed in yourself is never overwritten silently.</p>
          <p>• Assignments removed from Canvas are kept here, not deleted.</p>
          <p>• Each sync also reads every course&apos;s syllabus tab, home page, key pages, staff list (instructors and TAs only, never students), calendar, tools and modules, so class times, teaching team, office hours and links show up under each course&apos;s <b>Course info</b> tab and the assistant can answer questions about them.</p>
          {viaExtension && <p>• With the extension, syncing runs from your browser: it happens when you press Sync, or automatically when you open CoursePilot (with Canvas logged in) and it has been a few hours.</p>}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader><div><CardTitle>Sync history</CardTitle></div></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex items-center gap-2"><Badge variant={h.status === "success" ? "success" : h.status === "failed" ? "danger" : h.status === "partial" ? "warning" : "default"}>{h.status}</Badge>
                    <span className="text-muted-foreground">{h.status === "failed" ? h.error : h.summary ? summarizeSync(h.summary as SyncSummary) : "In progress"}</span></span>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(h.started_at), { addSuffix: true })}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground"><ExternalLink className="mr-1 inline size-3" />Google Calendar sync is planned for a later release.</p>
    </div>
  );
}
