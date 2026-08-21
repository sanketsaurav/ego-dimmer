import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(join(root, "manifest.json"), "utf8"),
);
const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
const expected = `v${manifest.version}`;

if (!tag) {
  throw new Error(
    "Pass a release tag, for example: node scripts/check-version.mjs v1.0.0",
  );
}

if (tag !== expected) {
  throw new Error(
    `Tag ${tag} does not match manifest version ${manifest.version}. Expected ${expected}.`,
  );
}

console.log(`${tag} matches manifest.json`);
