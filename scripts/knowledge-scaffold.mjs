import { access, copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const projectRoot = process.cwd();
const manifestsDirectory = resolve(projectRoot, "knowledge", "manifests");
const sourceRoot = resolve(projectRoot, "knowledge", "source-files");
const arguments_ = process.argv.slice(2);
const scaffoldAll = arguments_.includes("--all");
const manifestArgument = arguments_.find(
  (argument) => !argument.startsWith("--"),
);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function examplePaths() {
  if (scaffoldAll) {
    const filenames = await readdir(manifestsDirectory);

    return filenames
      .filter((filename) => filename.endsWith(".example.json"))
      .sort()
      .map((filename) => resolve(manifestsDirectory, filename));
  }

  if (!manifestArgument) {
    throw new Error(
      "Usage: npm run knowledge:scaffold -- <example.json> or --all",
    );
  }

  return [resolve(projectRoot, manifestArgument)];
}

const results = [];

for (const examplePath of await examplePaths()) {
  if (!examplePath.endsWith(".example.json")) {
    throw new Error(`${examplePath} must end with .example.json.`);
  }

  const manifest = JSON.parse(await readFile(examplePath, "utf8"));
  const sourcePath = resolve(dirname(examplePath), manifest.sourceFile);
  const localPath = examplePath.replace(/\.example\.json$/, ".local.json");

  if (
    sourcePath !== sourceRoot &&
    !sourcePath.startsWith(`${sourceRoot}\\`) &&
    !sourcePath.startsWith(`${sourceRoot}/`)
  ) {
    throw new Error(
      `${examplePath} points outside knowledge/source-files.`,
    );
  }

  await mkdir(dirname(sourcePath), { recursive: true });

  const localManifestCreated = !(await exists(localPath));

  if (localManifestCreated) {
    await copyFile(examplePath, localPath);
  }

  results.push({
    philosopherId: manifest.philosopherId,
    localManifest: localPath,
    localManifestCreated,
    sourceFile: sourcePath,
    sourceFilePresent: await exists(sourcePath),
  });
}

console.log(JSON.stringify(results, null, 2));
