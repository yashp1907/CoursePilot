import { BarChart3, BookOpen, Bot, CalendarDays, CheckSquare, Gauge, GraduationCap, Plug, Settings, Sparkles, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; hint?: string }
export interface NavSection { title: string; items: NavItem[] }

export const NAV: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: Gauge, hint: "Your week at a glance" },
      { href: "/courses", label: "My Courses", icon: BookOpen, hint: "Courses, syllabi and grades per course" },
      { href: "/assignments", label: "Assignments", icon: CheckSquare, hint: "List, board and calendar views" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, hint: "Everything by date" },
      { href: "/grades", label: "Grades", icon: GraduationCap, hint: "Current grades, what-ifs, GPA simulator" },
      { href: "/planner", label: "Study Planner", icon: Sparkles, hint: "Plan your week" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/assistant", label: "AI Assistant", icon: Bot, hint: "Ask about your courses" },
      { href: "/insights", label: "Insights", icon: BarChart3, hint: "Trends and risk indicators" },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug, hint: "Connect Canvas" },
      { href: "/settings", label: "Settings", icon: Settings, hint: "Profile and preferences" },
    ],
  },
];

// Four primary tabs; everything else lives behind "More" (the full menu).
export const MOBILE_TABS = [NAV[0].items[0], NAV[0].items[1], NAV[0].items[2], NAV[0].items[3]];
