/**
 * Multi-VLM consensus voting with per-question reliability filtering.
 *
 * Why this exists: any single VLM has biases. qwen3-vl:32b is unreliable on
 * tusk anatomy (baked-in cartoon-orc prior). qwen3.6:35b is unreliable on
 * directional spatial reasoning. llama3.2-vision can't see fine facial
 * features at typical sizes. Voting by majority across multiple VLMs
 * filters out single-model biases.
 *
 * The reliability matrix lets you EXCLUDE specific (model, question) pairs
 * that you've calibrated as biased. If qwen3-vl always says "above_lip" for
 * tusks regardless of the image, drop its tusk_root_position vote.
 */
import type { VlmAnswer, ReliabilityMatrix } from "./types.js";

/** Tally votes for a specific question across multiple VLM answers,
 *  filtered by the reliability matrix.
 *
 *  Returns answer -> count, with only votes from models flagged reliable
 *  for this question. Empty answers are skipped. */
export function tallyVotes(
  questionKey: string,
  answers: VlmAnswer[],
  reliability?: ReliabilityMatrix,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of answers) {
    const ans = (a.answers[questionKey] ?? "").trim().toLowerCase();
    if (!ans) continue;
    if (reliability) {
      const modelReliability = reliability[a.model];
      if (modelReliability && modelReliability[questionKey] === false) continue;
    }
    counts.set(ans, (counts.get(ans) ?? 0) + 1);
  }
  return counts;
}

/** Return the answer with the most votes, or null if no votes.
 *  Ties broken by alphabetical order (deterministic). */
export function majorityAnswer(votes: Map<string, number>): string | null {
  if (votes.size === 0) return null;
  const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted[0][0];
}

/** Check whether the majority of (filtered) voters answered with a value
 *  in `acceptable`. Useful when "yes" + "yes-with-caveats" should both
 *  count as a pass. */
export function majorityIn(
  votes: Map<string, number>,
  acceptable: string[],
): boolean {
  const accept = new Set(acceptable.map(s => s.toLowerCase()));
  let acceptCount = 0;
  let totalCount = 0;
  for (const [ans, n] of votes.entries()) {
    totalCount += n;
    if (accept.has(ans)) acceptCount += n;
  }
  if (totalCount === 0) return false;
  return acceptCount > totalCount / 2;
}

/** Build a per-question vote audit trail (model -> answer for each question).
 *  Used by ConsensusVerdict to surface "why did this fail" without re-running
 *  the VLMs. */
export function buildVoteAudit(
  questionKeys: string[],
  answers: VlmAnswer[],
): Record<string, Record<string, string>> {
  const audit: Record<string, Record<string, string>> = {};
  for (const k of questionKeys) {
    audit[k] = {};
    for (const a of answers) {
      audit[k][a.model] = (a.answers[k] ?? "").trim();
    }
  }
  return audit;
}
