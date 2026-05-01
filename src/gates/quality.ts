/**
 * Quality scorer — rank multiple renders by a configurable rubric.
 *
 * Designed for tie-breaking: when multiple candidates pass a binary gate
 * (identity, anatomy, framing), score each one and pick the highest.
 * Only run this AFTER candidates pass binary gates — it's expensive and
 * doesn't catch broken renders, just ranks among working ones.
 *
 * The default rubric (10 aspects, 1-10 each, total 0-100) is opinionated
 * for cinematic photoreal portraits. Pass a custom rubric for other
 * domains (anime, product shots, architecture, etc).
 */
import { askVlm } from "../vlm-client.js";
import type { VlmClientConfig } from "../types.js";

/** Single aspect to rate. */
export interface QualityAspect {
  /** Key in the response JSON. Stable id. */
  key: string;
  /** Description shown to the VLM. Be specific about what makes 1 vs 10. */
  description: string;
}

/** Configurable rubric for quality scoring. */
export interface QualityRubric {
  /** Aspects to rate. Each scored 1-10. */
  aspects: QualityAspect[];
  /** Optional: max score per aspect. Default 10. */
  maxPerAspect?: number;
}

/** Result of a single image's quality scoring. */
export interface QualityScore {
  /** Sum across all aspects. Max = aspects.length * maxPerAspect. */
  total: number;
  /** Max possible total (for normalization to 0-1). */
  maxTotal: number;
  /** Per-aspect scores (key -> 1..maxPerAspect). */
  scores: Record<string, number>;
  /** VLM's one-line note on strongest+weakest aspect. */
  notes: string;
  /** Raw VLM response for debugging. */
  raw: string;
}

/** Default rubric: cinematic photoreal portraits. 10 aspects × 10 = 100 max. */
export const PHOTOREAL_PORTRAIT_RUBRIC: QualityRubric = {
  aspects: [
    { key: "skin_texture",            description: "Visible micro-pores, subsurface scattering, no plastic look. 1=plastic, 10=hasselblad-grade." },
    { key: "eye_detail",              description: "Catchlight present, iris detail visible, NO blue-eye-default-AI tell. 1=dead doll eyes, 10=alive." },
    { key: "lighting_cinematography", description: "Directional rim/key light, deliberate shadow falloff, dramatic mood. 1=flat, 10=Roger Deakins." },
    { key: "composition_framing",     description: "Rule of thirds, depth, intentional negative space. 1=centered/snapshot, 10=film-grade." },
    { key: "wardrobe_detail",         description: "Fabric weave, leather grain, weathering authentic at pixel level. 1=blob, 10=museum." },
    { key: "absence_of_artifacts",    description: "No extra fingers, merged limbs, fabric phasing, hairline glitches. 1=many tells, 10=clean." },
    { key: "color_grading",           description: "Filmic palette, no flat-digital look, deliberate warmth/coolness. 1=raw default, 10=DI-graded." },
    { key: "anatomy_correctness",     description: "Hands, face, proportions look like real anatomy. 1=AI tell, 10=indistinguishable." },
    { key: "identity_consistency",    description: "Looks like the SAME character (vs prior shots / reference). 1=drift, 10=locked." },
    { key: "overall_masterpiece_bar", description: "Would a paying client mistake this for a film still? 1=clearly AI, 10=ship it." },
  ],
};

const QUALITY_SYSTEM = `You are a precise visual critic for cinematic photoreal images. Rate each aspect on a 1-10 integer scale where 1 is unusable and 10 is shipped-grade. Reserve 9-10 for genuinely outstanding work — be honest, not generous. Output ONLY JSON.`;

function buildQualityPrompt(rubric: QualityRubric): string {
  const max = rubric.maxPerAspect ?? 10;
  const items = rubric.aspects.map((a, i) => `${i + 1}. ${a.key}: ${a.description}`).join("\n");
  const fields = rubric.aspects.map(a => `    "${a.key}": <1-${max}>`).join(",\n");
  return `Rate this image on each aspect (1-${max} each):

${items}

Then add a one-sentence note describing the strongest AND weakest aspect.

Respond with ONLY this JSON (numbers as integers):
{
  "scores": {
${fields}
  },
  "notes": "<one short sentence>"
}`;
}

/** Score one image against a rubric. Single-VLM call (cheap; use after
 *  binary gates have already filtered out broken renders). */
export async function scoreImageQuality(params: {
  imagePath: string;
  model: string;
  rubric?: QualityRubric;
  config?: VlmClientConfig;
}): Promise<QualityScore> {
  const { imagePath, model, rubric = PHOTOREAL_PORTRAIT_RUBRIC, config } = params;
  const maxPerAspect = rubric.maxPerAspect ?? 10;
  const maxTotal = rubric.aspects.length * maxPerAspect;

  const a = await askVlm({
    model,
    imagePath,
    prompt: buildQualityPrompt(rubric),
    system: QUALITY_SYSTEM,
    config,
  });

  // The "answers" wrapper from askVlm may not match this shape exactly because
  // we used a different output schema. Re-parse the raw response.
  let parsed: { scores?: Record<string, number>; notes?: string } | null = null;
  try { parsed = JSON.parse(a.raw); } catch {
    // Already extracted in askVlm if possible; if not parseable here, leave null
    parsed = null;
  }
  const rawScores = (parsed?.scores ?? {}) as Record<string, unknown>;
  const scores: Record<string, number> = {};
  let total = 0;
  for (const aspect of rubric.aspects) {
    const v = rawScores[aspect.key];
    const n = typeof v === "number" ? v : Number(v);
    const clamped = Number.isFinite(n) ? Math.max(0, Math.min(maxPerAspect, Math.round(n))) : 0;
    scores[aspect.key] = clamped;
    total += clamped;
  }

  return {
    total,
    maxTotal,
    scores,
    notes: parsed?.notes ?? "",
    raw: a.raw,
  };
}

/** Pick the best of several images. Scores each and returns the highest.
 *  Ties broken by input order (first-rendered wins, reproducible). */
export async function pickBestByQuality(params: {
  imagePaths: string[];
  model: string;
  rubric?: QualityRubric;
  config?: VlmClientConfig;
}): Promise<{ winner: string; allScores: Array<{ path: string; score: QualityScore }> }> {
  const { imagePaths, model, rubric, config } = params;
  if (imagePaths.length === 0) throw new Error("pickBestByQuality: no images provided");

  const allScores: Array<{ path: string; score: QualityScore }> = [];
  for (const p of imagePaths) {
    const score = await scoreImageQuality({ imagePath: p, model, rubric, config });
    allScores.push({ path: p, score });
  }

  // Sort descending by total. Stable sort means input order is the tie-breaker.
  const sorted = [...allScores].sort((a, b) => b.score.total - a.score.total);
  return { winner: sorted[0].path, allScores };
}
