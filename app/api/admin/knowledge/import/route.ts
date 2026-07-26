import { getDb } from "@/db";
import { getPhilosopher } from "@/lib/philosophers";
import { getBooksBinding } from "@/lib/runtime-bindings";

export const maxDuration = 120;

const MAX_FILE_BYTES = 50 * 1024 * 1024;
// D1 Free allows 50 queries per Worker invocation. Two statements are
// reserved for work and edition metadata.
const MAX_PASSAGES = 48;
const MAX_PASSAGE_TEXT = 20_000;

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

type ImportManifest = Readonly<{
  philosopherId?: string;
  work?: Readonly<Record<string, unknown>>;
  edition?: Readonly<Record<string, unknown>>;
  passages?: readonly Readonly<Record<string, unknown>>[];
}>;

function textValue(
  value: unknown,
  label: string,
  maximum = 2_000,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  ) {
    throw new Error(`${label} is required and must be at most ${maximum} characters.`);
  }

  return value.trim();
}

function optionalText(value: unknown, maximum = 2_000): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string" || value.trim().length > maximum) {
    throw new Error(`An optional text field exceeds ${maximum} characters.`);
  }

  return value.trim() || null;
}

function slugValue(value: unknown, label: string): string {
  const slug = textValue(value, label, 160);

  if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) {
    throw new Error(`${label} must be a lowercase stable identifier.`);
  }

  return slug;
}

function integerValue(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function stringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`${label} must be an array of strings.`);
  }

  return value.map((item) => item.trim()).filter(Boolean).slice(0, 64);
}

function enumValue(
  value: unknown,
  allowed: ReadonlySet<string>,
  fallback: string,
  label: string,
): string {
  const candidate = optionalText(value, 80) ?? fallback;

  if (!allowed.has(candidate)) {
    throw new Error(`${label} has an unsupported value.`);
  }

  return candidate;
}

async function sha256(value: string | ArrayBuffer): Promise<Uint8Array> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function hexadecimal(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isAuthorized(request: Request): Promise<boolean> {
  const expected = process.env.KNOWLEDGE_IMPORT_TOKEN?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!expected || !supplied) {
    return false;
  }

  const [expectedHash, suppliedHash] = await Promise.all([
    sha256(expected),
    sha256(supplied),
  ]);
  let difference = 0;

  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= expectedHash[index] ^ suppliedHash[index];
  }

  return difference === 0;
}

