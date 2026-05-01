# comfyui-vlm-gates

Multi-VLM consensus gates and quality scoring for AI image pipelines. Catches bad renders before they ship by running them through multiple local Vision-Language Models (via Ollama) with bias-calibrated questions.

```ts
import { gradeIdentity, scoreImageQuality, PHOTOREAL_PORTRAIT_RUBRIC } from "comfyui-vlm-gates";

// Verify a render still looks like the intended character
const verdict = await gradeIdentity({
  imagePath: "renders/hero-shot.png",
  spec: ORMAK_SPEC,                // your IdentityFeature[] schema
  models: ["qwen3-vl:32b", "qwen3.6:35b"],
  reliability: ORC_RELIABILITY,    // optional: exclude biased (model, question) pairs
});
if (!verdict.passed) {
  console.error("identity drifted:", verdict.failures);
  // re-render with a bumped seed, or save to rejects dir for review
}

// Among multiple candidates that passed, pick the highest-quality one
const { winner } = await pickBestByQuality({
  imagePaths: ["candidate-a.png", "candidate-b.png", "candidate-c.png"],
  model: "qwen3-vl:32b",
  rubric: PHOTOREAL_PORTRAIT_RUBRIC,  // 10 aspects × 10 points = 100 max
});
```

## Why this exists

If you're running a diffusion pipeline at scale (auto cast builds, episode keyframes, batch character renders), broken outputs accumulate silently:

- A render saves with **vampire fangs** instead of the requested boar tusks. Downstream PuLID locks the bad geometry and propagates it across every angled ref.
- A character's scar **mirrors to the wrong cheek** because the model has fragile left/right understanding.
- An "**extreme close-up on the eyes**" prompt produces a medium head-and-shoulders shot. The canny template was ignored.
- A character with **dark amber eyes** in the passport drifts to **bright blue** in the eye-CU ref because PuLID strength was too loose.
- A "**T-pose**" reference renders with **arms at sides** because PuLID held the passport's pose.

These all happened to me in a real pipeline. They're invisible without verification — `prompt + render + save` doesn't have a "did the output match what we asked for" step. This library is that step.

## What it does

Three binary gates + one quality scorer:

| Gate | Catches |
|------|---------|
| `gradeIdentity` | "Is this still the same character?" — features must match a spec (braid, scar, age tier, etc) |
| `gradeAnatomy` | "Does the subject have correct anatomy?" — tusks rooted in lower jaw, 5 fingers, normal eye alignment, no AI artifacts |
| `gradeFraming` | "Does the framing match the intent?" — extreme close-up rendered tight, wide rendered wide, back-of-head shows no face |
| `scoreImageQuality` | Rank multiple passing candidates by 10 aspects (skin texture, eye detail, lighting, composition, identity, artifacts, color grading, anatomy, masterpiece bar) |

All gates run against **multiple VLMs in parallel** with **majority voting**. A reliability matrix lets you exclude specific `(model, question)` pairs that you've calibrated as biased — for example, qwen3-vl:32b has a baked-in cartoon-orc prior that misclassifies tusk anatomy regardless of the actual image, so it's excluded from `tusk_root_position` votes.

## Why bias calibration matters

Single-VLM gates fail silently when the VLM has a domain bias. Real example from the calibration that drove this lib:

> Take a literal photo of a warthog with two thick lower-jaw tusks pointing UP. Ask qwen3-vl:32b "where are the tusk roots?" with the multi-choice options below_lip / above_lip / at_lip. It will reliably answer **above_lip**. Wrong. Its training has more cartoon-orc-fang images than warthog photos, and the prior dominates literal observation.

Solutions baked into this lib:

