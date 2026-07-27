import { createOpenAI } from "@ai-sdk/openai";

export type DeepSeekResponseMode = "standard" | "deep";
export type DeepSeekChatModel = ReturnType<
  ReturnType<typeof createOpenAI>["chat"]
>;

function controlledFetch(
  mode: DeepSeekResponseMode,
): typeof globalThis.fetch {
  return async (input, init) => {
    if (typeof init?.body !== "string") {
      return globalThis.fetch(input, init);
    }

    try {
      const payload = JSON.parse(init.body) as Record<string, unknown>;
      const controlledPayload =
        mode === "deep"
          ? {
              ...payload,
              thinking: { type: "enabled" },
              reasoning_effort: "high",
            }
          : {
              ...payload,
              thinking: { type: "disabled" },
            };

      return globalThis.fetch(input, {
        ...init,
        body: JSON.stringify(controlledPayload),
      });
    } catch {
      return globalThis.fetch(input, init);
    }
  };
}

export function createDeepSeekChatModel(
  apiKey: string,
  mode: DeepSeekResponseMode = "standard",
): DeepSeekChatModel {
  const provider = createOpenAI({
    apiKey,
    ...(process.env.OPENAI_BASE_URL?.trim()
      ? { baseURL: process.env.OPENAI_BASE_URL.trim() }
      : {}),
    fetch: controlledFetch(mode),
  });
  const modelId =
    mode === "deep"
      ? process.env.OPENAI_PRO_MODEL?.trim() || "deepseek-v4-pro"
      : process.env.OPENAI_FLASH_MODEL?.trim() || "deepseek-v4-flash";

  return provider.chat(modelId);
}
