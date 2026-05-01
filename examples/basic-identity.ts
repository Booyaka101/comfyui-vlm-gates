/**
 * Basic identity gate example.
 *
 * Run: npx tsx examples/basic-identity.ts <path/to/render.png>
 *
 * Defines a character spec (Ormak the orc warrior) and runs the identity gate
 * against an image. Prints pass/fail + which features missed.
 */
import { gradeIdentity } from "../src/index.js";
import type { CharacterIdentitySpec } from "../src/index.js";

const ORMAK_SPEC: CharacterIdentitySpec = {
  name: "Ormak",
  features: [
    {
      key: "hair_braid",
      question: "Does this character have LONG dark hair, pulled back, with a visible BRAID hanging behind or to the side?",
      required: true,
    },
    {
      key: "facial_scars",
      question: "Are there visible scars (raised pink/red flesh marks, NOT tattoo ink) across this character's cheek or brow?",
      required: true,
    },
    {
      key: "weathered_face",
      question: "Does this character look mature, weathered, late-thirties to fifties (NOT young, smooth-skinned, or twenties)?",
      required: true,
    },
  ],
};

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Usage: npx tsx examples/basic-identity.ts <path/to/render.png>");
    process.exit(1);
  }

  const verdict = await gradeIdentity({
    imagePath,
    spec: ORMAK_SPEC,
    contextHint: "This image should depict Ormak, a mature orc warrior.",
    models: ["qwen3-vl:32b", "qwen3.6:35b"],
  });

  console.log(`\nIdentity gate: ${verdict.passed ? "PASS" : "FAIL"}`);
  if (verdict.failures.length > 0) {
    console.log(`\nFailures (${verdict.failures.length}):`);
    for (const f of verdict.failures) console.log(`  - ${f}`);
  }
  console.log(`\nPer-question votes:`);
  for (const [question, votes] of Object.entries(verdict.perQuestionVotes)) {
    console.log(`  ${question}: ${Object.entries(votes).map(([m, a]) => `${m}=${a}`).join(", ")}`);
  }
}

main().catch(e => { console.error("error:", e); process.exit(1); });
