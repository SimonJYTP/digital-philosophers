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
