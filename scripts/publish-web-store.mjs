import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const [archiveArgument] = process.argv.slice(2);
const publisherId = process.env.CWS_PUBLISHER_ID;
const extensionId = process.env.CWS_EXTENSION_ID;
const accessToken = process.env.CWS_ACCESS_TOKEN;

if (!archiveArgument) {
  throw new Error("Pass the extension ZIP path to publish-web-store.mjs");
}
if (!publisherId || !extensionId || !accessToken) {
  throw new Error(
    "CWS_PUBLISHER_ID, CWS_EXTENSION_ID, and CWS_ACCESS_TOKEN are required"
  );
}
if (!/^[a-zA-Z0-9_-]+$/.test(publisherId)) {
  throw new Error("CWS_PUBLISHER_ID contains unexpected characters");
}
if (!/^[a-p]{32}$/.test(extensionId)) {
  throw new Error("CWS_EXTENSION_ID must be the 32-character Chrome extension ID");
}

const archive = resolve(archiveArgument);
const packageBytes = await readFile(archive);
const itemName = `publishers/${publisherId}/items/${extensionId}`;
const apiRoot = "https://chromewebstore.googleapis.com";

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    }
  });
  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { rawResponse: bodyText };
  }

  if (!response.ok) {
    throw new Error(
      `Chrome Web Store API ${response.status}: ${JSON.stringify(body, null, 2)}`
    );
  }
  return body;
}

function isPending(value) {
  return String(value || "").includes("IN_PROGRESS");
}

function isFailed(value) {
  return String(value || "").includes("FAIL");
}

function isSucceeded(value) {
  return String(value || "").includes("SUCC");
}

console.log(`Uploading ${basename(archive)} to ${extensionId}...`);
let upload = await apiRequest(`${apiRoot}/upload/v2/${itemName}:upload`, {
  method: "POST",
  headers: {
    "Content-Type": "application/zip",
    "X-Goog-Upload-Protocol": "raw",
    "X-Goog-Upload-File-Name": basename(archive)
  },
  body: packageBytes
});

if (isFailed(upload.uploadState)) {
  throw new Error(`Package upload failed: ${JSON.stringify(upload, null, 2)}`);
}

for (let attempt = 1; isPending(upload.uploadState); attempt += 1) {
  if (attempt > 24) {
    throw new Error("Package upload was still processing after two minutes");
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000));
  const status = await apiRequest(`${apiRoot}/v2/${itemName}:fetchStatus`);
  upload = {
    ...upload,
    uploadState: status.lastAsyncUploadState,
    status
  };
  if (isFailed(upload.uploadState)) {
    throw new Error(`Package processing failed: ${JSON.stringify(status, null, 2)}`);
  }
}

if (!isSucceeded(upload.uploadState)) {
  throw new Error(`Unexpected package upload state: ${JSON.stringify(upload, null, 2)}`);
}

console.log(`Upload accepted${upload.crxVersion ? ` as ${upload.crxVersion}` : ""}.`);
console.log("Submitting the package for review and automatic publication...");
const publication = await apiRequest(`${apiRoot}/v2/${itemName}:publish`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    publishType: "DEFAULT_PUBLISH",
    blockOnWarnings: true
  })
});

console.log(`Chrome Web Store state: ${publication.state || "submitted"}`);
if (publication.warningInfo?.warnings?.length) {
  console.log(JSON.stringify(publication.warningInfo.warnings, null, 2));
}
