/**
 * Shared types for VLM gates.
 */

/** Result of a single VLM model's response to a structured query. */
export interface VlmAnswer {
  model: string;
  answers: Record<string, string>;
  raw: string;
}

/** Outcome of a multi-VLM consensus gate. */
export interface ConsensusVerdict {
  passed: boolean;
  failures: string[];
  /** For each question id, a map of model -> answer it gave. */
  perQuestionVotes: Record<string, Record<string, string>>;
  perModel: VlmAnswer[];
}

/** Configuration for the VLM client. Defaults to local Ollama. */
export interface VlmClientConfig {
  /** Ollama-compatible base URL. Default: http://127.0.0.1:11434 */
  ollamaHost?: string;
  /** Per-call temperature. Default: 0.05 (deterministic). */
  temperature?: number;
  /** Max tokens per response. Default: 2048. */
  numPredict?: number;
  /** Per-call request timeout in ms. Default: 120000 (2 min). */
  timeoutMs?: number;
}

/** Reliability matrix: per-(model, question) flag indicating whether
 *  the model's answer to that question should be trusted. False entries
 *  exclude the model's vote on that specific question (e.g. qwen3-vl
 *  is biased on tusk anatomy — use other VLMs for tusk_root_position). */
export type ReliabilityMatrix = Record<string, Record<string, boolean>>;
