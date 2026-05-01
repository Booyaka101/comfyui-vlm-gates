/**
 * Framing gate — verify a render's shot composition matches a stated intent.
 *
 * Catches:
 *   - "extreme close-up on eyes" rendering as a medium shot
 *   - "wide establishing shot" rendering as a portrait
 *   - "back of head, no face visible" rendering with face visible
 *   - "two-shot, both characters" rendering only one
 *
 * The gate asks the VLM open-ended questions about what's actually in frame
 * (shot type, subject count, subject facing) and compares against intent.
 */
import { askVlm } from "../vlm-client.js";
import type { VlmAnswer, VlmClientConfig } from "../types.js";

/** Stated intent for a shot — what the render SHOULD show. */
export interface FramingIntent {
  /** Free-form description of what was requested. The VLM compares
   *  observation to this. E.g. "extreme close-up on the eyes only,
   *  no shoulders, top-of-nose framing". */
  description: string;
}

/** What the VLM observed. Each field is the VLM's literal answer. */
export interface FramingObservation {
  model: string;
  shot_type: string;       // "extreme close-up" | "close-up" | "medium" | "wide" | etc
  subject_count: string;   // numeric or text count
  subject_facing: string;  // "toward camera" | "away" | "left profile" | etc
  match_intent: string;    // "matches" | "mismatch"
  match_reason: string;    // one-line VLM rationale
  raw: string;
}

/** Verdict: does the render's framing match the intent? */
export interface FramingVerdict {
  passed: boolean;
  failures: string[];
  observations: FramingObservation[];
}

const FRAMING_SYSTEM = `You are a precise cinematographer evaluating image composition. Describe what you literally see — shot distance, subject count, subject facing direction. Then judge whether the observation matches the stated intent. Output ONLY JSON.`;

function buildFramingPrompt(intent: string): string {
  return `Examine the image and describe its composition objectively.

INTENT (what the renderer was asked to produce): "${intent}"

Answer each:
1. shot_type: how tight is the framing? Use one of: "extreme close-up" (eye-level detail only), "close-up" (face fills frame), "medium close-up" (head and shoulders), "medium" (waist up), "medium wide" (full body), "wide" (figure small in frame), "establishing" (figure dominated by environment).
2. subject_count: how many distinct subjects are visible? A number.
3. subject_facing: which way is the primary subject facing the camera? Use one of: "toward camera", "three-quarter toward", "profile (perpendicular)", "three-quarter away", "fully away (back to camera)".
4. match_intent: does what you observe match the intent? Use one of: "matches", "mismatch".
5. match_reason: one short sentence explaining the match or mismatch.

Respond with ONLY this JSON:
{
  "answers": {
    "shot_type": "<value>",
    "subject_count": "<number>",
    "subject_facing": "<value>",
    "match_intent": "matches | mismatch",
    "match_reason": "<one sentence>"
  }
}`;
}

function answerToObservation(a: VlmAnswer): FramingObservation {
  return {
    model: a.model,
    shot_type:      String(a.answers.shot_type ?? "").toLowerCase(),
    subject_count:  String(a.answers.subject_count ?? ""),
    subject_facing: String(a.answers.subject_facing ?? "").toLowerCase(),
    match_intent:   String(a.answers.match_intent ?? "").toLowerCase(),
    match_reason:   String(a.answers.match_reason ?? ""),
    raw:            a.raw,
  };
}

/** Run the framing gate against one image using one or more VLMs.
 *  Multi-VLM voting: gate fails if majority say "mismatch". */
export async function gradeFraming(params: {
  imagePath: string;
  intent: FramingIntent;
  models: string[];
  config?: VlmClientConfig;
}): Promise<FramingVerdict> {
  const { imagePath, intent, models, config } = params;
  if (models.length === 0) throw new Error("gradeFraming requires at least one VLM model");

  const prompt = buildFramingPrompt(intent.description);
  const observations: FramingObservation[] = [];
  const errors: string[] = [];

  for (const model of models) {
    try {
      const a = await askVlm({ model, imagePath, prompt, system: FRAMING_SYSTEM, config });
      observations.push(answerToObservation(a));
    } catch (e) {
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  if (observations.length === 0) {
    throw new Error(`all ${models.length} VLMs failed:\n  ${errors.join("\n  ")}`);
  }

  const failures: string[] = [];
  const mismatches = observations.filter(o => o.match_intent === "mismatch");
  if (mismatches.length > observations.length / 2) {
    for (const m of mismatches) {
      failures.push(`${m.model} reports mismatch: shot_type=${m.shot_type}, subject_count=${m.subject_count}, facing=${m.subject_facing} (${m.match_reason})`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    observations,
  };
}
