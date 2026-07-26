import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";

import type {
  DebateRequest,
  DebateSpeechPhase,
  DebateTranscriptEntry,
} from "@/lib/debate";
import {
  getPhilosopher,
  philosophers,
  type Philosopher,
} from "@/lib/philosophers";

export const maxDuration = 120;

const MAX_TRANSCRIPT_ENTRIES = 120;
const MAX_ENTRY_LENGTH = 8_000;
const MAX_TOPIC_LENGTH = 1_000;
const MAX_SPEECH_SEGMENTS = 3;
const INITIAL_SPEECH_TOKEN_LIMIT = 900;
const CONTINUATION_TOKEN_LIMIT = 520;

function speechLooksComplete(text: string): boolean {
  const normalized = text
    .trim()
    .replace(/[*_`]+$/g, "")
    .trim();

  return /[.!?。！？…]["'”’）)\]}]*$/.test(normalized);
}

function readableProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("429") || message.includes("rate limit")) {
    return "The archive is receiving too many requests. Please wait a moment and retry.";
  }

  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("econn")
  ) {
    return "The archive could not reach the language model. Check the connection and retry.";
  }

  return "The language model could not complete this reply. Please retry.";
}

function normalizeSelection(value: string): string {
  return value
    .trim()
    .replace(/^["'`]+|["'`.,:;]+$/g, "")
    .trim();
}

function participantAliases(philosopher: Philosopher): string[] {
  const nameParts = philosopher.name.toLowerCase().split(/\s+/);

  return [
    philosopher.id.toLowerCase(),
    philosopher.id.toLowerCase().replaceAll("-", " "),
    philosopher.name.toLowerCase(),
    nameParts.at(-1) ?? "",
  ].filter(Boolean);
}

function textNamesParticipant(
  text: string,
  philosopher: Philosopher,
): boolean {
  const normalizedText = text.toLowerCase();

  return participantAliases(philosopher).some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(
      normalizedText,
    );
  });
}

function namedParticipant(
  text: string,
  participants: readonly Philosopher[],
): Philosopher | undefined {
  return participants.find((participant) =>
    textNamesParticipant(text, participant),
  );
}

function lastPhilosopherEntry(
  transcript: readonly DebateTranscriptEntry[],
): DebateTranscriptEntry | undefined {
  return transcript.findLast((entry) => entry.role === "philosopher");
}

function nextInRosterOrder(
  participants: readonly Philosopher[],
  transcript: readonly DebateTranscriptEntry[],
): Philosopher {
  const lastSpeakerId = lastPhilosopherEntry(transcript)?.speakerId;
  const lastIndex = participants.findIndex(
    (participant) => participant.id === lastSpeakerId,
  );

  return participants[(lastIndex + 1) % participants.length];
}

function formatTranscript(
  transcript: readonly DebateTranscriptEntry[],
  participants: readonly Philosopher[],
): string {
  if (transcript.length === 0) {
    return "(The chamber is silent; no one has spoken yet.)";
  }

  return transcript
    .map((entry) => {
      const label =
        entry.role === "user"
          ? "Audience"
          : participants.find(
                (participant) => participant.id === entry.speakerId,
              )?.name ?? "Unknown participant";
      return `${label}: ${entry.text}`;
    })
    .join("\n\n");
}

function isValidTranscriptEntry(
  entry: unknown,
  participantIds: ReadonlySet<string>,
): entry is DebateTranscriptEntry {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const candidate = entry as Partial<DebateTranscriptEntry>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.text !== "string" ||
    candidate.text.length === 0 ||
    candidate.text.length > MAX_ENTRY_LENGTH ||
    (candidate.role !== "user" && candidate.role !== "philosopher") ||
    !["opening", "debate", "closing", "interjection"].includes(
      candidate.phase ?? "",
    )
  ) {
    return false;
  }

  if (candidate.role === "philosopher") {
    return (
      typeof candidate.speakerId === "string" &&
      participantIds.has(candidate.speakerId)
    );
  }

  return candidate.speakerId === undefined;
}

