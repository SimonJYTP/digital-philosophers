import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const args = process.argv.slice(2);
const shouldImportLocal = args.includes("--local");
const manifestArgument = args.find((argument) => !argument.startsWith("--"));

if (!manifestArgument) {
  throw new Error(
    "Usage: npm run knowledge:prepare -- knowledge/manifests/<manifest>.json",
  );
}

const manifestPath = resolve(projectRoot, manifestArgument);
const manifestDirectory = dirname(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function requireSlug(value, label) {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(value)
  ) {
    throw new Error(
      `${label} must use lowercase letters, numbers, dots, underscores, or hyphens.`,
    );
  }

  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function stringArray(value, label) {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`${label} must be an array of strings.`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

function sqlText(value) {
  return value === null || value === undefined
    ? "NULL"
    : `'${String(value).replaceAll("'", "''")}'`;
}

function sqlInteger(value) {
  return value === null || value === undefined ? "NULL" : String(value);
}

function jsonText(value) {
  return sqlText(JSON.stringify(value));
}

function mimeTypeFor(filename) {
  return (
    {
      ".epub": "application/epub+zip",
      ".html": "text/html; charset=utf-8",
      ".md": "text/markdown; charset=utf-8",
      ".pdf": "application/pdf",
      ".txt": "text/plain; charset=utf-8",
    }[extname(filename).toLowerCase()] ?? "application/octet-stream"
  );
}

const philosopherId = requireSlug(manifest.philosopherId, "philosopherId");
const workId = requireSlug(manifest.work?.id, "work.id");
const editionId = requireSlug(manifest.edition?.id, "edition.id");
const sourceFile = resolve(
  manifestDirectory,
  requireText(manifest.sourceFile, "sourceFile"),
);

if (!sourceFile.startsWith(resolve(projectRoot, "knowledge", "source-files"))) {
  throw new Error(
    "sourceFile must be inside knowledge/source-files so original books stay out of Git.",
  );
}

const sourceBytes = await readFile(sourceFile);
const sourceStats = await stat(sourceFile);
const sourceFilename = basename(sourceFile);
const mimeType = mimeTypeFor(sourceFilename);
const fileSha256 = createHash("sha256").update(sourceBytes).digest("hex");
const r2Key =
  optionalText(manifest.edition.r2Key) ??
  `sources/${philosopherId}/${workId}/${editionId}/${sourceFilename}`;
const passages = Array.isArray(manifest.passages) ? manifest.passages : [];

if (passages.length === 0) {
  throw new Error("The manifest must include at least one reviewed passage.");
}

const statements = [
  "PRAGMA foreign_keys = ON;",
  "BEGIN TRANSACTION;",
  `INSERT INTO works (
    id, philosopher_id, title, original_title, work_type,
    original_language, first_published_year, source_tier,
    rights_status, notes, status
  ) VALUES (
    ${sqlText(workId)},
    ${sqlText(philosopherId)},
    ${sqlText(requireText(manifest.work.title, "work.title"))},
    ${sqlText(optionalText(manifest.work.originalTitle))},
    ${sqlText(optionalText(manifest.work.workType) ?? "book")},
    ${sqlText(optionalText(manifest.work.originalLanguage))},
    ${sqlInteger(optionalInteger(manifest.work.firstPublishedYear))},
    ${sqlText(optionalText(manifest.work.sourceTier) ?? "P1")},
    ${sqlText(optionalText(manifest.work.rightsStatus) ?? "unknown")},
    ${sqlText(optionalText(manifest.work.notes))},
    'active'
  )
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
    updated_at = CURRENT_TIMESTAMP;`,
  `INSERT INTO editions (
    id, work_id, label, language, translator, editor, publisher,
    published_year, isbn, source_url, rights_status, license_note,
    r2_key, original_filename, mime_type, file_sha256, file_size, status
  ) VALUES (
    ${sqlText(editionId)},
    ${sqlText(workId)},
    ${sqlText(requireText(manifest.edition.label, "edition.label"))},
    ${sqlText(requireText(manifest.edition.language, "edition.language"))},
    ${sqlText(optionalText(manifest.edition.translator))},
    ${sqlText(optionalText(manifest.edition.editor))},
    ${sqlText(optionalText(manifest.edition.publisher))},
    ${sqlInteger(optionalInteger(manifest.edition.publishedYear))},
    ${sqlText(optionalText(manifest.edition.isbn))},
    ${sqlText(optionalText(manifest.edition.sourceUrl))},
    ${sqlText(optionalText(manifest.edition.rightsStatus) ?? "unknown")},
    ${sqlText(optionalText(manifest.edition.licenseNote))},
    ${sqlText(r2Key)},
    ${sqlText(sourceFilename)},
    ${sqlText(mimeType)},
    ${sqlText(fileSha256)},
    ${sqlInteger(sourceStats.size)},
    'active'
  )
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
    updated_at = CURRENT_TIMESTAMP;`,
];

for (const [index, passage] of passages.entries()) {
  const passageId = requireSlug(passage.id, `passages[${index}].id`);
  const locator = requireText(
    passage.locator,
    `passages[${index}].locator`,
  );
  const interpretiveNote = requireText(
    passage.interpretiveNote,
    `passages[${index}].interpretiveNote`,
  );
  const themes = stringArray(
    passage.themes ?? [],
    `passages[${index}].themes`,
  );
  const claimIds = stringArray(
    passage.claimIds ?? [],
    `passages[${index}].claimIds`,
  );
  const originalText = optionalText(passage.originalText);
  const translationText = optionalText(passage.translationText);
  const searchText = [
    manifest.work.title,
    manifest.work.originalTitle,
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

  statements.push(`INSERT INTO passages (
    id, edition_id, sequence, locator, citation_label,
    original_text, translation_text, interpretive_note, search_text,
    themes_json, kind, evidence_class, agent_use, period,
    claim_ids_json, priority, status
  ) VALUES (
    ${sqlText(passageId)},
    ${sqlText(editionId)},
    ${sqlInteger(
      Number.isInteger(passage.sequence) ? passage.sequence : index + 1,
    )},
    ${sqlText(locator)},
    ${sqlText(optionalText(passage.citationLabel))},
    ${sqlText(originalText)},
    ${sqlText(translationText)},
    ${sqlText(interpretiveNote)},
    ${sqlText(searchText)},
    ${jsonText(themes)},
    ${sqlText(optionalText(passage.kind) ?? "doctrine")},
    ${sqlText(optionalText(passage.evidenceClass) ?? "P1")},
    ${sqlText(
      optionalText(passage.agentUse) ?? "QUALIFIED_FIRST_PERSON",
    )},
    ${sqlText(optionalText(passage.period))},
    ${jsonText(claimIds)},
    ${sqlInteger(Number.isInteger(passage.priority) ? passage.priority : 0)},
    ${sqlText(optionalText(passage.status) ?? "draft")}
  )
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
    updated_at = CURRENT_TIMESTAMP;`);
}

statements.push("COMMIT;");

const outputDirectory = resolve(projectRoot, "knowledge", "generated");
const sqlPath = resolve(outputDirectory, `${editionId}.sql`);
const receiptPath = resolve(outputDirectory, `${editionId}.receipt.json`);

await mkdir(outputDirectory, { recursive: true });
await writeFile(sqlPath, `${statements.join("\n\n")}\n`, "utf8");
await writeFile(
  receiptPath,
  `${JSON.stringify(
    {
      databaseName: "living-archive-local",
      editionId,
      fileSha256,
      fileSize: sourceStats.size,
      mimeType,
      passageCount: passages.length,
      r2Bucket: "living-archive-books-local",
      r2Key,
      sourceFile,
      sqlFile: sqlPath,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

function runWrangler(commandArgs) {
  const wranglerEntrypoint = resolve(
    projectRoot,
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js",
  );
  const result = spawnSync(
    process.execPath,
    [
      wranglerEntrypoint,
      ...commandArgs,
      "--config=wrangler.local.jsonc",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: resolve(
          projectRoot,
          ".wrangler",
          "wrangler.log",
        ),
        XDG_CONFIG_HOME: resolve(projectRoot, ".wrangler", "config"),
      },
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Wrangler command failed: ${commandArgs.join(" ")}`);
  }
}

if (shouldImportLocal) {
  await mkdir(resolve(projectRoot, ".wrangler", "config"), {
    recursive: true,
  });
  runWrangler([
    "r2",
    "object",
    "put",
    `living-archive-books-local/${r2Key}`,
    `--file=${sourceFile}`,
    `--content-type=${mimeType}`,
    "--local",
  ]);
  runWrangler([
    "d1",
    "execute",
    "living-archive-local",
    `--file=${sqlPath}`,
    "--local",
  ]);
}

console.log(
  JSON.stringify(
    {
      importedLocally: shouldImportLocal,
      passageCount: passages.length,
      receiptPath,
      r2Key,
      sqlPath,
    },
    null,
    2,
  ),
);
