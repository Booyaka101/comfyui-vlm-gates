/**
 * comfyui-vlm-gates
 *
 * Multi-VLM consensus gates and quality scoring for AI image pipelines.
 *
 * Catches bad renders before they ship by running rendered images through
 * multiple Vision-Language Models (Ollama-compatible) and applying
 * configurable rules: identity feature presence, anatomy correctness,
 * framing match, multi-aspect quality scoring.
 *
 * Designed for diffusion pipelines (Flux, SDXL, Wan, etc) where blind output
 * is the default and quality drift compounds across iterations.
 */

// Core types
export type {
  VlmAnswer,
  ConsensusVerdict,
  VlmClientConfig,
  ReliabilityMatrix,
} from "./types.js";

// VLM client (low-level)
export { askVlm, pingModel, imageToBase64, extractFirstJsonObject } from "./vlm-client.js";

// Consensus voting (low-level)
export { tallyVotes, majorityAnswer, majorityIn, buildVoteAudit } from "./consensus.js";

// Identity gate
export { gradeIdentity } from "./gates/identity.js";
export type { IdentityFeature, CharacterIdentitySpec } from "./gates/identity.js";

// Anatomy gate
export { gradeAnatomy } from "./gates/anatomy.js";
export type { AnatomyQuestion, AnatomySpec } from "./gates/anatomy.js";

// Framing gate
export { gradeFraming } from "./gates/framing.js";
export type { FramingIntent, FramingObservation, FramingVerdict } from "./gates/framing.js";

// Quality scorer
export { scoreImageQuality, pickBestByQuality, PHOTOREAL_PORTRAIT_RUBRIC } from "./gates/quality.js";
export type { QualityAspect, QualityRubric, QualityScore } from "./gates/quality.js";
