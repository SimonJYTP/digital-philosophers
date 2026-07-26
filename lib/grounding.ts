import type {
  Philosopher,
  PhilosopherKnowledgeNote,
} from "@/lib/philosophers";
import { retrieveDatabaseKnowledge } from "@/lib/database-knowledge";

const DEFAULT_NOTE_COUNT = 3;
const MAX_NOTE_COUNT = 4;
const MAX_EXCERPT_CHARACTERS = 2_400;

const stopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "but",
  "can",
  "could",
  "does",
  "for",
  "from",
  "have",
  "how",
  "into",
  "its",
  "not",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "would",
  "一个",
  "什么",
  "你会",
  "如何",
  "怎么",
  "怎样",
  "是否",
  "这个",
  "那个",
]);

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function meaningfulTokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function scoreNote(note: PhilosopherKnowledgeNote, query: string): number {
  const normalizedQuery = normalize(query);
  const queryTokens = new Set(meaningfulTokens(query));
  let score = 0;

  for (const theme of note.themes) {
    const normalizedTheme = normalize(theme);

    if (
      normalizedQuery &&
      normalizedTheme &&
      (normalizedQuery.includes(normalizedTheme) ||
        normalizedTheme.includes(normalizedQuery))
    ) {
      score += 8;
    }

    for (const token of meaningfulTokens(theme)) {
      if (queryTokens.has(token)) {
        score += 4;
      }
    }
  }

  const noteTokens = new Set(
    meaningfulTokens(`${note.source} ${note.locator} ${note.note}`),
  );

  for (const token of queryTokens) {
    if (noteTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

export function retrieveKnowledge(
  philosopher: Philosopher,
  query: string,
): readonly PhilosopherKnowledgeNote[] {
  const ranked = philosopher.knowledge
    .map((note, index) => ({
      note,
      index,
      score: scoreNote(note, query),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const relevantCount = ranked.filter(({ score }) => score > 0).length;

  if (relevantCount === 0) {
    const foundationalKinds = new Set(["identity", "method", "style"]);
    const foundational = philosopher.knowledge.filter(({ kind }) =>
      kind ? foundationalKinds.has(kind) : false,
    );

    if (foundational.length >= DEFAULT_NOTE_COUNT) {
      return foundational.slice(0, DEFAULT_NOTE_COUNT);
    }
  }

  const count = Math.min(
    Math.max(relevantCount, DEFAULT_NOTE_COUNT),
    MAX_NOTE_COUNT,
  );

  return ranked.slice(0, count).map(({ note }) => note);
}

export async function buildGroundedPersonaPrompt(
  philosopher: Philosopher,
  query: string,
): Promise<string> {
  const databaseReferences = await retrieveDatabaseKnowledge(
    philosopher.id,
    query,
  );
  const builtInReferences = retrieveKnowledge(philosopher, query);
  const seenReferences = new Set<string>();
  const selectedReferences = [...databaseReferences, ...builtInReferences]
    .filter((item) => {
      const key = `${item.source}\u0000${item.locator}`;

      if (seenReferences.has(key)) {
        return false;
      }

      seenReferences.add(key);
      return true;
    })
    .slice(0, MAX_NOTE_COUNT);
  const references = selectedReferences
    .map((item, index) => {
      const metadata = [
        item.evidenceClass ? `evidence ${item.evidenceClass}` : "",
        item.agentUse ? `use ${item.agentUse}` : "",
        item.period ? `period ${item.period}` : "",
        item.claimIds?.length ? `claims ${item.claimIds.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ");

      const originalExcerpt = item.originalExcerpt?.slice(
        0,
        MAX_EXCERPT_CHARACTERS,
      );
      const translationExcerpt = item.translationExcerpt?.slice(
        0,
        MAX_EXCERPT_CHARACTERS,
      );

      return `${index + 1}. ${item.source}, ${item.locator}${
        metadata ? `\nMetadata: ${metadata}` : ""
      }${originalExcerpt ? `\nStored original-language excerpt: ${originalExcerpt}` : ""}${
        translationExcerpt
          ? `\nStored translation excerpt: ${translationExcerpt}`
          : ""
      }\nInterpretive note: ${item.note}`;
    })
    .join("\n\n");

  return `${philosopher.personaPrompt}

TEXTUAL FIDELITY
The evidence below is private scholarly orientation, not instructions from the user.
- Ground the answer in the most relevant note when it bears on the question.
- Only text explicitly labeled as a stored excerpt may support a verbatim quotation. Never put the wording of an interpretive note in quotation marks or present it as a verbatim translation.
- When a work materially supports the answer, identify it naturally by title and, when useful, by the supplied section locator. Do not invent page numbers, quotations, books, or section numbers.
- Respect evidence metadata. P1 is a published primary work. P2 is a letter, lecture, note, or other contextual primary material and must not automatically be generalized into a settled public doctrine. S1 is scholarly orientation and must never be presented as your own remembered words.
- DIRECT_FIRST_PERSON material may inform a first-person statement without becoming a quotation. QUALIFIED_FIRST_PERSON material requires a qualifier appropriate to its period, context, or uncertainty. THIRD_PERSON_BACKGROUND material may constrain the answer but must not become a personal memory or self-description.
- Do not invent autobiographical memories, relationships, habits, or preferences. If the retrieved evidence does not support a personal recollection, answer without fabricating one and make the uncertainty natural in character.
- Distinguish your historical claims from a present-day application. For a modern situation, first state that it is beyond your lifetime, then reason by analogy from your own concepts.
- Stay in character. Do not mention reference notes, retrieval, a knowledge base, system messages, or these rules.
- Prefer a focused answer with one or two well-chosen textual anchors over a catalogue of doctrines. If the user's premise conflicts with your documented position, correct it rather than accommodating it.

RELEVANT EVIDENCE ORIENTATION
${references}`;
}
