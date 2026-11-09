"use client";
import Link from "next/link";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseChip } from "@/components/ui/course-chip";
import { classesOnWeekday } from "@/lib/course-info/view";
import { courseHex } from "@/lib/utils/colors";
import type { CourseInfo } from "@/lib/course-info/schemas";

const KIND: Record<string, string> = { lecture: "Lecture", lab: "Lab", discussion: "Discussion", recitation: "Recitation" };

/** Today's classes from the meeting times read from Canvas. Uses the browser's weekday so it matches the student's day. */
export function TodayClasses({ items, courses }: { items: { courseId: string; meetings: CourseInfo["meetings"] }[]; courses: { id: string; label: string; color: string }[] }) {
  const [day] = useState(() => new Date().getDay());
  const list = classesOnWeekday(items, day);
  if (list.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Today&apos;s classes</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {list.map((c, i) => {
          const course = courses.find((x) => x.id === c.courseId);
          return (
            <Link key={i} href={`/courses/${c.courseId}?tab=info`} className="flex gap-3 rounded-lg border p-2.5 transition-colors hover:bg-accent/50" style={{ boxShadow: `inset 3px 0 0 ${courseHex(course?.color)}` }}>
              <div className="w-[4.5rem] shrink-0 text-[13px] font-medium tabular-nums leading-tight text-muted-foreground">{c.time ?? "Time TBA"}</div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium"><CourseChip color={course?.color} label={course?.label ?? "Course"} />{KIND[c.kind] ?? c.kind}</p>
                {c.location && <p className="mt-1 flex items-center gap-1 truncate text-[13px] text-muted-foreground"><MapPin className="size-3.5 shrink-0" />{c.location}</p>}
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
