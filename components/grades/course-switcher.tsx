"use client";
import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/input";

export function GradeCourseSwitcher({ courses, selected }: { courses: { id: string; label: string }[]; selected: string }) {
  const router = useRouter();
  return (
    <NativeSelect aria-label="Course for calculator" className="w-auto" value={selected} onChange={(e) => router.push(`/grades?course=${e.target.value}`, { scroll: false })}>
      {courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </NativeSelect>
  );
}
