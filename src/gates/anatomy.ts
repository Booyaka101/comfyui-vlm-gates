/**
 * Anatomy gate — verify generated subjects have correct anatomy per a spec.
 *
 * Generalized version of what was originally orc-specific (tusks, skin color,
 * fingers). Pass an `AnatomySpec` with open-ended questions and validation
 * rules; the gate runs them through multi-VLM consensus and reports
 * specific failures.
 *
 * For the orc preset see `presets/orc-anatomy.ts`. For human anatomy see
 * `presets/human-anatomy.ts`. Build your own for other races / domains.
 */
import { askVlm } from "../vlm-client.js";
import { tallyVotes, majorityIn, buildVoteAudit } from "../consensus.js";
import type { ConsensusVerdict, VlmAnswer, VlmClientConfig, ReliabilityMatrix } from "../types.js";

/** A single anatomy question. The VLM gives an open-ended answer (one of
 *  the listed `acceptableAnswers` keys, or anything else if none match).
 *  Validation: gate fails if majority answer is NOT in `acceptableAnswers`. */
export interface AnatomyQuestion {
  /** Stable id. */
  key: string;
  /** Open-ended question (avoid yes/no — see ../README.md on bias). */
  question: string;
  /** Answers that count as "passing" for this question. Lowercase. */
  acceptableAnswers: string[];
  /** Optional: human-readable description for failure messages. */
  failMessage?: string;
}

/** Anatomy spec — set of questions + reliability matrix. */
export interface AnatomySpec {
  /** Name for logging. */
  name: string;
  questions: AnatomyQuestion[];
  /** Optional: per-(model, question) reliability flags. False excludes vote. */
  reliability?: ReliabilityMatrix;
}

const ANATOMY_SYSTEM = `You are a precise visual observer. Describe exactly what you see in the image. Do not infer correctness or intent — just answer the literal question concretely. Output ONLY JSON.`;

function buildAnatomyPrompt(spec: AnatomySpec): string {
  const items = spec.questions.map((q, i) => `${i + 1}. ${q.key}: ${q.question}`).join("\n");
  const fields = spec.questions.map(q => `    "${q.key}": "<value>"`).join(",\n");
  return `Examine the visible features of the subject in the image. Answer each question by describing what you literally observe.

Questions:
${items}

Respond with ONLY this JSON, no other prose:
{
  "answers": {
${fields}
  }
}`;
}

/** Run the anatomy gate against one image using one or more VLMs.
 *  Multi-VLM consensus with reliability filtering. */
export async function gradeAnatomy(params: {
  imagePath: string;
  spec: AnatomySpec;
  models: string[];
  config?: VlmClientConfig;
}): Promise<ConsensusVerdict> {
  const { imagePath, spec, models, config } = params;
  if (models.length === 0) throw new Error("gradeAnatomy requires at least one VLM model");

  const prompt = buildAnatomyPrompt(spec);
  const answers: VlmAnswer[] = [];
  const errors: string[] = [];

  for (const model of models) {
    try {
      const a = await askVlm({ model, imagePath, prompt, system: ANATOMY_SYSTEM, config });
      answers.push(a);
    } catch (e) {
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  if (answers.length === 0) {
    throw new Error(`all ${models.length} VLMs failed:\n  ${errors.join("\n  ")}`);
  }

  const failures: string[] = [];
  const questionKeys = spec.questions.map(q => q.key);
  const audit = buildVoteAudit(questionKeys, answers);

  for (const q of spec.questions) {
    const votes = tallyVotes(q.key, answers, spec.reliability);
    if (votes.size === 0) {
      failures.push(`${q.key}: no votes (no reliable VLMs answered)`);
      continue;
    }
    const passed = majorityIn(votes, q.acceptableAnswers);
    if (!passed) {
      const voteStr = [...votes.entries()].map(([ans, n]) => `${ans}=${n}`).join(", ");
      const msg = q.failMessage ?? q.question;
      failures.push(`${q.key}: ${msg} | got [${voteStr}], expected one of [${q.acceptableAnswers.join(", ")}]`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    perQuestionVotes: audit,
    perModel: answers,
  };
}
