export type DebateSpeechPhase = "opening" | "debate" | "closing";

export type DebateTranscriptEntry = Readonly<{
  id: string;
  role: "user" | "philosopher";
  speakerId?: string;
  text: string;
  phase: DebateSpeechPhase | "interjection";
}>;

export type DebateRequest = Readonly<{
  participantIds: string[];
  topic: string;
  transcript: DebateTranscriptEntry[];
  phase: DebateSpeechPhase;
  requestedSpeakerId?: string;
  respondToInterjectionId?: string;
}>;

export type DebateResponseLanguage = "zh-CN" | "en";

const CHINESE_LANGUAGE_REQUESTS = [
  /\b(?:answer|respond|reply|speak|write|continue)(?:\s+\w+){0,3}\s+in\s+(?:chinese|mandarin)\b/i,
  /\b(?:chinese|mandarin)\s+(?:only|please)\b/i,
  /(?:请|改为|务必|只)?(?:用|使用|说|讲|以)(?:中文|汉语)(?:回答|回复|作答|发言|辩论)?/i,
  /(?:中文|汉语)(?:回答|回复|作答|发言|辩论)/i,
];
const ENGLISH_LANGUAGE_REQUESTS = [
  /\b(?:answer|respond|reply|speak|write|continue)(?:\s+\w+){0,3}\s+in\s+english\b/i,
  /\benglish\s+(?:only|please)\b/i,
  /(?:请|改为|务必|只)?(?:用|使用|说|讲|以)(?:英文|英语)(?:回答|回复|作答|发言|辩论)?/i,
  /(?:英文|英语)(?:回答|回复|作答|发言|辩论)/i,
];

function explicitResponseLanguage(
  text: string,
): DebateResponseLanguage | undefined {
  const matches: Array<{
    index: number;
    language: DebateResponseLanguage;
  }> = [];

  for (const pattern of CHINESE_LANGUAGE_REQUESTS) {
    const match = pattern.exec(text);

    if (match?.index !== undefined) {
      matches.push({ index: match.index, language: "zh-CN" });
    }
  }

  for (const pattern of ENGLISH_LANGUAGE_REQUESTS) {
    const match = pattern.exec(text);

    if (match?.index !== undefined) {
      matches.push({ index: match.index, language: "en" });
    }
  }

  return matches.sort((left, right) => right.index - left.index)[0]
    ?.language;
}

function languageCharacterCounts(text: string): {
  han: number;
  latin: number;
} {
  return {
    han: text.match(/\p{Script=Han}/gu)?.length ?? 0,
    latin: text.match(/[A-Za-z]/g)?.length ?? 0,
  };
}

function detectedResponseLanguage(
  text: string,
): DebateResponseLanguage | undefined {
  const { han, latin } = languageCharacterCounts(text);

  if (han === 0 && latin === 0) {
    return undefined;
  }

  if (han >= 2 && (latin < 8 || han * 3 >= latin)) {
    return "zh-CN";
  }

  if (latin > 0) {
    return "en";
  }

  return "zh-CN";
}

export function inferDebateResponseLanguage(
  topic: string,
  latestUserInput?: string,
): DebateResponseLanguage {
  const latestExplicit = latestUserInput
    ? explicitResponseLanguage(latestUserInput)
    : undefined;

  if (latestExplicit) {
    return latestExplicit;
  }

  const topicExplicit = explicitResponseLanguage(topic);

  if (topicExplicit) {
    return topicExplicit;
  }

  if (latestUserInput) {
    const counts = languageCharacterCounts(latestUserInput);

    if (counts.han >= 2 || counts.latin >= 8) {
      const latestDetected = detectedResponseLanguage(latestUserInput);

      if (latestDetected) {
        return latestDetected;
      }
    }
  }

  return detectedResponseLanguage(topic) ?? "en";
}

export const DEBATE_SPEECH_COMPLETE_MARKER = "\u001e";

const SENTENCE_TERMINATORS = new Set([".", "!", "?", "。", "！", "？"]);
const SENTENCE_CLOSERS = new Set([
  '"',
  "'",
  "”",
  "’",
  "）",
  ")",
  "]",
  "}",
  "*",
  "_",
  "`",
  "~",
]);

function isSentenceTerminator(text: string, index: number): boolean {
  const character = text[index];

  if (!SENTENCE_TERMINATORS.has(character)) {
    return false;
  }

  if (character !== ".") {
    return true;
  }

  const previous = text[index - 1];
  const next = text[index + 1];

  if (previous === "." || next === ".") {
    return false;
  }

  if (/\d/.test(previous ?? "") && /\d/.test(next ?? "")) {
    return false;
  }

  return true;
}

export function completeSentencePrefixLength(text: string): number {
  let lastCompleteIndex = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!isSentenceTerminator(text, index)) {
      continue;
    }

    let boundary = index + 1;

    while (
      boundary < text.length &&
      (SENTENCE_CLOSERS.has(text[boundary]) ||
        /\s/.test(text[boundary]))
    ) {
      boundary += 1;
    }

    lastCompleteIndex = boundary;
  }

  return lastCompleteIndex;
}

export function endsWithCompleteSentence(text: string): boolean {
  return (
    text.trim().length > 0 &&
    completeSentencePrefixLength(text) === text.length
  );
}