1. **Open-ended phrasing**: questions describe what to look for instead of A/B/C/D options. Removes the answer-letter telegraph.
2. **Multi-VLM consensus**: 2-of-3 majority voting across qwen3-vl, qwen3.6, llama3.2-vision. One model's bias gets outvoted.
3. **Reliability matrix**: when you find a (model, question) bias via ground-truth calibration, blacklist it. Other models still vote.
4. **"Medium" as acceptable**: where a binary forces miscategorization (thick/thin → medium tusks become "thin"), the spec includes the middle option as a pass.

The orc preset (`presets/orc-anatomy.ts`) ships with calibrated reliability flags. Build your own for other domains using the same pattern.

## Installation

```bash
npm install comfyui-vlm-gates
```

Requires Node 18+ and a local Ollama server with the VLM models pulled:

```bash
ollama pull qwen3-vl:32b
ollama pull qwen3.6:35b           # optional, for 3-way consensus
ollama pull llama3.2-vision:11b   # optional, fast tie-breaker
```

## Examples

See the [`examples/`](./examples) directory for runnable scripts:

- [`basic-identity.ts`](./examples/basic-identity.ts) — gate one render against a character spec
- [`concept-passport-picker.ts`](./examples/concept-passport-picker.ts) — render N candidates, gate each, pick best-scoring passer
- [`retry-with-rejects.ts`](./examples/retry-with-rejects.ts) — render-gate-retry loop with reject archival

## API

### `gradeIdentity({ imagePath, spec, models, reliability?, contextHint?, config? }) → ConsensusVerdict`

Verify an image matches a known character's feature spec. Each feature is a yes/no question; the gate fails if any required feature isn't a majority "yes".

### `gradeAnatomy({ imagePath, spec, models, config? }) → ConsensusVerdict`

Verify subjects have correct anatomy via open-ended questions with acceptable-answer lists. Use `presets/orc-anatomy.ts` or `presets/human-anatomy.ts`, or define your own.

### `gradeFraming({ imagePath, intent, models, config? }) → FramingVerdict`

Verify shot composition matches an intent description. Catches "wide rendered as portrait", "close-up rendered as medium", etc.

### `scoreImageQuality({ imagePath, model, rubric?, config? }) → QualityScore`

Rate one image on a configurable rubric (default: 10 cinematic photoreal aspects, 100 max). Use AFTER binary gates have filtered out broken renders — quality scoring among working candidates is for tie-breaking, not finding bugs.

### `pickBestByQuality({ imagePaths, model, rubric?, config? }) → { winner, allScores }`

Score N candidates and return the highest-scoring path. Stable sort means input order is the deterministic tie-breaker.

## Bias calibration: the ground-truth check

When adding a new VLM or new question to your spec, run the model against a **known-correct image** before trusting it on production renders. The orc preset's reliability matrix was built by running a literal warthog photo against each model and checking which questions they got right.

```ts
const groundTruthPath = "warthog-reference-photo.jpg";
const verdict = await gradeAnatomy({
  imagePath: groundTruthPath,
  spec: ORC_ANATOMY,
  models: ["qwen3-vl:32b", "qwen3.6:35b"],
});
console.log(verdict.perQuestionVotes);
// Inspect: which models gave wrong answers on which questions?
// Add those (model, question) pairs to spec.reliability with `false`.
```

## License

Apache-2.0. © 2026 Booyaka101.

## Contributing

PRs welcome. Particular interest in:
- New domain presets (anime characters, product photography, architecture, vehicles)
- Additional VLM model integrations (Florence-2, InternVL, Pixtral)
- Calibration data for existing presets across more VLM versions

## Acknowledgments

This library was extracted from production use in an AI video pipeline. Real-world bug archive that motivated the design:

- `vampire-fang-tusks` (anatomy gate would have caught)
- `bilateral-tattoos-on-both-cheeks` (identity gate with landmark anchoring)
- `blue-eyes-on-dark-eyed-character` (identity feature: eye color)
- `T-pose-rendered-as-arms-at-sides` (framing gate: pose intent vs observation)
- `extreme-close-up-rendered-as-medium-shot` (framing gate: shot type)

Each one is a real failure that would've shipped without this library.
