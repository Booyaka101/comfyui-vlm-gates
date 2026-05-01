/**
 * Ollama-compatible VLM client with structured-JSON output and image input.
 *
 * Designed to be the lowest layer beneath the gate functions. Each gate
 * decides how many models to query, how to merge their answers, and what
 * counts as "passed" — this module just sends one image+prompt to one
 * model and returns the parsed JSON.
 */
import { readFile } from "node:fs/promises";
import type { VlmClientConfig } from "./types.js";

const DEFAULT_HOST = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_NUM_PREDICT = 2048;
const DEFAULT_TEMPERATURE = 0.05;

/** Extract the first complete JSON object from a string of mixed prose+JSON.
 *  Used because some VLMs occasionally wrap JSON in commentary even with
 *  format="json" set. */
export function extractFirstJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

/** Check if a model is loaded and responsive on the Ollama server.
 *  Returns true if the model exists in the Ollama registry. */
export async function pingModel(model: string, config: VlmClientConfig = {}): Promise<boolean> {
  const host = config.ollamaHost ?? DEFAULT_HOST;
  try {
    const r = await fetch(`${host}/api/tags`, { method: "GET", signal: AbortSignal.timeout(5000) });
    if (!r.ok) return false;
    const data = (await r.json()) as { models?: Array<{ name: string }> };
    return (data.models ?? []).some(m => m.name === model || m.name.startsWith(model + ":"));
  } catch {
    return false;
  }
}

/** Read an image file from disk and base64-encode it for the Ollama API. */
export async function imageToBase64(imagePath: string): Promise<string> {
  const buf = await readFile(imagePath);
  return buf.toString("base64");
}

/** Send a structured-JSON query with one image to one VLM model.
 *  The model is instructed via `format: "json"` to emit valid JSON.
 *  Returns the parsed answers map plus the raw response for debugging.
 *
 *  Throws if the model returns HTTP error or unparseable output. Callers
 *  doing multi-model consensus should catch and exclude that model's vote. */
export async function askVlm(params: {
  model: string;
  imagePath: string;
  prompt: string;
  system: string;
  config?: VlmClientConfig;
}): Promise<{ model: string; answers: Record<string, string>; raw: string }> {
  const { model, imagePath, prompt, system, config = {} } = params;
  const host = config.ollamaHost ?? DEFAULT_HOST;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;
  const imgB64 = await imageToBase64(imagePath);

  const r = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      system,
      images: [imgB64],
      stream: false,
      format: "json",
      think: false,
      options: {
        temperature: config.temperature ?? DEFAULT_TEMPERATURE,
        num_predict: config.numPredict ?? DEFAULT_NUM_PREDICT,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    throw new Error(`ollama ${model} returned ${r.status}: ${errBody.slice(0, 300)}`);
  }

  const data = (await r.json()) as { response?: string; thinking?: string };
  const raw = (data.response || data.thinking || "").trim();
  if (!raw) throw new Error(`ollama ${model} returned empty response`);

  let parsed: { answers?: Record<string, string> } | null = null;
  try { parsed = JSON.parse(raw); }
  catch { parsed = extractFirstJsonObject(raw) as typeof parsed; }
  if (!parsed) throw new Error(`ollama ${model} returned unparseable output: ${raw.slice(0, 300)}`);

  return { model, answers: parsed.answers ?? {}, raw };
}
