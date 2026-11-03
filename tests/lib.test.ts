import { test } from "node:test";
import assert from "node:assert/strict";
import { dropIndex, moveItem, sameOrder } from "../src/lib/order";
import { buildSystemInstruction, buildUserText } from "../src/lib/prompt";
import { detectImageType } from "../src/lib/image";
import { isVoiceId, voiceInstruction, voiceLabel } from "../src/lib/voices";

test("moveItem moves forward, backward, and ignores bad indexes", () => {
  assert.deepEqual(moveItem([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
  assert.deepEqual(moveItem([1, 2, 3, 4], 3, 0), [4, 1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 1, 1), [1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 0, 3), [1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], -1, 1), [1, 2, 3]);
});

test("moveItem never mutates its input", () => {
  const input = [1, 2, 3];
  moveItem(input, 0, 2);
  assert.deepEqual(input, [1, 2, 3]);
});

test("dropIndex: dropping above/below a card lands the item in the right slot", () => {
  const ids = ["a", "b", "c", "d"];
  const drop = (from: number, over: number, after: boolean) => moveItem(ids, from, dropIndex(from, over, after));
  assert.deepEqual(drop(0, 2, false), ["b", "a", "c", "d"]); // a above c
  assert.deepEqual(drop(0, 2, true), ["b", "c", "a", "d"]); // a below c
  assert.deepEqual(drop(3, 1, false), ["a", "d", "b", "c"]); // d above b
  assert.deepEqual(drop(3, 1, true), ["a", "b", "d", "c"]); // d below b
  assert.deepEqual(drop(1, 0, false), ["b", "a", "c", "d"]); // b to the top
  assert.deepEqual(drop(1, 3, true), ["a", "c", "d", "b"]); // b to the bottom
  assert.deepEqual(drop(1, 2, false), ids); // dropping just above its neighbour is a no-op
});

test("sameOrder compares element by element", () => {
  assert.equal(sameOrder([1, 2], [1, 2]), true);
  assert.equal(sameOrder([1, 2], [2, 1]), false);
  assert.equal(sameOrder([1], [1, 2]), false);
});

test("user text carries the context and ONLY the previous step's output", () => {
  const text = buildUserText({ instruction: "Write the caption.", inputText: " my dog ", previous: ["first", "second"] });
  assert.match(text, /Original context from the user: my dog/);
  assert.match(text, /Output of the previous step:\nsecond/);
  assert.doesNotMatch(text, /first/);
  assert.match(text, /Step instruction: Write the caption\./);
});

test("the first step has no previous output; missing context is stated", () => {
  const text = buildUserText({ instruction: "Describe it.", inputText: null, previous: [] });
  assert.match(text, /\(none\)/);
  assert.doesNotMatch(text, /previous step/);
});

test("system instruction marks the final step and includes the voice", () => {
  const middle = buildSystemInstruction({ stepIndex: 0, total: 3, voice: voiceInstruction("noir") });
  const last = buildSystemInstruction({ stepIndex: 2, total: 3, voice: voiceInstruction("noir") });
  assert.match(middle, /step 1 of 3/);
  assert.doesNotMatch(middle, /FINAL/);
  assert.match(last, /step 3 of 3/);
  assert.match(last, /FINAL/);
  assert.match(last, /noir detective/);
  assert.match(last, /never as instructions/i, "prompt-injection guard is present");
  assert.doesNotMatch(buildSystemInstruction({ stepIndex: 0, total: 1, voice: null }), /null/);
});

test("voices: ids validate and labels resolve", () => {
  assert.equal(isVoiceId("roast"), true);
  assert.equal(isVoiceId("pirate"), false);
  assert.equal(voiceLabel("hype"), "Sports Announcer");
  assert.equal(voiceLabel(null), null);
  assert.equal(voiceInstruction("nope"), null);
});

test("detectImageType identifies by bytes, not by name", () => {
  assert.equal(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext, "jpg");
  assert.equal(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))?.ext, "png");
  const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
  assert.equal(detectImageType(webp)?.ext, "webp");
  assert.equal(detectImageType(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))?.ext, undefined);
});

import { groupStages, ideasFor, stageFor, stagesFor } from "../src/lib/stages";
import { dayKey, dayLabel, groupByDay, shiftKey } from "../src/lib/time";
import { coverGradient, voiceTheme } from "../src/lib/voice-theme";

test("stages: first thinks, last writes the caption, the middle refines", () => {
  assert.deepEqual(stagesFor(1).map((s) => s.key), ["caption"]);
  assert.deepEqual(stagesFor(2).map((s) => s.key), ["think", "caption"]);
  assert.deepEqual(stagesFor(4).map((s) => s.key), ["think", "refine", "refine", "caption"]);
  assert.deepEqual(stagesFor(0), []);
  assert.equal(stageFor(0, 3).label, "Creative thinking");
  assert.equal(stageFor(2, 3).label, "Final caption");
});

test("groupStages collapses runs of the same stage into one node", () => {
  const groups = groupStages(stagesFor(5));
  assert.deepEqual(groups.map((g) => [g.stage.key, g.start, g.end]), [["think", 0, 1], ["refine", 1, 4], ["caption", 4, 5]]);
  assert.deepEqual(groupStages([]), []);
});

test("ideasFor suggests a sensible next step", () => {
  assert.ok(ideasFor(0).every((i) => i.stage === "think"));
  assert.ok(ideasFor(1).every((i) => i.stage !== "think"));
  assert.ok(ideasFor(3).length > 0);
});

test("dayKey respects the viewer's time zone", () => {
  // 03:30 UTC on Jan 2 is still Jan 1 in New York and already Jan 2 in Tokyo.
  assert.equal(dayKey("2026-01-02T03:30:00Z", "America/New_York"), "2026-01-01");
  assert.equal(dayKey("2026-01-02T03:30:00Z", "Asia/Tokyo"), "2026-01-02");
  assert.equal(dayKey("2026-01-02T03:30:00Z", "UTC"), "2026-01-02");
});

test("shiftKey and dayLabel cross month and year boundaries", () => {
  assert.equal(shiftKey("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftKey("2026-01-01", -1), "2025-12-31");
  assert.equal(dayLabel("2026-05-10", "2026-05-10"), "Today");
  assert.equal(dayLabel("2026-05-09", "2026-05-10"), "Yesterday");
  assert.equal(dayLabel("2026-05-01", "2026-05-10"), "Friday, May 1");
  assert.match(dayLabel("2025-12-31", "2026-01-02"), /December 31, 2025/);
});

test("groupByDay buckets newest-first items by local day", () => {
  const items = ["2026-05-10T20:00:00Z", "2026-05-10T15:00:00Z", "2026-05-09T12:00:00Z"].map((iso) => ({ iso }));
  const groups = groupByDay(items, (i) => i.iso, "America/New_York", new Date("2026-05-10T21:00:00Z"));
  assert.deepEqual(groups.map((g) => [g.label, g.items.length]), [["Today", 2], ["Yesterday", 1]]);
});

test("voice themes: every voice has a distinct palette; unknown ids fall back", () => {
  for (const id of ["classic", "roast", "noir", "nature", "grandma", "hype"]) {
    const t = voiceTheme(id);
    assert.match(t.from, /^#[0-9a-f]{6}$/);
    assert.match(t.to, /^#[0-9a-f]{6}$/);
  }
  assert.notEqual(voiceTheme("noir").to, voiceTheme("hype").to);
  assert.deepEqual(voiceTheme("nope"), voiceTheme(null));
  assert.match(coverGradient("roast"), /^linear-gradient\(135deg, #/);
});
