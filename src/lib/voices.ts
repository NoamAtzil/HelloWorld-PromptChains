// The comedic voices of the public app (HelloWorld/src/lib/voices.ts). A chain's
// voice_id picks one; its instruction steers the style of every step.
export const VOICES = [
  {
    id: "classic",
    label: "Classic",
    instruction: "Voice: a sharp, friendly observational comic. Clean setup, clear punchline.",
  },
  {
    id: "roast",
    label: "Roast Master",
    instruction:
      "Voice: a roast-battle host. Tease what is visible with confident, affectionate burns. Never mock anyone's body, appearance, identity, or any protected trait; aim at the situation, the choices, and the vibe.",
  },
  {
    id: "noir",
    label: "Noir Detective",
    instruction:
      "Voice: a hard-boiled 1940s noir detective narrating the scene in a weary voiceover, with a dry metaphor.",
  },
  {
    id: "nature",
    label: "Nature Doc",
    instruction:
      "Voice: a hushed nature-documentary narrator observing these people or things as if they were rare wildlife in their habitat.",
  },
  {
    id: "grandma",
    label: "Passive-Aggressive Grandma",
    instruction:
      "Voice: a sweet grandmother whose gentle remark is quietly devastating. Polite words, savage subtext.",
  },
  {
    id: "hype",
    label: "Sports Announcer",
    instruction:
      "Voice: an over-the-top live sports commentator treating this mundane moment as a championship play-by-play.",
  },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export function isVoiceId(value: unknown): value is VoiceId {
  return VOICES.some((voice) => voice.id === value);
}

export function voiceLabel(id: string | null | undefined) {
  return VOICES.find((voice) => voice.id === id)?.label ?? null;
}

export function voiceInstruction(id: string | null | undefined) {
  return VOICES.find((voice) => voice.id === id)?.instruction ?? null;
}
