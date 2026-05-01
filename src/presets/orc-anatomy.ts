/**
 * Preset anatomy spec for orc subjects in fantasy/MMO renders.
 *
 * Built around real-world bias-calibration findings:
 *   - qwen3-vl:32b is unreliable on tusk anatomy (cartoon-orc prior overrides
 *     literal observation). Excluded from tusk_root_position via reliability.
 *   - "thin" / "thick" binary forces medium tusks into "thin fang" → false fail.
 *     Use "medium" as an acceptable answer.
 *   - "below_lip" + "at_lip" both pass (closed-mouth lower-jaw tusks emerge
 *     visually at the lip line — that's the correct anatomy).
 */
import type { AnatomySpec } from "../gates/anatomy.js";

export const ORC_ANATOMY: AnatomySpec = {
  name: "orc",
  questions: [
    {
      key: "tusk_root_position",
      question: `For each visible tusk, where is the root (the gum/jaw attachment point)? Use one of: "below_lip" (root is below the closed-lip line — tusk grows up from the lower jaw), "above_lip" (root is above the closed-lip line — tusk hangs down from the upper jaw), "at_lip" (root coincides with the lip line, ambiguous), "no_tusks_visible".`,
      acceptableAnswers: ["below_lip", "at_lip", "no_tusks_visible"],
      failMessage: "tusks should be rooted in lower jaw (boar-style), not hanging from upper jaw (vampire-fang)",
    },
    {
      key: "tusk_tip_direction",
      question: `Do the visible tusk tips point UP (toward the nose/eyes), DOWN (toward the chin), or HORIZONTAL (toward the cheeks)? Use one of: "up", "down", "horizontal".`,
      acceptableAnswers: ["up", "horizontal", ""],
      failMessage: "tusk tips should point upward, not down (vampire-fang style)",
    },
    {
      key: "tusk_thickness",
      question: `Are the visible tusks thick like wild boar tusks, thin like vampire fangs, or medium-sized? Use one of: "thick_boar_style", "thin_fang_style", "medium".`,
      acceptableAnswers: ["thick_boar_style", "medium", ""],
      failMessage: "tusks should be thick boar-style or medium, not thin vampire fangs",
    },
    {
      key: "skin_color",
      question: `What single color word best describes the character's skin? (e.g. green, blue, gray, beige).`,
      acceptableAnswers: ["green"],
      failMessage: "skin should be green for orc subjects",
    },
    {
      key: "visible_artifacts",
      question: `List any AI-generation artifacts you see (extra fingers, distorted features, mismatched eyes, weird textures). If none, write "none".`,
      acceptableAnswers: ["none"],
      failMessage: "render has visible AI artifacts",
    },
  ],
  reliability: {
    // qwen3-vl:32b has a cartoon-orc prior that incorrectly classifies tusk_root_position.
    // Calibrated against ground-truth warthog reference photos that the model still
    // misidentifies. Excluded from tusk anatomy votes; trusted on skin/artifacts.
    "qwen3-vl:32b": {
      tusk_root_position: false,
      tusk_tip_direction: false,
    },
    // llama3.2-vision can't resolve fine facial features at typical render sizes.
    "llama3.2-vision:11b": {
      tusk_root_position: false,
      tusk_tip_direction: false,
      tusk_thickness: false,
    },
  },
};
