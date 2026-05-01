/**
 * Render → gate → retry → archive rejects.
 *
 * The full pattern from autoseries' build-cast.ts:
 *   - Stage to .staging.png
 *   - Gate via VLM consensus
 *   - If pass: rename to final
 *   - If fail: archive to rejects-dir for review, retry with bumped seed
 *   - After N attempts: keep last attempt as final, loud-warn
 *
 * The "render" function here is mocked for the example. In real use, replace
 * with a Comfy workflow run, an SDXL pipeline call, or whatever produces a PNG.
 *
 * Run: npx tsx examples/retry-with-rejects.ts
 */
import { gradeIdentity } from "../src/index.js";
import type { CharacterIdentitySpec } from "../src/index.js";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const MAX_ATTEMPTS = 3;

interface RenderConfig {
  prompt: string;
  seed: number;
  outputPath: string;
}

// REPLACE with your actual render pipeline (Comfy, diffusers, etc).
async function renderImage(_config: RenderConfig): Promise<void> {
  // mock: assumes you have a sample image at examples/sample.png
  const sample = path.join(__dirname, "sample.png");
  if (!existsSync(sample)) {
    throw new Error(`mock render needs ${sample} — replace with your real pipeline`);
  }
  copyFileSync(sample, _config.outputPath);
}

const HERO_SPEC: CharacterIdentitySpec = {
  name: "Hero",
  features: [
    { key: "is_humanoid", question: "Is this image of a humanoid character (head, torso, two arms)?", required: true },
    { key: "has_face",    question: "Is a face clearly visible?", required: true },
  ],
};

async function renderGateRetry(slug: string, baseSeed: number, outDir: string): Promise<void> {
  const stagedDst = path.join(outDir, `.${slug}.staging.png`);
  const finalDst = path.join(outDir, `${slug}.png`);
  const rejectsDir = path.join(outDir, "rejects");
  mkdirSync(rejectsDir, { recursive: true });

  let lastReason = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seed = baseSeed + attempt * 17;  // bump seed per retry
    console.log(`\n  attempt ${attempt + 1}/${MAX_ATTEMPTS}: seed=${seed}`);
    await renderImage({ prompt: `hero shot of ${slug}`, seed, outputPath: stagedDst });

    const verdict = await gradeIdentity({
      imagePath: stagedDst,
      spec: HERO_SPEC,
      models: ["qwen3-vl:32b"],  // single VLM for example; use 2+ in production
    });

    if (verdict.passed) {
      copyFileSync(stagedDst, finalDst);
      console.log(`  PASS: ${slug} → ${finalDst}`);
      return;
    }

    lastReason = verdict.failures.join("; ");
    const rejectPath = path.join(rejectsDir, `${slug}-a${attempt}-FAIL.png`);
    copyFileSync(stagedDst, rejectPath);
    console.warn(`  FAIL: ${lastReason}`);
    console.warn(`    archived to ${rejectPath}`);
  }

  // All attempts failed — keep last attempt but loud-warn
  copyFileSync(stagedDst, finalDst);
  console.warn(`\n!!  ALL ${MAX_ATTEMPTS} ATTEMPTS FAILED for ${slug}`);
  console.warn(`!!  last reason: ${lastReason}`);
  console.warn(`!!  using last attempt as final — review ${rejectsDir}/ before shipping`);
}

async function main() {
  const outDir = "out";
  mkdirSync(outDir, { recursive: true });
  await renderGateRetry("hero-01", 12345, outDir);
}

main().catch(e => { console.error("error:", e); process.exit(1); });
