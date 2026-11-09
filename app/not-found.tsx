import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo className="mb-8" />
      <h1 className="text-lg font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or the link is wrong.</p>
      <Button asChild className="mt-5"><Link href="/dashboard">Back to overview</Link></Button>
    </main>
  );
}
