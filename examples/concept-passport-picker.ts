/**
 * Concept passport picker — pick the best of N candidate renders.
 *
 * Workflow:
 *   1. Render N concept candidates (e.g. 4 variations of a character passport)
 *   2. Run binary anatomy gate on each → list of passing candidates
 *   3. Among passers, run quality scorer → rank by total score
 *   4. Pick highest. Tie = first by render order (stable, reproducible)
 *
 * This is the recipe for "stop blindly picking concept-a0; pick the best one".
 *
 * Run: npx tsx examples/concept-passport-picker.ts a.png b.png c.png d.png
 */
import { gradeAnatomy, scoreImageQuality, PHOTOREAL_PORTRAIT_RUBRIC } from "../src/index.js";
import { ORC_ANATOMY } from "../src/presets/orc-anatomy.js";

async function main() {
  const candidates = process.argv.slice(2);
  if (candidates.length === 0) {
    console.error("Usage: npx tsx examples/concept-passport-picker.ts <a.png> <b.png> ...");
    process.exit(1);
  }

  const models = ["qwen3-vl:32b", "qwen3.6:35b"];

  // Step 1: anatomy-gate each candidate
  console.log(`\nGating ${candidates.length} candidates...`);
  type Result = { path: string; passed: boolean; failureCount: number; firstFailure: string; qualityScore: number };
  const results: Result[] = [];
  for (const path of candidates) {
    try {
      const verdict = await gradeAnatomy({ imagePath: path, spec: ORC_ANATOMY, models });
      results.push({
        path,
        passed: verdict.passed,
        failureCount: verdict.failures.length,
        firstFailure: verdict.failures[0] ?? "",
        qualityScore: 0,
      });
      console.log(`  ${path}: ${verdict.passed ? "PASS" : `FAIL (${verdict.failures.length})`}${verdict.failures[0] ? " — " + verdict.failures[0].slice(0, 80) : ""}`);
    } catch (e) {
      console.warn(`  ${path}: gate error: ${(e as Error).message}`);
      results.push({ path, passed: false, failureCount: 99, firstFailure: `error: ${(e as Error).message}`, qualityScore: 0 });
    }
  }

  // Step 2: quality-score the passers
  const passers = results.filter(r => r.passed);
  if (passers.length === 0) {
    // No passer — fall back to lowest-failure-count (loud-warn before using)
    results.sort((a, b) => a.failureCount - b.failureCount);
    console.log(`\nNO candidate passed anatomy gate. Best-effort = ${results[0].path} (${results[0].failureCount} failures)`);
    console.log(`First failure: ${results[0].firstFailure}`);
    return;
  }

  console.log(`\n${passers.length}/${results.length} passed. Scoring quality...`);
  for (const r of passers) {
    try {
      const score = await scoreImageQuality({
        imagePath: r.path,
        model: "qwen3-vl:32b",
        rubric: PHOTOREAL_PORTRAIT_RUBRIC,
      });
      r.qualityScore = score.total;
      console.log(`  ${r.path}: ${score.total}/${score.maxTotal} — ${score.notes}`);
    } catch (e) {
      console.warn(`  ${r.path}: quality scoring error: ${(e as Error).message}`);
    }
  }

  // Step 3: pick highest (stable sort = first by render order if tied)
  passers.sort((a, b) => b.qualityScore - a.qualityScore);
  const winner = passers[0];
  console.log(`\nWinner: ${winner.path} — quality ${winner.qualityScore}/100`);
  if (passers.length > 1 && passers[0].qualityScore === passers[1].qualityScore) {
    console.log(`(tied with ${passers[1].path}, picked first by input order — either ships)`);
  }
}

main().catch(e => { console.error("error:", e); process.exit(1); });
