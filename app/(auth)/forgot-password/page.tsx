import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { AuthForm } from "@/components/layout/auth-form";
import { requestPasswordReset } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one." footer={<Link href="/login" className="font-medium text-primary hover:underline">Back to log in</Link>}>
      <AuthForm action={requestPasswordReset} submitLabel="Send reset link" fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]} />
    </AuthShell>
  );
}
