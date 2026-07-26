"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PublicPhilosopher = {
  id: string;
  name: string;
  era: string;
  bio: string;
  monogram: string;
};

function displayErrorMessage(message: string | undefined) {
  if (!message) {
    return "The model could not be reached. Please try again.";
  }

  if (/failed to fetch|network|econn/i.test(message)) {
    return "The archive could not reach the server. Check your connection and try again.";
  }

  return message;
}

export function ChatRoom({
  philosopher,
}: {
  philosopher: PublicPhilosopher;
}) {
  const [input, setInput] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { philosopherId: philosopher.id },
      }),
    [philosopher.id],
  );

  const {
    messages,
    sendMessage,
    regenerate,
    clearError,
    error,
    status,
  } = useChat({ transport });

  const isBusy = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && !isBusy;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, error]);

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();

    if (!text || isBusy) {
      return;
    }

    if (error) {
      clearError();
    }

    setInput("");
    await sendMessage({ text });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  function retryLastMessage() {
    clearError();
    void regenerate();
  }

  return (
    <section className="conversation-panel" aria-label={`Chat with ${philosopher.name}`}>
      <header className="conversation-header">
        <div>
          <p>Now in conversation</p>
          <h2>{philosopher.name}</h2>
        </div>
        <div className="presence">
          <span aria-hidden="true" />
          Archive open
        </div>
      </header>

      <div className="transcript" aria-live="polite">
        {messages.length === 0 ? (
          <div className="opening-note">
            <span className="opening-mark" aria-hidden="true">
              “
            </span>
            <p>
              A good dialogue begins with a question you are willing to examine.
            </p>
            <small>
              Ask about virtue, knowledge, duty, society—or a dilemma of your own.
            </small>
          </div>
        ) : (
          messages.map((message) => {
            const text = message.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("");

            if (!text) {
              return null;
            }

            return (
              <article
                className={`message message-${message.role}`}
                key={message.id}
              >
                <div className="message-author">
                  <span aria-hidden="true">
                    {message.role === "user" ? "You" : philosopher.monogram}
                  </span>
                  {message.role === "user" ? "Your question" : philosopher.name}
                </div>
                <p>{text}</p>
              </article>
            );
          })
        )}

        {status === "submitted" ? (
          <div className="thinking-state" role="status">
            <span />
            <span />
            <span />
            <p>{philosopher.name} considers your question…</p>
          </div>
        ) : null}

        {status === "streaming" ? (
          <p className="streaming-label" role="status">
            <span aria-hidden="true" /> Replying…
          </p>
        ) : null}

        {error ? (
          <div className="error-note" role="alert">
            <div>
              <strong>The dialogue was interrupted.</strong>
              <p>{displayErrorMessage(error.message)}</p>
            </div>
            <button type="button" onClick={retryLastMessage}>
              Retry
            </button>
          </div>
        ) : null}

        <div ref={transcriptEndRef} />
      </div>

      <form className="composer" onSubmit={submitMessage}>
        <label htmlFor="message">Your question</label>
        <div className="composer-field">
          <textarea
            id="message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${philosopher.name} something worth examining…`}
            rows={2}
            disabled={isBusy}
          />
          <button
            className="send-button"
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
          >
            <span>Send</span>
            <span aria-hidden="true">↑</span>
          </button>
        </div>
        <p className="composer-note">
          Enter to send · Shift + Enter for a new line · AI interpretation
        </p>
      </form>
    </section>
  );
}