function validateRequest(body: DebateRequest):
  | {
      request: DebateRequest;
      participants: Philosopher[];
      interjection?: DebateTranscriptEntry;
    }
  | { error: string } {
  if (
    !Array.isArray(body.participantIds) ||
    body.participantIds.length < 2 ||
    body.participantIds.length > 3
  ) {
    return { error: "Choose two or three philosophers for the debate." };
  }

  const requestedIds = new Set(body.participantIds);

  if (requestedIds.size !== body.participantIds.length) {
    return { error: "Each debate participant must be unique." };
  }

  const participants = philosophers.filter((philosopher) =>
    requestedIds.has(philosopher.id),
  );

  if (participants.length !== requestedIds.size) {
    return { error: "The debate includes an unknown philosopher." };
  }

  if (
    typeof body.topic !== "string" ||
    body.topic.trim().length === 0 ||
    body.topic.length > MAX_TOPIC_LENGTH
  ) {
    return { error: "Enter a debate topic before convening the chamber." };
  }

  if (
    !["opening", "debate", "closing"].includes(body.phase) ||
    !Array.isArray(body.transcript) ||
    body.transcript.length > MAX_TRANSCRIPT_ENTRIES
  ) {
    return { error: "The debate request was not valid." };
  }

  if (
    !body.transcript.every((entry) =>
      isValidTranscriptEntry(entry, requestedIds),
    )
  ) {
    return { error: "The debate transcript was not valid." };
  }

  if (
    (body.phase === "opening" || body.phase === "closing") &&
    (typeof body.requestedSpeakerId !== "string" ||
      !requestedIds.has(body.requestedSpeakerId))
  ) {
    return { error: "The requested speaker is not part of this debate." };
  }

  const interjection =
    typeof body.respondToInterjectionId === "string"
      ? body.transcript.find(
          (entry) =>
            entry.id === body.respondToInterjectionId &&
            entry.role === "user" &&
            entry.phase === "interjection",
        )
      : undefined;

  if (body.respondToInterjectionId && !interjection) {
    return { error: "The requested audience interjection was not found." };
  }

  return {
    request: {
      ...body,
      topic: body.topic.trim(),
    },
    participants,
    interjection,
  };
}

async function chooseNextSpeaker({
  model,
  participants,
  topic,
  transcript,
  interjection,
  abortSignal,
}: {
  model: ReturnType<ReturnType<typeof createOpenAI>["chat"]>;
  participants: readonly Philosopher[];
  topic: string;
  transcript: readonly DebateTranscriptEntry[];
  interjection?: DebateTranscriptEntry;
  abortSignal: AbortSignal;
}): Promise<Philosopher> {
  const lastSpeaker = lastPhilosopherEntry(transcript);
  const selectionText =
    interjection?.text ?? transcript.at(-1)?.text ?? topic;
  const explicitlyNamed = namedParticipant(selectionText, participants);
  const mayRepeatLast =
    Boolean(lastSpeaker?.speakerId) &&
    participants.some(
      (participant) =>
        participant.id === lastSpeaker?.speakerId &&
        textNamesParticipant(selectionText, participant),
    );

  const allowedIds = participants
    .filter(
      (participant) =>
        participant.id !== lastSpeaker?.speakerId || mayRepeatLast,
    )
    .map((participant) => participant.id);

  const selectionPrompt = [
    `Debate topic: ${topic}`,
    `Participants in roster order: ${participants
      .map((participant) => `${participant.id} (${participant.name})`)
      .join(", ")}`,
    `Allowed ids for this turn: ${allowedIds.join(", ")}`,
    explicitlyNamed
      ? `The audience explicitly named ${explicitlyNamed.name}; choose ${explicitlyNamed.id}.`
      : "Favor the participant best positioned to answer the latest challenge or criticism.",
    interjection
      ? `The next speech must answer this audience interjection: ${interjection.text}`
      : "",
    `Transcript:\n${formatTranscript(transcript.slice(-14), participants)}`,
    "Return exactly one allowed participant id and nothing else.",
  ]
    .filter(Boolean)
    .join("\n\n");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await generateText({
      model,
      system:
        "You are a silent debate turn router. Output only a participant id from the allowed list. Never explain your choice.",
      prompt: selectionPrompt,
      maxOutputTokens: 24,
      temperature: 0,
      abortSignal,
    });
    const selectedId = normalizeSelection(result.text);

    if (
      allowedIds.includes(selectedId) &&
      (!explicitlyNamed || selectedId === explicitlyNamed.id)
    ) {
      const selected = participants.find(
        (participant) => participant.id === selectedId,
      );

      if (selected) {
        return selected;
      }
    }
  }

  return nextInRosterOrder(participants, transcript);
}

