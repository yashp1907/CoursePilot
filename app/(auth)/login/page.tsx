import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { AuthForm } from "@/components/layout/auth-form";
import { login } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your CoursePilot workspace."
      footer={<>New to CoursePilot? <Link href="/signup" className="font-medium text-primary hover:underline">Create an account</Link></>}
    >
      <AuthForm
        action={login}
        submitLabel="Log in"
        initialError={error === "link" ? "That link is invalid or has expired. Please try again." : undefined}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@university.edu" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-4 text-center text-sm"><Link href="/forgot-password" className="text-muted-foreground hover:text-foreground hover:underline">Forgot your password?</Link></p>
    </AuthShell>
  );
}
