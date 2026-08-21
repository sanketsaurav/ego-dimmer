import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../popup.js", import.meta.url), "utf8");
const context = vm.createContext({
  URL,
  __EGODIM_TEST__: {}
});
vm.runInContext(source, context);
const popup = context.__EGODIM_TEST__.popup;

test("normalizes domains and full URLs", () => {
  assert.equal(popup.normalizeDomain(" Example.COM "), "example.com");
  assert.equal(
    popup.normalizeDomain("https://www.Example.com:8443/a/path?query=1"),
    "example.com"
  );
  assert.equal(popup.normalizeDomain("news.example.com/story"), "news.example.com");
  assert.equal(popup.normalizeDomain("https://bücher.de"), "xn--bcher-kva.de");
  assert.equal(popup.normalizeDomain("localhost:3000"), "localhost");
});

test("rejects obviously invalid or unsupported hosts", () => {
  for (const value of [
    "",
    "not a domain",
    "example",
    "ftp://example.com/file",
    "https://user:pass@example.com",
    "127.0.0.1",
    "bad_label.example",
    "-bad.example"
  ]) {
    assert.equal(popup.normalizeDomain(value), null, value);
  }
});

test("selects the longest matching site entry", () => {
  const result = popup.findMatchingSite("team.news.example.com", {
    "example.com": false,
    "news.example.com": true
  });
  assert.deepEqual({ ...result }, { domain: "news.example.com", enabled: true });
  assert.equal(popup.findMatchingSite("notexample.com", { "example.com": true }), null);
});

test("hides restricted tabs and accepts normal web tabs", () => {
  assert.equal(
    popup.domainFromTab({ url: "https://www.linkedin.com/feed/" }),
    "linkedin.com"
  );
  assert.equal(
    popup.domainFromTab({ url: "https://chromewebstore.google.com/detail/example" }),
    null
  );
  assert.equal(popup.domainFromTab({ url: "chrome://extensions" }), null);
});

test("dynamic content-script descriptor uses the shared payload", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(popup.scriptFor("example.com"))),
    {
      id: "egodim-example.com",
      matches: ["*://*.example.com/*"],
      css: ["content.css"],
      js: ["content.js"],
      runAt: "document_start",
      allFrames: true,
      persistAcrossSessions: true
    }
  );
});
