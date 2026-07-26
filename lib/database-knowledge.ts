import { tryGetDb } from "@/db";
import type {
  PhilosopherKnowledgeNote,
  PhilosopherKnowledgeNote as KnowledgeNote,
} from "@/lib/philosophers";
import type { D1BindableValue } from "@/lib/runtime-bindings";

const MAX_QUERY_TERMS = 8;
const MAX_CANDIDATES = 80;
const MAX_RESULTS = 4;

type PassageCandidate = Readonly<{
  agent_use: string;
  claim_ids_json: string;
  edition_label: string;
  evidence_class: string;
  interpretive_note: string;
  kind: string;
  locator: string;
  original_text: string | null;
  period: string | null;
  priority: number;
  themes_json: string;
  translation_text: string | null;
  work_title: string;
}>;

const allowedKinds = new Set([
  "identity",
  "doctrine",
  "method",
  "style",
  "biography",
  "boundary",
  "dispute",
]);

const allowedEvidenceClasses = new Set(["P1", "P2", "P3", "S1", "S2"]);

const allowedAgentUses = new Set([
  "DIRECT_FIRST_PERSON",
  "QUALIFIED_FIRST_PERSON",
  "THIRD_PERSON_BACKGROUND",
]);

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function queryTerms(query: string): string[] {
  const normalized = normalize(query);
  const terms = new Set<string>();

  for (const segment of normalized.match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) ?? []) {
    if (/^\p{Script=Han}+$/u.test(segment)) {
      if (segment.length > 1 && segment.length <= 12) {
        terms.add(segment);
      }

      for (let index = 0; index < segment.length - 1; index += 1) {
        terms.add(segment.slice(index, index + 2));
      }
    } else if (segment.length > 1) {
      terms.add(segment.slice(0, 40));
    }

    if (terms.size >= MAX_QUERY_TERMS) {
      break;
    }
  }

  return [...terms].slice(0, MAX_QUERY_TERMS);
}

function candidateToKnowledgeNote(
  candidate: PassageCandidate,
): KnowledgeNote {
  const source =
    candidate.edition_label &&
    candidate.edition_label !== candidate.work_title
      ? `${candidate.work_title} (${candidate.edition_label})`
      : candidate.work_title;
  const kind = allowedKinds.has(candidate.kind)
    ? (candidate.kind as KnowledgeNote["kind"])
    : undefined;
  const evidenceClass = allowedEvidenceClasses.has(candidate.evidence_class)
    ? (candidate.evidence_class as KnowledgeNote["evidenceClass"])
    : undefined;
  const agentUse = allowedAgentUses.has(candidate.agent_use)
    ? (candidate.agent_use as KnowledgeNote["agentUse"])
    : undefined;

  return {
    source,
    locator: candidate.locator,
    themes: parseStringArray(candidate.themes_json),
    note: candidate.interpretive_note,
    kind,
    evidenceClass,
    agentUse,
    claimIds: parseStringArray(candidate.claim_ids_json),
    ...(candidate.original_text
      ? { originalExcerpt: candidate.original_text }
      : {}),
    ...(candidate.translation_text
      ? { translationExcerpt: candidate.translation_text }
      : {}),
    ...(candidate.period ? { period: candidate.period } : {}),
  };
}

function scoreCandidate(candidate: PassageCandidate, terms: readonly string[]) {
  const searchable = normalize(
    [
      candidate.work_title,
      candidate.locator,
      candidate.interpretive_note,
      candidate.themes_json,
    ].join(" "),
  );
  const matchedTerms = terms.filter((term) => searchable.includes(term)).length;

  return matchedTerms * 10 + candidate.priority;
}

export async function retrieveDatabaseKnowledge(
  philosopherId: string,
  query: string,
): Promise<readonly PhilosopherKnowledgeNote[]> {
  const db = tryGetDb();

  if (!db) {
    return [];
  }

  const terms = queryTerms(query);
  const values: D1BindableValue[] = [philosopherId];
  let searchClause =
    "AND p.kind IN ('identity', 'method', 'style', 'doctrine')";

  if (terms.length > 0) {
    searchClause = `AND (${terms
      .map(
        () =>
          "(p.search_text LIKE ? OR p.themes_json LIKE ? OR w.title LIKE ? OR p.locator LIKE ?)",
      )
      .join(" OR ")})`;

    for (const term of terms) {
      const pattern = `%${term}%`;
      values.push(pattern, pattern, pattern, pattern);
    }
  }

  const statement = db
    .prepare(
      `SELECT
        p.agent_use,
        p.claim_ids_json,
        e.label AS edition_label,
        p.evidence_class,
        p.interpretive_note,
        p.kind,
        p.locator,
        p.original_text,
        p.period,
        p.priority,
        p.themes_json,
        p.translation_text,
        w.title AS work_title
      FROM passages p
      INNER JOIN editions e ON e.id = p.edition_id
      INNER JOIN works w ON w.id = e.work_id
      WHERE w.philosopher_id = ?
        AND w.status = 'active'
        AND e.status = 'active'
        AND p.status = 'active'
        ${searchClause}
      ORDER BY p.priority DESC, p.sequence ASC
      LIMIT ${MAX_CANDIDATES}`,
    )
    .bind(...values);

  try {
    const result = await statement.all<PassageCandidate>();

    return result.results
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(candidate, terms),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.candidate.priority - left.candidate.priority,
      )
      .slice(0, MAX_RESULTS)
      .map(({ candidate }) => candidateToKnowledgeNote(candidate));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (
      message.includes("no such table") ||
      message.includes("D1") ||
      message.includes("binding")
    ) {
      return [];
    }

    throw error;
  }
}
