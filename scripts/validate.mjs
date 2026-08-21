import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

async function text(path) {
  return readFile(join(root, path), "utf8");
}

async function requireFile(path) {
  try {
    await stat(join(root, path));
  } catch {
    errors.push(`Missing required file: ${path}`);
  }
}

const manifest = JSON.parse(await text("manifest.json"));
const packageMetadata = JSON.parse(await text("package.json"));
const requiredFiles = [
  "manifest.json",
  "background.js",
  "content.css",
  "content.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "README.md",
];

await Promise.all(requiredFiles.map(requireFile));

if (manifest.manifest_version !== 3) {
  errors.push("manifest_version must be 3");
}
if (manifest.version !== packageMetadata.version) {
  errors.push("manifest.json and package.json versions must match");
}

const expectedPermissions = ["activeTab", "scripting", "storage"];
const actualPermissions = [...(manifest.permissions || [])].sort();
if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) {
  errors.push(`Unexpected permissions: ${actualPermissions.join(", ")}`);
}

if (
  JSON.stringify(manifest.optional_host_permissions) !==
  JSON.stringify(["*://*/*"])
) {
  errors.push("optional_host_permissions must be exactly *://*/*");
}

const contentScript = manifest.content_scripts?.[0];
const expectedMatches = [
  "*://*.linkedin.com/*",
  "*://*.x.com/*",
  "*://*.twitter.com/*",
];
if (
  JSON.stringify(contentScript?.matches) !== JSON.stringify(expectedMatches)
) {
  errors.push("Default content-script match patterns do not match the PRD");
}
if (
  contentScript?.run_at !== "document_start" ||
  contentScript?.all_frames !== true ||
  JSON.stringify(contentScript?.css) !== JSON.stringify(["content.css"]) ||
  JSON.stringify(contentScript?.js) !== JSON.stringify(["content.js"])
) {
  errors.push(
    "The static content script must use the shared payload at document_start in all frames",
  );
}

const css = await text("content.css");
for (const mode of ["standard", "constrained"]) {
  if (
    !css.includes(`data-egodim-mode="${mode}"`) ||
    !css.includes(`dynamic-range-limit: ${mode}`)
  ) {
    errors.push(`content.css is missing the ${mode} rule`);
  }
}

const contentScriptSource = await text("content.js");
const optimisticSet =
  'document.documentElement.dataset.egodimMode = "standard"';
if (
  contentScriptSource.indexOf(optimisticSet) === -1 ||
  contentScriptSource.indexOf(optimisticSet) >
    contentScriptSource.indexOf("chrome.storage.sync.get")
) {
  errors.push(
    "content.js must synchronously set standard mode before reading storage",
  );
}

const popupHtml = await text("popup.html");
if (!popupHtml.includes('<script src="popup.js"></script>')) {
  errors.push("popup.js must be loaded as a local external script");
}
if (/on(?:click|change|submit)\s*=/.test(popupHtml)) {
  errors.push("Inline event handlers are not allowed in the popup");
}

for (const [size, path] of Object.entries(manifest.icons || {})) {
  try {
    const png = await readFile(join(root, path));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width !== Number(size) || height !== Number(size)) {
      errors.push(`${path} is ${width}x${height}; expected ${size}x${size}`);
    }
  } catch {
    // Missing icons are reported by requireFile above.
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("Extension structure and permissions are valid.");