function safeFilename(filename: string): string {
  const normalized = filename
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "source.bin";
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const books = getBooksBinding();

  if (!books) {
    return Response.json(
      { error: "The R2 `BOOKS` binding is unavailable." },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const manifestField = formData.get("manifest");
    const sourceFile = formData.get("file");

    if (typeof manifestField !== "string") {
      return Response.json(
        { error: "The multipart `manifest` field must contain JSON." },
        { status: 400 },
      );
    }

    if (!(sourceFile instanceof File)) {
      return Response.json(
        { error: "The multipart `file` field is required." },
        { status: 400 },
      );
    }

    if (sourceFile.size === 0 || sourceFile.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: "The source file must be between 1 byte and 50 MB." },
        { status: 413 },
      );
    }

    const manifest = JSON.parse(manifestField) as ImportManifest;
    const philosopherId = slugValue(
      manifest.philosopherId,
      "philosopherId",
    );

    if (!getPhilosopher(philosopherId)) {
      return Response.json(
        { error: "The manifest references an unknown philosopher." },
        { status: 400 },
      );
    }

    const work = manifest.work ?? {};
    const edition = manifest.edition ?? {};
    const passages = manifest.passages ?? [];

    if (passages.length === 0 || passages.length > MAX_PASSAGES) {
      throw new Error(
        `passages must contain between 1 and ${MAX_PASSAGES} records.`,
      );
    }

    const workId = slugValue(work.id, "work.id");
    const editionId = slugValue(edition.id, "edition.id");
    const requestedR2Key = optionalText(edition.r2Key, 500);
    const requiredPrefix = `sources/${philosopherId}/${workId}/${editionId}/`;
    const r2Key =
      requestedR2Key ??
      `${requiredPrefix}${safeFilename(sourceFile.name)}`;

    if (!r2Key.startsWith(requiredPrefix) || r2Key.includes("..")) {
      throw new Error(`edition.r2Key must begin with ${requiredPrefix}`);
    }

    const sourceArrayBuffer = await sourceFile.arrayBuffer();
    const fileSha256 = hexadecimal(await sha256(sourceArrayBuffer));
    const db = getDb();
    const workStatement = db
      .prepare(
        `INSERT INTO works (
          id, philosopher_id, title, original_title, work_type,
          original_language, first_published_year, source_tier,
          rights_status, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ON CONFLICT(id) DO UPDATE SET
          philosopher_id = excluded.philosopher_id,
          title = excluded.title,
          original_title = excluded.original_title,
          work_type = excluded.work_type,
          original_language = excluded.original_language,
          first_published_year = excluded.first_published_year,
          source_tier = excluded.source_tier,
          rights_status = excluded.rights_status,
          notes = excluded.notes,
          status = excluded.status,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        workId,
        philosopherId,
        textValue(work.title, "work.title"),
        optionalText(work.originalTitle),
        optionalText(work.workType, 80) ?? "book",
        optionalText(work.originalLanguage, 80),
        integerValue(work.firstPublishedYear),
        optionalText(work.sourceTier, 20) ?? "P1",
        optionalText(work.rightsStatus, 80) ?? "unknown",
        optionalText(work.notes),
      );
    const editionStatement = db
      .prepare(
        `INSERT INTO editions (
          id, work_id, label, language, translator, editor, publisher,
          published_year, isbn, source_url, rights_status, license_note,
          r2_key, original_filename, mime_type, file_sha256, file_size, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ON CONFLICT(id) DO UPDATE SET
          work_id = excluded.work_id,
          label = excluded.label,
          language = excluded.language,
          translator = excluded.translator,
          editor = excluded.editor,
          publisher = excluded.publisher,
          published_year = excluded.published_year,
          isbn = excluded.isbn,
          source_url = excluded.source_url,
          rights_status = excluded.rights_status,
          license_note = excluded.license_note,
          r2_key = excluded.r2_key,
          original_filename = excluded.original_filename,
          mime_type = excluded.mime_type,
          file_sha256 = excluded.file_sha256,
          file_size = excluded.file_size,
          status = excluded.status,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        editionId,
        workId,
        textValue(edition.label, "edition.label"),
        textValue(edition.language, "edition.language", 80),
        optionalText(edition.translator),
        optionalText(edition.editor),
        optionalText(edition.publisher),
        integerValue(edition.publishedYear),
        optionalText(edition.isbn, 80),
        optionalText(edition.sourceUrl, 1_000),
        optionalText(edition.rightsStatus, 80) ?? "unknown",
        optionalText(edition.licenseNote),
        r2Key,
        sourceFile.name,
        sourceFile.type || "application/octet-stream",
        fileSha256,
        sourceFile.size,
      );
    const passageStatements = passages.map((passage, index) => {
      const id = slugValue(passage.id, `passages[${index}].id`);
      const locator = textValue(
        passage.locator,
        `passages[${index}].locator`,
      );
      const originalText = optionalText(
        passage.originalText,
        MAX_PASSAGE_TEXT,
      );
      const translationText = optionalText(
        passage.translationText,
        MAX_PASSAGE_TEXT,
      );
      const interpretiveNote = textValue(
        passage.interpretiveNote,
        `passages[${index}].interpretiveNote`,
        MAX_PASSAGE_TEXT,
      );
      const themes = stringArray(
        passage.themes ?? [],
        `passages[${index}].themes`,
      );
      const claimIds = stringArray(
        passage.claimIds ?? [],
        `passages[${index}].claimIds`,
      );
      const searchText = [
        work.title,
        work.originalTitle,
        locator,
        originalText,
        translationText,
        interpretiveNote,
        ...themes,
      ]
        .filter(Boolean)
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase();

      return db
        .prepare(
          `INSERT INTO passages (
            id, edition_id, sequence, locator, citation_label,
            original_text, translation_text, interpretive_note, search_text,
            themes_json, kind, evidence_class, agent_use, period,
            claim_ids_json, priority, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            edition_id = excluded.edition_id,
            sequence = excluded.sequence,
            locator = excluded.locator,
            citation_label = excluded.citation_label,
            original_text = excluded.original_text,
            translation_text = excluded.translation_text,
            interpretive_note = excluded.interpretive_note,
            search_text = excluded.search_text,
            themes_json = excluded.themes_json,
            kind = excluded.kind,
            evidence_class = excluded.evidence_class,
            agent_use = excluded.agent_use,
            period = excluded.period,
            claim_ids_json = excluded.claim_ids_json,
            priority = excluded.priority,
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          id,
          editionId,
          Number.isInteger(passage.sequence) ? (passage.sequence as number) : index + 1,
          locator,
          optionalText(passage.citationLabel),
          originalText,
          translationText,
          interpretiveNote,
          searchText,
          JSON.stringify(themes),
          enumValue(passage.kind, allowedKinds, "doctrine", "passage.kind"),
          enumValue(
            passage.evidenceClass,
            allowedEvidenceClasses,
            "P1",
            "passage.evidenceClass",
          ),
          enumValue(
            passage.agentUse,
            allowedAgentUses,
            "QUALIFIED_FIRST_PERSON",
            "passage.agentUse",
          ),
          optionalText(passage.period),
          JSON.stringify(claimIds),
          Number.isInteger(passage.priority) ? (passage.priority as number) : 0,
          passage.status === "active" ? "active" : "draft",
        );
    });

    await books.put(r2Key, sourceArrayBuffer, {
      customMetadata: {
        editionId,
        fileSha256,
        philosopherId,
        workId,
      },
      httpMetadata: {
        contentType: sourceFile.type || "application/octet-stream",
      },
    });
    await db.batch([workStatement, editionStatement, ...passageStatements]);

    return Response.json(
      {
        editionId,
        fileSha256,
        fileSize: sourceFile.size,
        passageCount: passages.length,
        r2Key,
        workId,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Knowledge import failed.";
    console.error("Knowledge import error:", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
