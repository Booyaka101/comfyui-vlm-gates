# Why bias calibration matters

This library exists because **single-VLM gates fail silently when the VLM has a domain bias**.

## The story

While building an AI video pipeline featuring orc characters, every render kept producing tusks rendered as **vampire fangs** (hanging down from the upper jaw) instead of **boar-style tusks** (rooted in the lower jaw, pointing up). The prompt was explicit. The reference images were correct. But every render was wrong.

So I added a VLM gate. "Look at this image. Are the tusks rooted in the lower jaw or the upper jaw?" Multi-choice: `below_lip` / `above_lip` / `at_lip`.

The VLM (qwen3-vl:32b) reliably answered `below_lip`. The gate passed. The renders kept being wrong.

I didn't trust the gate. I ran it against a literal warthog reference photo — a real animal with two thick tusks pointing UP from the lower jaw, the most unambiguous example of the correct anatomy.

The VLM answered `above_lip`. **For a warthog photo.**

Diagnosis: qwen3-vl:32b's training set has more cartoon-orc-fang images than warthog photographs. The prior dominated literal observation. It wasn't looking at the picture; it was pattern-matching "orc → fangs hang down."

Worse: the **multi-choice phrasing** telegraphed the dichotomy. Switching to open-ended ("describe where the tusks attach") gave better answers from the same model. But not consistent enough to trust solo.

## The fixes baked into this library

### 1. Open-ended question phrasing

Don't ask `(a) below_lip / (b) above_lip / (c) at_lip`. Ask "where does each visible tusk attach?" with `acceptableAnswers: ["below_lip", "at_lip", "no_tusks_visible"]` for validation. The VLM describes; the validator categorizes.

### 2. Multi-VLM consensus

Run the same question through 2-3 different VLMs (qwen3-vl, qwen3.6, llama3.2-v) and take majority vote. Different models have different biases — they don't all share the same training set distortion. Outvoting works.

### 3. Reliability matrix

When you find a `(model, question)` bias via ground-truth calibration, exclude that vote. Other models still count. Rebuild the matrix per VLM version (a new model release may fix or introduce biases).

```ts
const reliability = {
  "qwen3-vl:32b": {
    tusk_root_position: false,    // baked-in cartoon-orc bias
    tusk_tip_direction: false,
  },
  "llama3.2-vision:11b": {
    // can't see fine facial features at typical render sizes
    tusk_root_position: false,
    tusk_thickness: false,
  },
};
```

### 4. "Medium" as acceptable

Where a binary forces miscategorization (thick/thin → medium-sized real tusks become "thin fang"), the spec includes the middle option as a pass:

```ts
{
  key: "tusk_thickness",
  acceptableAnswers: ["thick_boar_style", "medium", ""],
  // "thin_fang_style" is not in acceptable → fails
}
```

## How to calibrate a new model

When you add a new VLM (or a new question to an existing spec), run the model against a **known-correct image** before trusting it on production renders.

```ts
const groundTruthPath = "warthog-reference-photo.jpg";
const verdict = await gradeAnatomy({
  imagePath: groundTruthPath,
  spec: ORC_ANATOMY,
  models: ["new-vlm-version:latest"],
});
console.log(verdict.perQuestionVotes);
```

Inspect the per-question votes. For any question where the model gave a wrong answer on the known-correct image, add `(model, question): false` to your reliability matrix.

This is tedious but it's the only honest way. The alternative is shipping a gate that says "PASS" while the renders are obviously wrong.

## What I learned

1. **Don't trust a single VLM.** Bias is the rule, not the exception.
2. **Don't trust multi-choice questions.** They telegraph and constrain the answer space toward the model's prior.
3. **Don't trust without ground-truth calibration.** Run a literal photo of the correct anatomy through the VLM before believing it on AI renders.
4. **Trust majority votes across diverse VLMs.** Different model families = different biases = outvotes.
5. **Document calibration findings.** Reliability matrices belong in code, with comments explaining which ground-truth cases motivated each exclusion.

This library is the codification of those rules.
