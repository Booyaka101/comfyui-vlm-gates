/**
 * Identity gate — verify a rendered character matches an expected feature spec.
 *
 * Use when you have a known character and want to confirm the render is
 * "still that character" (passport-comparable, post-character-LoRA, etc).
 * Each feature is a yes/no question; failures list missing-required or
 * present-forbidden features.
 *
 * Multi-VLM consensus with reliability filtering — see ../consensus.ts.
 */
import { askVlm } from "../vlm-client.js";
import { tallyVotes, majorityIn, buildVoteAudit } from "../consensus.js";
import type { ConsensusVerdict, VlmAnswer, VlmClientConfig, ReliabilityMatrix } from "../types.js";

/** Feature definition for an identity gate.
 *  - `key`: stable id (e.g. "hair_braid")
 *  - `question`: phrased open-endedly to avoid AI bias (see ../README.md)
 *  - `required`: if true, "yes" must be the majority answer; if false, "no". */
export interface IdentityFeature {
  key: string;
  question: string;
  required: boolean;
}

/** Identity spec — the expected features for a known character. */
export interface CharacterIdentitySpec {
  name: string;
  features: IdentityFeature[];
}

const IDENTITY_SYSTEM = `You are a precise visual observer. For each yes/no question, answer ONLY based on what you literally see in the image. Do not infer story, do not assume identity. Output ONLY JSON.`;

function buildIdentityPrompt(spec: CharacterIdentitySpec, contextHint: string): string {
  const items = spec.features.map((f, i) => `${i + 1}. ${f.key}: ${f.question}  Answer "yes" or "no".`).join("\n");
  return `Examine the image. ${contextHint}

For each question answer literally yes/no based ONLY on what you see.

${items}

Respond with ONLY this JSON:
{
  "answers": {
${spec.features.map((f) => `    "${f.key}": "<yes | no>"`).join(",\n")}
  }
}`;
}

/** Run the identity gate against one image using one or more VLMs.
 *
 *  Pass multiple `models` for consensus voting. The reliability matrix can
 *  exclude specific (model, feature) pairs you've calibrated as biased —
 *  e.g. a model that always says "yes" for tusks regardless of the image. */
export async function gradeIdentity(params: {
  imagePath: string;
  spec: CharacterIdentitySpec;
  contextHint?: string;
  models: string[];
  reliability?: ReliabilityMatrix;
  config?: VlmClientConfig;
}): Promise<ConsensusVerdict> {
  const { imagePath, spec, contextHint = "", models, reliability, config } = params;
  if (models.length === 0) throw new Error("gradeIdentity requires at least one VLM model");

  const prompt = buildIdentityPrompt(spec, contextHint);
  const answers: VlmAnswer[] = [];
  const errors: string[] = [];

  for (const model of models) {
    try {
      const a = await askVlm({ model, imagePath, prompt, system: IDENTITY_SYSTEM, config });
      answers.push(a);
    } catch (e) {
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  if (answers.length === 0) {
    throw new Error(`all ${models.length} VLMs failed:\n  ${errors.join("\n  ")}`);
  }

  const failures: string[] = [];
  const featureKeys = spec.features.map(f => f.key);
  const audit = buildVoteAudit(featureKeys, answers);

  for (const f of spec.features) {
    const votes = tallyVotes(f.key, answers, reliability);
    if (votes.size === 0) {
      failures.push(`${f.key}: no votes (no reliable VLMs answered)`);
      continue;
    }
    const wantedAnswer = f.required ? "yes" : "no";
    const passed = majorityIn(votes, [wantedAnswer]);
    if (!passed) {
      const voteStr = [...votes.entries()].map(([ans, n]) => `${ans}=${n}`).join(", ");
      failures.push(`${f.key}: expected ${wantedAnswer} (${f.question}); got [${voteStr}]`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    perQuestionVotes: audit,
    perModel: answers,
  };
}