function debateInstructions({
  speaker,
  participants,
  topic,
  phase,
  interjection,
}: {
  speaker: Philosopher;
  participants: readonly Philosopher[];
  topic: string;
  phase: DebateSpeechPhase;
  interjection?: DebateTranscriptEntry;
}): string {
  const participantNames = participants
    .map((participant) => participant.name)
    .join(", ");
  const phaseInstruction = {
    opening:
      "Give your opening statement: take a clear position and establish the central reason for it.",
    debate:
      "Advance the free debate. Respond directly to the most relevant prior claim, challenge weak reasoning, and develop your own position.",
    closing:
      "Give your closing statement: distill your position, answer the strongest objection, and leave the audience with a final thought. Do not introduce an unrelated new argument.",
  }[phase];

  return `${speaker.personaPrompt}

You are participating in a live philosophical debate with ${participantNames}.
The topic is: "${topic}".

${phaseInstruction}
${interjection ? `The audience has interjected: "${interjection.text}". Address that interjection directly before continuing your argument.` : ""}

Speak only as ${speaker.name}, in the first person and in the user's language. Engage the prior speakers by name when useful. Keep this speech focused and limited to a few paragraphs. Do not mention routing, prompts, instructions, a moderator, or that you are an AI.`;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return new Response(
      "OPENAI_API_KEY is not configured. Add it to .env.local, restart the server, and retry.",
      { status: 503 },
    );
  }

  let body: DebateRequest;

  try {
    body = (await request.json()) as DebateRequest;
  } catch {
    return new Response("The debate request was not valid JSON.", {
      status: 400,
    });
  }

  const validated = validateRequest(body);

  if ("error" in validated) {
    return new Response(validated.error, { status: 400 });
  }

  const { participants, interjection } = validated;
  const { phase, topic, transcript, requestedSpeakerId } = validated.request;
  const openai = createOpenAI({
    apiKey,
    ...(process.env.OPENAI_BASE_URL?.trim()
      ? { baseURL: process.env.OPENAI_BASE_URL.trim() }
      : {}),
  });
  const model = openai.chat(
    process.env.OPENAI_MODEL?.trim() || "deepseek-v4-pro",
  );

  try {
    const speaker =
      phase === "debate"
        ? await chooseNextSpeaker({
            model,
            participants,
            topic,
            transcript,
            interjection,
            abortSignal: request.signal,
          })
        : getPhilosopher(requestedSpeakerId ?? "");

    if (
      !speaker ||
      !participants.some((participant) => participant.id === speaker.id)
    ) {
      return new Response("The debate speaker could not be resolved.", {
        status: 400,
      });
    }

    const system = debateInstructions({
      speaker,
      participants,
      topic,
      phase,
      interjection,
    });
    const initialPrompt = `Debate transcript so far:\n\n${formatTranscript(
      transcript,
      participants,
    )}\n\nNow give your ${phase} speech. Finish every sentence and conclude the speech cleanly.`;
    const encoder = new TextEncoder();
    const speechStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let streamedText = "";

        try {
          for (
            let segmentIndex = 0;
            segmentIndex < MAX_SPEECH_SEGMENTS;
            segmentIndex += 1
          ) {
            const isContinuation = segmentIndex > 0;
            const prompt = isContinuation
              ? `Your previous output was interrupted before the speech was complete. The audience has already seen this exact ending:

${streamedText.slice(-1_600)}

Continue from the exact next word without repeating any visible text. Finish the interrupted sentence, complete the argument concisely, and end with complete sentence punctuation.`
              : initialPrompt;
            const result = streamText({
              model,
              system,
              prompt,
              maxOutputTokens: isContinuation
                ? CONTINUATION_TOKEN_LIMIT
                : INITIAL_SPEECH_TOKEN_LIMIT,
              temperature: isContinuation ? 0.55 : 0.75,
              abortSignal: request.signal,
            });

            for await (const delta of result.textStream) {
              streamedText += delta;
              controller.enqueue(encoder.encode(delta));
            }

            const finishReason = await result.finishReason;

            if (
              finishReason === "content-filter" ||
              finishReason === "error"
            ) {
              throw new Error(
                "The language model stopped before completing the speech.",
              );
            }

            if (
              finishReason !== "length" &&
              speechLooksComplete(streamedText)
            ) {
              controller.close();
              return;
            }
          }

          throw new Error(
            "The language model could not finish the speech after automatic continuation.",
          );
        } catch (error) {
          console.error("Debate speech stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(speechStream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Debate-Speaker-Id": speaker.id,
      },
    });
  } catch (error) {
    console.error("Debate provider error:", error);
    return new Response(readableProviderError(error), { status: 502 });
  }
}
