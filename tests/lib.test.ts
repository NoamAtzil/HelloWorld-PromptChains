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
