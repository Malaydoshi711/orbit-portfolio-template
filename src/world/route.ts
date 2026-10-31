/* Where each section sits along the descent (0 = high orbit, 1 = landed at home).
 * App maps scroll position to this progress value with one anchor per section;
 * World uses the same numbers for camera keyframes and scene moments.
 * A section that has no content (for example no publications) is simply not
 * rendered, and its anchor drops out. */
export const ROUTE_AT = {
  about: 0.11,
  experience: 0.225,
  research: 0.345,
  flagship: 0.5,
  reentry: 0.6,
  projects: 0.72,
  toolkit: 0.86,
  contact: 0.97,
} as const;

export type SectionId = keyof typeof ROUTE_AT;

/** tall sections hold the camera over a range instead of a single point */
export const SPAN: Partial<Record<SectionId, number>> = { research: 0.035, projects: 0.06 };

/** orbit ends and the ground world begins here, hidden inside the cloud layer */
export const SWITCH_AT = 0.6;
