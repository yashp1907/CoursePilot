"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error(error); }, [error]);
  const migration = /relation .* does not exist|column .* does not exist|schema cache/i.test(error.message);
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-red-500/10 text-destructive"><AlertTriangle className="size-5" /></div>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {migration ? "The database looks out of date. Apply the latest migration in supabase/migrations, then reload." : "We couldn't load this page. Your data is safe. Try again, and if it keeps happening, reload or log out and back in."}
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="mt-4 flex justify-center gap-2"><Button onClick={reset}>Try again</Button><Button variant="outline" onClick={() => router.push("/dashboard")}>Go to overview</Button></div>
    </div>
  );
}
