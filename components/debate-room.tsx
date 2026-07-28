"use client";

import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  DebateRequest,
  DebateSpeechPhase,
  DebateTranscriptEntry,
} from "@/lib/debate";
import {
  DEBATE_SPEECH_COMPLETE_MARKER,
  endsWithCompleteSentence,
} from "@/lib/debate";

export type PublicDebatePhilosopher = Readonly<{
  id: string;
  name: string;
  era: string;
  bio: string;
  monogram: string;
  portrait: string;
  portraitAlt: string;
  portraitPosition: string;
}>;

type SessionPhase = "setup" | "opening" | "debating" | "closing" | "ended";

type FailedRequest = Readonly<{
  phase: DebateSpeechPhase;
  requestedSpeakerId?: string;
  respondToInterjectionId?: string;
}>;

function displayErrorMessage(message: string | undefined) {
  if (!message) {
    return "The model could not be reached. Please try again.";
  }

  if (/failed to fetch|network|econn/i.test(message)) {
    return "The archive could not reach the server. Check your connection and try again.";
  }

  return message;
}

function makeEntryId() {
  return crypto.randomUUID();
}

export function DebateRoom({
  philosophers,
}: {
  philosophers: readonly PublicDebatePhilosopher[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [setupError, setSetupError] = useState("");
  const [sessionPhase, setSessionPhaseState] =
    useState<SessionPhase>("setup");
  const [sessionTopic, setSessionTopic] = useState("");
  const [participants, setParticipants] = useState<
    readonly PublicDebatePhilosopher[]
  >([]);
  const [transcript, setTranscriptState] = useState<
    DebateTranscriptEntry[]
  >([]);
  const [interjectionInput, setInterjectionInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [activity, setActivity] = useState<"selecting" | "streaming" | null>(
    null,
  );
  const [activeSpeakerId, setActiveSpeakerId] = useState<string>();
  const [error, setError] = useState<string>();
  const [endingRequested, setEndingRequested] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const transcriptRef = useRef<DebateTranscriptEntry[]>([]);
  const participantsRef = useRef<readonly PublicDebatePhilosopher[]>([]);
  const topicRef = useRef("");
  const phaseRef = useRef<SessionPhase>("setup");
  const busyRef = useRef(false);
  const pendingInterjectionIdRef = useRef<string | undefined>(undefined);
  const closingRequestedRef = useRef(false);
  const failedRequestRef = useRef<FailedRequest | undefined>(undefined);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, activity, error]);

  function setSessionPhase(phase: SessionPhase) {
    phaseRef.current = phase;
    setSessionPhaseState(phase);
  }

  function replaceTranscript(entries: DebateTranscriptEntry[]) {
    transcriptRef.current = entries;
    setTranscriptState(entries);
  }

  function appendTranscriptEntry(entry: DebateTranscriptEntry) {
    const next = [...transcriptRef.current, entry];
    replaceTranscript(next);
  }

  function updateTranscriptEntry(id: string, text: string) {
    const next = transcriptRef.current.map((entry) =>
      entry.id === id ? { ...entry, text } : entry,
    );
    replaceTranscript(next);
  }

  function removeTranscriptEntry(id: string) {
    replaceTranscript(
      transcriptRef.current.filter((entry) => entry.id !== id),
    );
  }

  function toggleParticipant(id: string) {
    setSetupError("");
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.filter((participantId) => participantId !== id);
      }

      if (current.length >= 3) {
        setSetupError("A debate may include no more than three philosophers.");
        return current;
      }

      return [...current, id];
    });
  }

  async function requestSpeech(request: FailedRequest): Promise<boolean> {
    if (busyRef.current) {
      return false;
    }

    busyRef.current = true;
    setIsBusy(true);
    setActivity(request.phase === "debate" ? "selecting" : "streaming");
    setActiveSpeakerId(request.requestedSpeakerId);
    setError(undefined);

    let streamedMessageId: string | undefined;

    try {
      const body: DebateRequest = {
        participantIds: participantsRef.current.map(
          (participant) => participant.id,
        ),
        topic: topicRef.current,
        transcript: transcriptRef.current,
        phase: request.phase,
        ...(request.requestedSpeakerId
          ? { requestedSpeakerId: request.requestedSpeakerId }
          : {}),
        ...(request.respondToInterjectionId
          ? { respondToInterjectionId: request.respondToInterjectionId }
          : {}),
      };
      const response = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(
          (await response.text()) ||
            "The language model could not complete this reply. Please retry.",
        );
      }

      const speakerId = response.headers.get("X-Debate-Speaker-Id");
      const speaker = participantsRef.current.find(
        (participant) => participant.id === speakerId,
      );

      if (!speakerId || !speaker || !response.body) {
        throw new Error("The debate response did not identify a valid speaker.");
      }

      setActiveSpeakerId(speakerId);
      setActivity("streaming");
      streamedMessageId = makeEntryId();
      appendTranscriptEntry({
        id: streamedMessageId,
        role: "philosopher",
        speakerId,
        text: "",
        phase: request.phase,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let receivedText = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            receivedText += decoder.decode();
            break;
          }

          receivedText += decoder.decode(value, { stream: true });
          updateTranscriptEntry(
            streamedMessageId,
            receivedText.replaceAll(DEBATE_SPEECH_COMPLETE_MARKER, ""),
          );
        }
      } catch {
        throw new Error(
          "The philosopher's reply was interrupted before it finished. Please retry.",
        );
      }

      if (!receivedText.endsWith(DEBATE_SPEECH_COMPLETE_MARKER)) {
        throw new Error(
          "The philosopher's reply ended before its final sentence was complete. Please retry.",
        );
      }

      const text = receivedText.slice(
        0,
        -DEBATE_SPEECH_COMPLETE_MARKER.length,
      );

      if (!text.trim()) {
        throw new Error("The philosopher returned an empty reply. Please retry.");
      }

      if (!endsWithCompleteSentence(text)) {
        throw new Error(
          "The philosopher's reply ended before its final sentence was complete. Please retry.",
        );
      }

      updateTranscriptEntry(streamedMessageId, text);
      failedRequestRef.current = undefined;
      return true;
    } catch (requestError) {
      if (streamedMessageId) {
        removeTranscriptEntry(streamedMessageId);
      }

      failedRequestRef.current = request;
      setError(
        displayErrorMessage(
          requestError instanceof Error ? requestError.message : undefined,
        ),
      );
      return false;
    } finally {
      busyRef.current = false;
      setIsBusy(false);
      setActivity(null);
      setActiveSpeakerId(undefined);
    }
  }

  async function runOpeningsFrom(startIndex: number) {
    setSessionPhase("opening");

    for (
      let index = startIndex;
      index < participantsRef.current.length;
      index += 1
    ) {
      if (closingRequestedRef.current) {
        await runClosingsFrom(0);
        return;
      }

      const succeeded = await requestSpeech({
        phase: "opening",
        requestedSpeakerId: participantsRef.current[index].id,
      });

      if (!succeeded) {
        return;
      }
    }

    setSessionPhase("debating");
    await drainPendingAction();
  }

  async function runClosingsFrom(startIndex: number) {
    closingRequestedRef.current = false;
    pendingInterjectionIdRef.current = undefined;
    setEndingRequested(false);
    setSessionPhase("closing");

    for (
      let index = startIndex;
      index < participantsRef.current.length;
      index += 1
    ) {
      const succeeded = await requestSpeech({
        phase: "closing",
        requestedSpeakerId: participantsRef.current[index].id,
      });

      if (!succeeded) {
        return;
      }
    }

    setSessionPhase("ended");
  }

  async function drainPendingAction() {
    if (busyRef.current || failedRequestRef.current) {
      return;
    }

    if (closingRequestedRef.current) {
      await runClosingsFrom(0);
      return;
    }

    const pendingInterjectionId = pendingInterjectionIdRef.current;

    if (phaseRef.current === "debating" && pendingInterjectionId) {
      pendingInterjectionIdRef.current = undefined;
      const succeeded = await requestSpeech({
        phase: "debate",
        respondToInterjectionId: pendingInterjectionId,
      });

      if (succeeded) {
        await drainPendingAction();
      }
    }
  }

  async function startDebate(event: FormEvent) {
    event.preventDefault();
    const topic = topicInput.trim();
    const selectedParticipants = philosophers.filter((philosopher) =>
      selectedIds.includes(philosopher.id),
    );

    if (selectedParticipants.length < 2 || selectedParticipants.length > 3) {
      setSetupError("Choose two or three philosophers before starting.");
      return;
    }

    if (!topic) {
      setSetupError("Enter a topic before convening the debate.");
      return;
    }

    setSetupError("");
    setError(undefined);
    setParticipants(selectedParticipants);
    participantsRef.current = selectedParticipants;
    setSessionTopic(topic);
    topicRef.current = topic;
    replaceTranscript([]);
    pendingInterjectionIdRef.current = undefined;
    closingRequestedRef.current = false;
    failedRequestRef.current = undefined;
    setEndingRequested(false);
    await runOpeningsFrom(0);
  }

  async function continueDebate() {
    if (
      busyRef.current ||
      phaseRef.current !== "debating" ||
      error ||
      closingRequestedRef.current
    ) {
      return;
    }

    const succeeded = await requestSpeech({ phase: "debate" });

    if (succeeded) {
      await drainPendingAction();
    }
  }

  async function submitInterjection(event?: FormEvent) {
    event?.preventDefault();
    const text = interjectionInput.trim();

    if (
      !text ||
      !["opening", "debating"].includes(phaseRef.current) ||
      closingRequestedRef.current
    ) {
      return;
    }

    const entryId = makeEntryId();
    appendTranscriptEntry({
      id: entryId,
      role: "user",
      text,
      phase: "interjection",
    });
    pendingInterjectionIdRef.current = entryId;
    setInterjectionInput("");
    setError(undefined);

    if (!busyRef.current && phaseRef.current === "debating") {
      await drainPendingAction();
    }
  }

  function handleInterjectionKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitInterjection();
    }
  }

  async function endDebate() {
    if (
      ["setup", "closing", "ended"].includes(phaseRef.current) ||
      closingRequestedRef.current
    ) {
      return;
    }

    setError(undefined);
    failedRequestRef.current = undefined;
    closingRequestedRef.current = true;
    setEndingRequested(true);

    if (!busyRef.current) {
      await runClosingsFrom(0);
    }
  }

  async function retryFailedRequest() {
    const failedRequest = failedRequestRef.current;

    if (!failedRequest || busyRef.current) {
      return;
    }

    setError(undefined);
    const succeeded = await requestSpeech(failedRequest);

    if (!succeeded) {
      return;
    }

    if (failedRequest.phase === "opening") {
      const speakerIndex = participantsRef.current.findIndex(
        (participant) => participant.id === failedRequest.requestedSpeakerId,
      );
      await runOpeningsFrom(speakerIndex + 1);
      return;
    }

    if (failedRequest.phase === "closing") {
      const speakerIndex = participantsRef.current.findIndex(
        (participant) => participant.id === failedRequest.requestedSpeakerId,
      );
      await runClosingsFrom(speakerIndex + 1);
      return;
    }

    await drainPendingAction();
  }

  function resetDebate() {
    if (busyRef.current) {
      return;
    }

    setSessionPhase("setup");
    setSessionTopic("");
    topicRef.current = "";
    setParticipants([]);
    participantsRef.current = [];
    replaceTranscript([]);
    setInterjectionInput("");
    setError(undefined);
    setEndingRequested(false);
    pendingInterjectionIdRef.current = undefined;
    closingRequestedRef.current = false;
    failedRequestRef.current = undefined;
  }

  const activeSpeaker = participants.find(
    (participant) => participant.id === activeSpeakerId,
  );
  const canInterject =
    ["opening", "debating"].includes(sessionPhase) && !endingRequested;
  const canContinue =
    sessionPhase === "debating" && !isBusy && !error && !endingRequested;
  const phaseLabel = {
    setup: "Awaiting assembly",
    opening: "Opening statements",
    debating: "Free debate",
    closing: "Closing statements",
    ended: "Proceedings concluded",
  }[sessionPhase];

  return (
    <main className="debate-page">
      <header className="debate-site-header">
        <Link className="wordmark" href="/" aria-label="Digital Philosophers home">
          <span className="wordmark-seal">DP</span>
          <span>
            Digital Philosophers
            <small>Dialogues across time</small>
          </span>
        </Link>
        <span className="catalog-mark">The debate chamber</span>
      </header>

      {sessionPhase === "setup" ? (
        <section className="debate-setup" aria-labelledby="debate-title">
          <div className="debate-setup-intro">
            <p className="debate-kicker">Convene the chamber</p>
            <h1 id="debate-title">
              Let ideas meet
              <em>their strongest opposition.</em>
            </h1>
            <p>
              Choose two or three voices, name the question, and allow the
              argument to unfold. You may enter the exchange whenever a claim
              demands an answer.
            </p>
          </div>

          <form className="debate-setup-form" onSubmit={startDebate}>
            <fieldset>
              <legend>
                Participants
                <span>{selectedIds.length} / 3 selected</span>
              </legend>
              <div className="debate-roster">
                {philosophers.map((philosopher, index) => {
                  const isSelected = selectedIds.includes(philosopher.id);
                  const isDisabled = !isSelected && selectedIds.length >= 3;

                  return (
                    <button
                      className="debate-roster-card"
                      type="button"
                      key={philosopher.id}
                      aria-pressed={isSelected}
                      disabled={isDisabled}
                      onClick={() => toggleParticipant(philosopher.id)}
                    >
                      <span className="debate-roster-number" aria-hidden="true">
                        0{index + 1}
                      </span>
                      <span className="debate-roster-monogram" aria-hidden="true">
                        {philosopher.monogram}
                      </span>
                      <span>
                        <strong>{philosopher.name}</strong>
                        <small>{philosopher.era}</small>
                      </span>
                      <span className="debate-selection-mark" aria-hidden="true">
                        {isSelected ? "Selected" : "Select"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="debate-topic-field" htmlFor="debate-topic">
              <span>Question before the chamber</span>
              <textarea
                id="debate-topic"
                rows={3}
                value={topicInput}
                onChange={(event) => {
                  setTopicInput(event.target.value);
                  setSetupError("");
                }}
                placeholder="Is justice whatever benefits the stronger?"
              />
            </label>

            {setupError ? (
              <p className="debate-form-error" role="alert">
                {setupError}
              </p>
            ) : null}

            <button
              className="convene-button"
              type="submit"
              disabled={selectedIds.length < 2 || !topicInput.trim()}
            >
              Convene the debate <span aria-hidden="true">→</span>
            </button>
          </form>
        </section>
      ) : (
        <section className="debate-session" aria-labelledby="session-topic">
          <header className="debate-session-header">
            <div>
              <p>Question before the chamber</p>
              <h1 id="session-topic">{sessionTopic}</h1>
            </div>
            <div className="debate-phase">
              <span aria-hidden="true" />
              {phaseLabel}
            </div>
          </header>

          <div className="debate-session-body">
            <aside className="debate-participants" aria-label="Debate participants">
              <p>Seated in the chamber</p>
              <ol>
                {participants.map((participant, index) => (
                  <li
                    className={`speaker-tone-${index}`}
                    key={participant.id}
                    data-active={participant.id === activeSpeakerId}
                  >
                    <span aria-hidden="true">{participant.monogram}</span>
                    <div>
                      <strong>{participant.name}</strong>
                      <small>{participant.era}</small>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="debate-disclaimer">
                Interpretive voices, not historical records.
              </p>
            </aside>

            <div className="debate-proceedings">
              <div className="debate-transcript" aria-live="polite">
                {transcript.length === 0 ? (
                  <div className="debate-opening-note">
                    <span aria-hidden="true">§</span>
                    <p>The chamber is assembling.</p>
                    <small>The opening statements will follow in archive order.</small>
                  </div>
                ) : (
                  transcript.map((entry) => {
                    if (entry.role === "user") {
                      return (
                        <article
                          className="debate-message debate-user-message"
                          key={entry.id}
                        >
                          <div className="debate-message-author">
                            <span aria-hidden="true">You</span>
                            Audience interjection
                          </div>
                          <p>{entry.text}</p>
                        </article>
                      );
                    }

                    const speaker = participants.find(
                      (participant) => participant.id === entry.speakerId,
                    );
                    const speakerIndex = participants.findIndex(
                      (participant) => participant.id === entry.speakerId,
                    );

                    if (!speaker) {
                      return null;
                    }

                    return (
                      <article
                        className={`debate-message debate-philosopher-message speaker-tone-${speakerIndex}`}
                        key={entry.id}
                      >
                        <div className="debate-message-author">
                          <span aria-hidden="true">{speaker.monogram}</span>
                          <div>
                            <strong>{speaker.name}</strong>
                            <small>{entry.phase} statement</small>
                          </div>
                        </div>
                        <p>{entry.text}</p>
                      </article>
                    );
                  })
                )}

                {activity ? (
                  <div className="debate-thinking" role="status">
                    <span />
                    <span />
                    <span />
                    <p>
                      {activity === "selecting"
                        ? "The argument seeks its next voice…"
                        : `${activeSpeaker?.name ?? "The next speaker"} is composing a response…`}
                    </p>
                  </div>
                ) : null}

                {error ? (
                  <div className="error-note debate-error-note" role="alert">
                    <div>
                      <strong>The proceedings were interrupted.</strong>
                      <p>{error}</p>
                    </div>
                    <button type="button" onClick={retryFailedRequest}>
                      Retry
                    </button>
                  </div>
                ) : null}

                {sessionPhase === "ended" ? (
                  <div className="debate-ended-note">
                    <span aria-hidden="true">Finis</span>
                    <p>The chamber has heard its final statements.</p>
                    <button type="button" onClick={resetDebate}>
                      Convene another debate
                    </button>
                  </div>
                ) : null}

                <div ref={transcriptEndRef} />
              </div>

              {sessionPhase !== "ended" ? (
                <div className="debate-controls">
                  <form
                    className="debate-interjection"
                    onSubmit={submitInterjection}
                  >
                    <label htmlFor="debate-interjection">Your interjection</label>
                    <textarea
                      id="debate-interjection"
                      rows={2}
                      value={interjectionInput}
                      onChange={(event) =>
                        setInterjectionInput(event.target.value)
                      }
                      onKeyDown={handleInterjectionKeyDown}
                      placeholder="Address the chamber—or name the thinker who should answer…"
                      disabled={!canInterject}
                    />
                    <button
                      type="submit"
                      disabled={!canInterject || !interjectionInput.trim()}
                    >
                      Interject
                    </button>
                  </form>

                  <div className="debate-actions">
                    <button
                      className="debate-continue"
                      type="button"
                      onClick={continueDebate}
                      disabled={!canContinue}
                    >
                      Invite the next reply
                    </button>
                    <button
                      className="debate-end"
                      type="button"
                      onClick={endDebate}
                      disabled={
                        sessionPhase === "closing" ||
                        endingRequested ||
                        Boolean(error && failedRequestRef.current?.phase === "closing")
                      }
                    >
                      {endingRequested ? "Closing requested" : "End debate"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
