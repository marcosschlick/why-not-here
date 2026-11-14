export const STUDY_GROUPS = [
  "cost_based",
  "contrastive_text",
  "contrastive_visual",
] as const;
export type StudyGroup = (typeof STUDY_GROUPS)[number];
export const GROUP_LABELS: Record<StudyGroup, string> = {
  cost_based: "Cost-based justification",
  contrastive_text: "Contrastive text",
  contrastive_visual: "Contrastive text + interventions",
};
