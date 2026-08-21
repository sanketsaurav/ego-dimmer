(() => {
  "use strict";

  const DEFAULT_SITES = Object.freeze({
    "linkedin.com": true,
    "x.com": true,
    "twitter.com": true
  });
  const DEFAULT_DOMAINS = new Set(Object.keys(DEFAULT_SITES));
  const VALID_MODES = new Set(["standard", "constrained"]);
  const SCRIPT_PREFIX = "egodim-";

  function normalizeState(value = {}) {
    const storedSites =
      value.sites && typeof value.sites === "object" && !Array.isArray(value.sites)
        ? value.sites
        : {};
    const sites = { ...DEFAULT_SITES };

    for (const [domain, enabled] of Object.entries(storedSites)) {
      if (typeof enabled === "boolean") {
        sites[domain] = enabled;
      }
    }

    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : true,
      mode: VALID_MODES.has(value.mode) ? value.mode : "standard",
      sites
    };
  }

  function isValidStoredDomain(domain) {
    if (domain === "localhost") {
      return true;
    }

    if (typeof domain !== "string" || domain.length > 253 || !domain.includes(".")) {
      return false;
    }

    return domain.split(".").every((label) =>
      /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label)
    );
  }

  function scriptFor(domain) {
    return {
      id: `${SCRIPT_PREFIX}${domain}`,
      matches: [`*://*.${domain}/*`],
      css: ["content.css"],
      js: ["content.js"],
      runAt: "document_start",
      allFrames: true,
      persistAcrossSessions: true
    };
  }

  async function ensureStoredState() {
    const stored = await chrome.storage.sync.get(["enabled", "mode", "sites"]);
    const normalized = normalizeState(stored);
    const patch = {};

    if (typeof stored.enabled !== "boolean") {
      patch.enabled = normalized.enabled;
    }
    if (!VALID_MODES.has(stored.mode)) {
      patch.mode = normalized.mode;
    }

    const storedSites =
      stored.sites && typeof stored.sites === "object" && !Array.isArray(stored.sites)
        ? stored.sites
        : {};
    const sitesNeedRepair =
      Object.keys(DEFAULT_SITES).some((domain) => typeof storedSites[domain] !== "boolean") ||
      Object.entries(storedSites).some(([, enabled]) => typeof enabled !== "boolean");
    if (sitesNeedRepair) {
      patch.sites = normalized.sites;
    }

    if (Object.keys(patch).length > 0) {
      await chrome.storage.sync.set(patch);
    }

    return normalized;
  }

  async function updateBadge(enabled) {
    await Promise.all([
      chrome.action.setBadgeBackgroundColor({ color: "#161613" }),
      chrome.action.setBadgeText({ text: enabled ? "" : "OFF" })
    ]);
  }

  async function reconcileDynamicScripts(state) {
    const registrations = await chrome.scripting.getRegisteredContentScripts();
    const managed = new Map(
      registrations
        .filter(({ id }) => id.startsWith(SCRIPT_PREFIX))
        .map((registration) => [registration.id, registration])
    );
    const desiredDomains = Object.keys(state.sites).filter(
      (domain) => !DEFAULT_DOMAINS.has(domain) && isValidStoredDomain(domain)
    );
    const desiredIds = new Set(desiredDomains.map((domain) => `${SCRIPT_PREFIX}${domain}`));
    const staleIds = [...managed.keys()].filter((id) => !desiredIds.has(id));

    if (staleIds.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: staleIds });
    }

    for (const domain of desiredDomains) {
      const descriptor = scriptFor(domain);
      const hasPermission = await chrome.permissions.contains({
        origins: descriptor.matches
      });

      if (!hasPermission) {
        continue;
      }

      if (managed.has(descriptor.id)) {
        await chrome.scripting.updateContentScripts([descriptor]);
      } else {
        await chrome.scripting.registerContentScripts([descriptor]);
      }
    }
  }

  async function initialize() {
    const state = await ensureStoredState();
    await Promise.all([updateBadge(state.enabled), reconcileDynamicScripts(state)]);
  }

  function initializeSafely() {
    initialize().catch(() => {
      // A missing optional host permission can make a synced dynamic site
      // temporarily unavailable. The popup can restore it via a user gesture.
    });
  }

  chrome.runtime.onInstalled.addListener(initializeSafely);
  chrome.runtime.onStartup.addListener(initializeSafely);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    if (Object.hasOwn(changes, "enabled")) {
      updateBadge(changes.enabled.newValue === true).catch(() => {});
    }

    if (Object.hasOwn(changes, "sites")) {
      ensureStoredState()
        .then(reconcileDynamicScripts)
        .catch(() => {});
    }
  });

  if (globalThis.__EGODIM_TEST__) {
    globalThis.__EGODIM_TEST__.background = {
      isValidStoredDomain,
      normalizeState,
      scriptFor
    };
  }
})();
