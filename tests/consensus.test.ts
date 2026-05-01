/**
 * Tests for consensus voting logic.
 *
 * Pure unit tests — no VLM calls, no network, just exercising the voting
 * functions with synthetic answer sets.
 */
import { describe, it, expect } from "vitest";
import { tallyVotes, majorityAnswer, majorityIn, buildVoteAudit } from "../src/consensus.js";
import type { VlmAnswer } from "../src/types.js";

const synth = (model: string, answers: Record<string, string>): VlmAnswer => ({ model, answers, raw: JSON.stringify({ answers }) });

describe("tallyVotes", () => {
  it("counts votes from multiple models", () => {
    const answers = [
      synth("a", { color: "green" }),
      synth("b", { color: "green" }),
      synth("c", { color: "blue" }),
    ];
    const votes = tallyVotes("color", answers);
    expect(votes.get("green")).toBe(2);
    expect(votes.get("blue")).toBe(1);
  });

  it("skips empty answers", () => {
    const answers = [
      synth("a", { color: "green" }),
      synth("b", { color: "" }),
      synth("c", {}),
    ];
    const votes = tallyVotes("color", answers);
    expect(votes.size).toBe(1);
    expect(votes.get("green")).toBe(1);
  });

  it("normalizes case", () => {
    const answers = [
      synth("a", { color: "GREEN" }),
      synth("b", { color: "Green" }),
      synth("c", { color: "green" }),
    ];
    const votes = tallyVotes("color", answers);
    expect(votes.get("green")).toBe(3);
  });

  it("respects reliability matrix (excludes flagged model+question)", () => {
    const answers = [
      synth("biased-model", { tusks: "above_lip" }),
      synth("good-model", { tusks: "below_lip" }),
    ];
    const reliability = { "biased-model": { tusks: false } };
    const votes = tallyVotes("tusks", answers, reliability);
    expect(votes.size).toBe(1);
    expect(votes.get("below_lip")).toBe(1);
    expect(votes.get("above_lip")).toBeUndefined();
  });

  it("does not exclude unflagged questions for the same model", () => {
    const answers = [
      synth("partial-bias", { tusks: "above_lip", color: "green" }),
      synth("good-model", { tusks: "below_lip", color: "green" }),
    ];
    const reliability = { "partial-bias": { tusks: false } };
    const tuskVotes = tallyVotes("tusks", answers, reliability);
    const colorVotes = tallyVotes("color", answers, reliability);
    expect(tuskVotes.size).toBe(1); // partial-bias excluded on tusks
    expect(colorVotes.get("green")).toBe(2); // partial-bias counted on color
  });
});

describe("majorityAnswer", () => {
  it("returns answer with most votes", () => {
    const votes = new Map([["yes", 2], ["no", 1]]);
    expect(majorityAnswer(votes)).toBe("yes");
  });

  it("returns null on empty", () => {
    expect(majorityAnswer(new Map())).toBeNull();
  });

  it("breaks ties alphabetically (deterministic)", () => {
    const votes = new Map([["yes", 1], ["no", 1]]);
    expect(majorityAnswer(votes)).toBe("no"); // alphabetically before "yes"
  });
});

describe("majorityIn", () => {
  it("passes if strict majority is in acceptable set", () => {
    const votes = new Map([["below_lip", 2], ["at_lip", 1]]);
    expect(majorityIn(votes, ["below_lip", "at_lip"])).toBe(true);
  });

  it("fails if minority is in acceptable set", () => {
    const votes = new Map([["above_lip", 2], ["below_lip", 1]]);
    expect(majorityIn(votes, ["below_lip"])).toBe(false);
  });

  it("requires STRICT majority (50% does not pass)", () => {
    const votes = new Map([["yes", 1], ["no", 1]]);
    expect(majorityIn(votes, ["yes"])).toBe(false);
  });

  it("returns false on empty votes", () => {
    expect(majorityIn(new Map(), ["yes"])).toBe(false);
  });
});

describe("buildVoteAudit", () => {
  it("produces per-question, per-model audit", () => {
    const answers = [
      synth("a", { q1: "yes", q2: "no" }),
      synth("b", { q1: "yes", q2: "yes" }),
    ];
    const audit = buildVoteAudit(["q1", "q2"], answers);
    expect(audit.q1.a).toBe("yes");
    expect(audit.q1.b).toBe("yes");
    expect(audit.q2.a).toBe("no");
    expect(audit.q2.b).toBe("yes");
  });

  it("includes empty answers in audit (for debugging missing votes)", () => {
    const answers = [synth("a", {})];
    const audit = buildVoteAudit(["q1"], answers);
    expect(audit.q1.a).toBe("");
  });
});
