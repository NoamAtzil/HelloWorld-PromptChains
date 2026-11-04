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
import { dayKey, dayLabel, formatClock, formatDay, formatStamp, groupByDay, shiftKey } from "../src/lib/time";
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

import { moodFor, moodLine } from "../src/lib/mood";
import { REST_INDEX, STORY, TOTAL_MS, nextIndex, phaseOf } from "../src/lib/story";
import { diffAgainstSnapshot } from "../src/lib/run-state";
import { insertAt } from "../src/lib/order";

test("mood is a pure function of real run state", () => {
  const base = { phase: "idle" as const, hasPhoto: false, stepIndex: -1, total: 4 };
  assert.equal(moodFor(base), "idle");
  assert.equal(moodFor({ ...base, hasPhoto: true }), "curious");
  assert.equal(moodFor({ ...base, phase: "running", stepIndex: 0 }), "thinking");
  assert.equal(moodFor({ ...base, phase: "running", stepIndex: 2 }), "thinking");
  assert.equal(moodFor({ ...base, phase: "running", stepIndex: 3 }), "inspired", "the final caption step is the eureka moment");
  assert.equal(moodFor({ ...base, phase: "running", stepIndex: 0, total: 1 }), "thinking");
  assert.equal(moodFor({ ...base, phase: "done", hasPhoto: true }), "proud");
  assert.equal(moodFor({ ...base, phase: "failed", hasPhoto: true }), "confused");
  for (const m of ["idle", "curious", "squint", "thinking", "inspired", "proud", "confused"] as const) assert.ok(moodLine(m).length > 5);
});

test("the hero story is well-formed and loops", () => {
  assert.ok(STORY.length >= 8);
  assert.ok(STORY.every((s) => s.ms >= 500 && s.ms <= 6000));
  assert.deepEqual(STORY.slice(0, 5).map((s) => s.id), ["rest", "notice", "approach", "examine", "think"]);
  assert.equal(STORY[REST_INDEX].id, "proud", "the static frame is the finished picture");
  assert.equal(STORY[REST_INDEX].mood, "proud");
  assert.equal(nextIndex(STORY.length - 1), 0);
  assert.equal(nextIndex(0), 1);
  assert.ok(TOTAL_MS > 10_000 && TOTAL_MS < 30_000, "a loop long enough to breathe, short enough to stay interesting");
  assert.equal(new Set(STORY.map((s) => s.id)).size, STORY.length, "no duplicate steps");
});

test("diffAgainstSnapshot tells the previous result from the current chain", () => {
  const snap = [{ id: 1, instruction: "a" }, { id: 2, instruction: "b" }, { id: 3, instruction: "c" }];
  const same = diffAgainstSnapshot(snap, snap.map((s) => ({ ...s })));
  assert.equal(same.stale, false);
  assert.deepEqual([...same.steps.values()], ["same", "same", "same"]);
  assert.equal(diffAgainstSnapshot(null, snap).stale, false, "no run yet, nothing to compare");

  const edited = diffAgainstSnapshot(snap, [{ id: 1, instruction: "a" }, { id: 2, instruction: "B!" }, { id: 3, instruction: "c" }]);
  assert.equal(edited.stale, true);
  assert.equal(edited.steps.get(2), "edited");
  assert.equal(edited.steps.get(1), "same");

  const moved = diffAgainstSnapshot(snap, [snap[1], snap[0], snap[2]]);
  assert.equal(moved.stale, true);
  assert.equal(moved.steps.get(1), "moved");
  assert.equal(moved.steps.get(2), "moved", "swapping two steps moves both of them");
  assert.equal(moved.steps.get(3), "same");

  const added = diffAgainstSnapshot(snap, [...snap, { id: 9, instruction: "new" }]);
  assert.equal(added.steps.get(9), "new");
  assert.equal(added.stale, true);

  const removed = diffAgainstSnapshot(snap, [snap[0], snap[2]]);
  assert.equal(removed.removed, 1);
  assert.equal(removed.stale, true);
  assert.deepEqual([...removed.steps.values()], ["same", "same"], "deleting a step does not flag the others as moved");

  const inserted = diffAgainstSnapshot(snap, [snap[0], { id: 9, instruction: "new" }, snap[1], snap[2]]);
  assert.equal(inserted.steps.get(9), "new");
  assert.deepEqual([inserted.steps.get(1), inserted.steps.get(2), inserted.steps.get(3)], ["same", "same", "same"], "inserting a step does not flag the steps after it as moved");

  assert.equal(diffAgainstSnapshot(snap, snap.map((s) => ({ ...s, instruction: `  ${s.instruction}  ` }))).stale, false, "whitespace is not an edit");
});

