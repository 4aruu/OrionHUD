// The animation engine for LazyMotion, split into its own chunk: the panel
// paints without it, and it arrives a moment later (a local file, no network).
export { domAnimation as default } from "motion/react";
