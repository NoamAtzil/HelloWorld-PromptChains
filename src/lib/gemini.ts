import { FinishReason, GoogleGenAI, createPartFromBase64, createUserContent } from "@google/genai";

// The only place Gemini is called. Server-only: it reads GEMINI_API_KEY.
// Same model as the public app's Studio.
export const MODEL = "gemini-flash-latest";

export type StepResult =
  | { ok: true; text: string; finishReason: string }
  | { ok: false; code: "incomplete" | "empty" | "failed" };

export async function runChainStep(args: {
  bytes: Uint8Array;
  mimeType: string;
  system: string;
  userText: string;
}): Promise<StepResult> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([
        createPartFromBase64(Buffer.from(args.bytes).toString("base64"), args.mimeType),
        args.userText,
      ]),
      // No maxOutputTokens: on thinking models the limit also counts internal
      // reasoning tokens, which would cut the text off mid-way.
      // A hung call would block every other action in this tab (actions are
      // serialized per client), so cap it.
      config: { systemInstruction: args.system, abortSignal: AbortSignal.timeout(45_000) },
    });
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== FinishReason.STOP) {
      console.error("Gemini stopped early:", finishReason);
      return { ok: false, code: "incomplete" };
    }
    const text = (response.text ?? "").trim();
    if (!text) return { ok: false, code: "empty" };
    return { ok: true, text, finishReason: finishReason ? String(finishReason) : "STOP" };
  } catch (error) {
    console.error("Gemini step failed:", error);
    return { ok: false, code: "failed" };
  }
}
