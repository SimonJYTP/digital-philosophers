import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";

import { getPhilosopher } from "@/lib/philosophers";

export const maxDuration = 30;

type ChatRequest = {
  messages?: UIMessage[];
  philosopherId?: string;
};

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

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return new Response(
      "OPENAI_API_KEY is not configured. Add it to .env.local, restart the server, and retry.",
      { status: 503 },
    );
  }

  let body: ChatRequest;

  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response("The chat request was not valid JSON.", { status: 400 });
  }

  const philosopher =
    typeof body.philosopherId === "string"
      ? getPhilosopher(body.philosopherId)
      : undefined;

  if (!philosopher) {
    return new Response("Select a valid philosopher before starting a dialogue.", {
      status: 400,
    });
  }

  if (!Array.isArray(body.messages)) {
    return new Response("The chat request did not include a message history.", {
      status: 400,
    });
  }

  const openai = createOpenAI({
    apiKey,
    ...(process.env.OPENAI_BASE_URL?.trim()
      ? { baseURL: process.env.OPENAI_BASE_URL.trim() }
      : {}),
  });

  try {
    const result = streamText({
      model: openai.chat(process.env.OPENAI_MODEL?.trim() || "deepseek-v4-pro"),
      system: philosopher.personaPrompt,
      messages: await convertToModelMessages(body.messages),
    });

    return result.toUIMessageStreamResponse({
      onError: readableProviderError,
    });
  } catch (error) {
    console.error("Chat provider error:", error);
    return new Response(readableProviderError(error), { status: 502 });
  }
}
