/**
 * Preset anatomy spec for human subjects in photoreal renders.
 *
 * The classic AI tells: extra fingers, merged ears, misaligned eyes,
 * teeth wrong count. This preset checks each one explicitly so the
 * gate can fail before downstream stages waste compute on bad refs.
 */
import type { AnatomySpec } from "../gates/anatomy.js";

export const HUMAN_ANATOMY: AnatomySpec = {
  name: "human",
  questions: [
    {
      key: "hand_anatomy",
      question: `Look at any visible hands. How many fingers are visible per hand (count only clearly distinct fingers)? If no hands are visible, answer "no_hands_visible". Otherwise answer with one of: "five_per_hand", "more_than_five", "fewer_than_five", "merged_or_unclear".`,
      acceptableAnswers: ["five_per_hand", "no_hands_visible"],
      failMessage: "hands should have exactly 5 fingers each, not extras or merged digits",
    },
    {
      key: "eye_alignment",
      question: `Are the two eyes symmetric and aligned at the same height? Use one of: "aligned_symmetric", "misaligned", "one_eye_distorted", "no_eyes_visible".`,
      acceptableAnswers: ["aligned_symmetric", "no_eyes_visible"],
      failMessage: "eyes should be symmetric and aligned",
    },
    {
      key: "ear_count",
      question: `How many ears are visible and what's their state? Use one of: "two_normal_ears", "one_ear_visible_other_occluded", "merged_with_hair", "extra_ear", "deformed".`,
      acceptableAnswers: ["two_normal_ears", "one_ear_visible_other_occluded"],
      failMessage: "ears should be normal pair (one may be occluded by hair)",
    },
    {
      key: "teeth_visible",
      question: `If teeth are visible, do they look like normal human teeth (consistent count, proper alignment)? Use one of: "normal_human_teeth", "no_teeth_visible", "deformed_teeth", "wrong_count".`,
      acceptableAnswers: ["normal_human_teeth", "no_teeth_visible"],
      failMessage: "teeth should be normal human anatomy if visible",
    },
    {
      key: "visible_artifacts",
      question: `List any AI-generation artifacts you see (mangled fingers, merged limbs, fabric phasing, hairline glitches, missing parts). If none, write "none".`,
      acceptableAnswers: ["none"],
      failMessage: "render has visible AI artifacts",
    },
  ],
};