test("insertAt places a step in the middle, clamps, and never mutates", () => {
  const ids = [1, 2, 3];
  assert.deepEqual(insertAt(ids, 9, 0), [9, 1, 2, 3]);
  assert.deepEqual(insertAt(ids, 9, 2), [1, 2, 9, 3]);
  assert.deepEqual(insertAt(ids, 9, 3), [1, 2, 3, 9]);
  assert.deepEqual(insertAt(ids, 9, 99), [1, 2, 3, 9]);
  assert.deepEqual(insertAt(ids, 9, -5), [9, 1, 2, 3]);
  assert.deepEqual(ids, [1, 2, 3]);
});

test("every story step maps to a legend phase, in order", () => {
  const phases = STORY.map((s) => phaseOf(s.id));
  assert.deepEqual(phases, ["rest", "spot", "spot", "spot", "think", "think", "caption", "caption", "rest"]);
});

test("time text is built from fixed tables, so it is identical in every engine", () => {
  const at = "2026-11-04T03:25:00Z"; // 10:25 PM on Nov 3 in New York
  assert.equal(formatStamp(at, "America/New_York"), "Nov 3, 10:25 PM");
  assert.equal(formatStamp(at, "UTC"), "Nov 4, 3:25 AM");
  assert.equal(formatStamp(at, "Asia/Tokyo"), "Nov 4, 12:25 PM");
  assert.equal(formatClock(at, "America/New_York"), "10:25 PM");
  assert.equal(formatDay(at, "America/New_York"), "Nov 3, 2026");
  // 12-hour edge cases: midnight is 12:00 AM, noon is 12:00 PM, 00:05 is 12:05 AM
  assert.equal(formatClock("2026-11-04T05:00:00Z", "America/New_York"), "12:00 AM");
  assert.equal(formatClock("2026-11-04T17:00:00Z", "America/New_York"), "12:00 PM");
  assert.equal(formatClock("2026-11-04T05:05:00Z", "America/New_York"), "12:05 AM");
  assert.equal(formatClock("2026-11-04T13:07:00Z", "UTC"), "1:07 PM");
  // ASCII only: no narrow no-break space before AM/PM, no locale-specific " at "
  assert.match(formatStamp(at, "America/New_York"), /^[\x20-\x7e]+$/);
});

test("time text does not change when an engine formats dates the Safari way", () => {
  const proto = Intl.DateTimeFormat.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "format")!;
  const toParts = proto.formatToParts;
  const at = "2026-11-04T03:25:00Z";
  const before = [formatStamp(at, "America/New_York"), formatClock(at, "America/New_York"), formatDay(at, "America/New_York"), dayLabel("2026-05-01", "2026-05-10")];
  // Simulate Safari: " at " between date and time, plain spaces, different punctuation.
  Object.defineProperty(proto, "format", { configurable: true, get() { return (d: Date) => `Nov 3 at 10:25 PM (${d.getTime()})`; } });
  proto.formatToParts = function (this: Intl.DateTimeFormat, d?: Date | number) {
    return toParts.call(this, d).map((p) => (p.type === "literal" ? { ...p, value: p.value === ", " ? " at " : p.value.replace("\u202f", " ") } : p));
  };
  try {
    const during = [formatStamp(at, "America/New_York"), formatClock(at, "America/New_York"), formatDay(at, "America/New_York"), dayLabel("2026-05-01", "2026-05-10")];
    assert.deepEqual(during, before);
  } finally {
    Object.defineProperty(proto, "format", descriptor);
    proto.formatToParts = toParts;
  }
});

test("dayKey and dayLabel agree across zones and never use Intl for the words", () => {
  assert.equal(dayKey("2026-11-04T03:25:00Z", "America/New_York"), "2026-11-03");
  assert.equal(dayKey("2026-11-04T03:25:00Z", "Asia/Tokyo"), "2026-11-04");
  assert.equal(dayLabel("2026-10-26", "2026-11-03"), "Monday, October 26");
  assert.equal(dayLabel("2025-12-31", "2026-01-02"), "Wednesday, December 31, 2025");
});
