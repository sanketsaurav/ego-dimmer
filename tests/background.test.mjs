import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../background.js", import.meta.url),
  "utf8",
);
const noopEvent = { addListener() {} };
const context = vm.createContext({
  __EGODIM_TEST__: {},
  chrome: {
    action: {
      async setBadgeBackgroundColor() {},
      async setBadgeText() {},
    },
    permissions: {
      async contains() {
        return false;
      },
    },
    runtime: { onInstalled: noopEvent, onStartup: noopEvent },
    scripting: {
      async getRegisteredContentScripts() {
        return [];
      },
      async registerContentScripts() {},
      async unregisterContentScripts() {},
      async updateContentScripts() {},
    },
    storage: {
      onChanged: noopEvent,
      sync: {
        async get() {
          return {};
        },
        async remove() {},
        async set() {},
      },
    },
  },
});
vm.runInContext(source, context);
const background = context.__EGODIM_TEST__.background;

test("repairs missing defaults without discarding custom sites", () => {
  const normalized = background.normalizeState({
    mode: "constrained",
    sites: { "example.com": false, "x.com": false },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), {
    mode: "constrained",
    sites: {
      "linkedin.com": true,
      "x.com": false,
      "twitter.com": true,
      "example.com": false,
    },
  });
});

test("validates persisted domains before registering scripts", () => {
  assert.equal(background.isValidStoredDomain("example.com"), true);
  assert.equal(background.isValidStoredDomain("sub.example.com"), true);
  assert.equal(background.isValidStoredDomain("localhost"), true);
  assert.equal(background.isValidStoredDomain("bad_label.example"), false);
  assert.equal(background.isValidStoredDomain("example"), false);
});

test("builds persistent all-frame registrations", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(background.scriptFor("example.com"))),
    {
      id: "egodim-example.com",
      matches: ["*://*.example.com/*"],
      css: ["content.css"],
      js: ["content.js"],
      runAt: "document_start",
      allFrames: true,
      persistAcrossSessions: true,
    },
  );
});
