import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../content.js", import.meta.url),
  "utf8",
);

function loadContent(hostname = "www.linkedin.com") {
  const root = {
    dataset: {},
    removeAttribute(name) {
      if (name === "data-egodim-mode") {
        delete this.dataset.egodimMode;
      }
    },
  };
  let storageCallback;
  let changeListener;
  const context = vm.createContext({
    __EGODIM_TEST__: {},
    document: { documentElement: root },
    location: { hostname },
    chrome: {
      runtime: { lastError: null },
      storage: {
        sync: {
          get(_keys, callback) {
            storageCallback = callback;
          },
        },
        onChanged: {
          addListener(listener) {
            changeListener = listener;
          },
        },
      },
    },
  });
  vm.runInContext(source, context);
  return { changeListener, context, root, storageCallback };
}

test("sets the optimistic clamp synchronously before storage resolves", () => {
  const extension = loadContent();
  assert.equal(extension.root.dataset.egodimMode, "standard");
  assert.equal(typeof extension.storageCallback, "function");
});

test("reconciles stored mode and current-site state", () => {
  const extension = loadContent("media.example.com");
  extension.storageCallback({
    mode: "constrained",
    sites: { "example.com": true },
  });
  assert.equal(extension.root.dataset.egodimMode, "constrained");

  extension.changeListener(
    { mode: { oldValue: "constrained", newValue: "standard" } },
    "sync",
  );
  assert.equal(extension.root.dataset.egodimMode, "standard");

  extension.changeListener(
    {
      sites: {
        oldValue: { "example.com": true },
        newValue: { "example.com": false },
      },
    },
    "sync",
  );
  assert.equal(extension.root.dataset.egodimMode, undefined);
});

test("ignores the removed legacy master switch", () => {
  const extension = loadContent();
  extension.storageCallback({
    enabled: false,
    mode: "standard",
    sites: { "linkedin.com": true },
  });
  assert.equal(extension.root.dataset.egodimMode, "standard");
});

test("a more specific stored domain wins", () => {
  const extension = loadContent("profile.news.example.com");
  extension.storageCallback({
    mode: "standard",
    sites: {
      "example.com": true,
      "news.example.com": false,
    },
  });
  assert.equal(extension.root.dataset.egodimMode, undefined);
});

test("changes in other storage areas are ignored", () => {
  const extension = loadContent();
  extension.storageCallback({ mode: "standard", sites: {} });
  assert.equal(extension.root.dataset.egodimMode, "standard");
  extension.changeListener(
    { sites: { newValue: { "linkedin.com": false } } },
    "local",
  );
  assert.equal(extension.root.dataset.egodimMode, "standard");
});
