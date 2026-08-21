(() => {
  "use strict";

  const DEFAULT_SITES = Object.freeze({
    "linkedin.com": true,
    "x.com": true,
    "twitter.com": true,
  });
  const VALID_MODES = new Set(["standard", "constrained"]);

  let state = {
    mode: "standard",
    sites: { ...DEFAULT_SITES },
  };

  // This intentionally happens before the first asynchronous storage read.
  // It prevents a flash of HDR media for the default, enabled state.
  if (document.documentElement) {
    document.documentElement.dataset.egodimMode = "standard";
  }

  function normalizeHostname(hostname) {
    return String(hostname || "")
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");
  }

  function mergeState(value = {}) {
    const storedSites =
      value.sites &&
      typeof value.sites === "object" &&
      !Array.isArray(value.sites)
        ? value.sites
        : {};
    const sites = { ...DEFAULT_SITES };

    for (const [domain, enabled] of Object.entries(storedSites)) {
      if (typeof enabled === "boolean") {
        sites[domain] = enabled;
      }
    }

    return {
      mode: VALID_MODES.has(value.mode) ? value.mode : "standard",
      sites,
    };
  }

  function findMatchingSite(hostname, sites) {
    const normalizedHostname = normalizeHostname(hostname);
    let bestMatch = null;

    for (const [domain, enabled] of Object.entries(sites)) {
      const normalizedDomain = normalizeHostname(domain);
      const matches =
        normalizedHostname === normalizedDomain ||
        normalizedHostname.endsWith(`.${normalizedDomain}`);

      if (
        matches &&
        (!bestMatch || normalizedDomain.length > bestMatch.domain.length)
      ) {
        bestMatch = { domain: normalizedDomain, enabled };
      }
    }

    return bestMatch;
  }

  function reconcile() {
    const root = document.documentElement;
    if (!root) {
      return;
    }

    const site = findMatchingSite(location.hostname, state.sites);
    if (site?.enabled === true) {
      root.dataset.egodimMode = state.mode;
    } else {
      root.removeAttribute("data-egodim-mode");
    }
  }

  function readState() {
    chrome.storage.sync.get(["mode", "sites"], (stored) => {
      if (chrome.runtime.lastError) {
        // Keep the safe optimistic defaults when Chrome Sync is unavailable.
        reconcile();
        return;
      }

      state = mergeState(stored);
      reconcile();
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    const next = { ...state };
    for (const key of ["mode", "sites"]) {
      if (Object.hasOwn(changes, key)) {
        next[key] = changes[key].newValue;
      }
    }

    state = mergeState(next);
    reconcile();
  });

  readState();

  if (globalThis.__EGODIM_TEST__) {
    globalThis.__EGODIM_TEST__.content = {
      findMatchingSite,
      mergeState,
      normalizeHostname,
    };
  }
})();
