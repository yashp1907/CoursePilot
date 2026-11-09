import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { AuthForm } from "@/components/layout/auth-form";
import { signup } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Your courses, deadlines, and grades in one private place."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Log in</Link></>}
    >
      <AuthForm
        action={signup}
        submitLabel="Create account"
        fields={[
          { name: "full_name", label: "Name", autoComplete: "name", placeholder: "Alex Johnson" },
          { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@university.edu" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
        ]}
      />
    </AuthShell>
  );
}
