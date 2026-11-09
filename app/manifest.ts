import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "CoursePilot",
    short_name: "CoursePilot",
    description: "Your entire semester, under control: courses, deadlines, grades and an AI study assistant.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1014",
    theme_color: "#3d52e0",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Assignments", short_name: "Tasks", url: "/assignments", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Calendar", url: "/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "AI Assistant", short_name: "Assistant", url: "/assistant", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Grades", url: "/grades", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
