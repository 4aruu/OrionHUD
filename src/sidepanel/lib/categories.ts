export const JOB_CATEGORIES = [
  { id: "software", label: "Software", icon: "💻" },
  { id: "cloud", label: "Cloud / DevOps", icon: "☁️" },
  { id: "data", label: "Data & ML", icon: "📊" },
  { id: "design", label: "Design / UX", icon: "🎨" },
  { id: "research", label: "Research", icon: "🔬" },
  { id: "security", label: "Security", icon: "🔒" },
  { id: "management", label: "Management", icon: "📋" },
  { id: "custom", label: "Other", icon: "✨" },
] as const;

export type CategoryId = (typeof JOB_CATEGORIES)[number]["id"];

const SOCIAL = ["reddit.com", "youtube.com", "x.com", "twitter.com"];

export const CATEGORY_DISTRACTIONS: Record<CategoryId, string[]> = {
  software: SOCIAL,
  cloud: SOCIAL,
  data: SOCIAL,
  design: [...SOCIAL, "instagram.com"],
  research: [...SOCIAL, "facebook.com"],
  security: SOCIAL,
  management: SOCIAL,
  custom: [],
};

export function categoryOf(id: string | undefined) {
  return JOB_CATEGORIES.find((c) => c.id === id);
}
