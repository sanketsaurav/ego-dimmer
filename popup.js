(() => {
  "use strict";

  const DEFAULT_SITES = Object.freeze({
    "linkedin.com": true,
    "x.com": true,
    "twitter.com": true,
  });
  const DEFAULT_DOMAINS = new Set(Object.keys(DEFAULT_SITES));
  const VALID_MODES = new Set(["standard", "constrained"]);
  const RESTRICTED_HOSTS = new Set([
    "chrome.google.com",
    "chromewebstore.google.com",
    "chromewebstore.googleusercontent.com",
  ]);

  let state = {
    mode: "standard",
    sites: { ...DEFAULT_SITES },
  };
  let activeDomain = null;
  let busy = false;

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

  function normalizeDomain(input) {
    const raw = String(input || "")
      .trim()
      .toLowerCase();
    if (!raw || /\s/.test(raw)) {
      return null;
    }

    let url;
    try {
      url = new URL(
        /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`,
      );
    } catch {
      return null;
    }

    if (
      !new Set(["http:", "https:"]).has(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }

    const hostname = url.hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");

    if (hostname === "localhost") {
      return hostname;
    }

    if (
      hostname.length > 253 ||
      !hostname.includes(".") ||
      hostname.includes(":") ||
      /^\d+(?:\.\d+){3}$/.test(hostname)
    ) {
      return null;
    }

    const valid = hostname
      .split(".")
      .every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label));
    return valid ? hostname : null;
  }

  function findMatchingSite(hostname, sites) {
    let bestMatch = null;

    for (const [domain, enabled] of Object.entries(sites)) {
      if (
        (hostname === domain || hostname.endsWith(`.${domain}`)) &&
        (!bestMatch || domain.length > bestMatch.domain.length)
      ) {
        bestMatch = { domain, enabled };
      }
    }

    return bestMatch;
  }

  function originFor(domain) {
    return `*://*.${domain}/*`;
  }

  function scriptFor(domain) {
    return {
      id: `egodim-${domain}`,
      matches: [originFor(domain)],
      css: ["content.css"],
      js: ["content.js"],
      runAt: "document_start",
      allFrames: true,
      persistAcrossSessions: true,
    };
  }

  function domainFromTab(tab) {
    if (!tab?.url) {
      return null;
    }

    try {
      const url = new URL(tab.url);
      if (!new Set(["http:", "https:"]).has(url.protocol)) {
        return null;
      }
      if (RESTRICTED_HOSTS.has(url.hostname)) {
        return null;
      }
      return normalizeDomain(url.hostname);
    } catch {
      return null;
    }
  }

  function currentMatch() {
    return activeDomain ? findMatchingSite(activeDomain, state.sites) : null;
  }

  function setNotice(message = "", kind = "") {
    const notice = document.querySelector("#notice");
    notice.textContent = message;
    notice.dataset.kind = kind;
  }

  function setBusy(value) {
    busy = value;
    render();
  }

  async function saveSites(sites) {
    await chrome.storage.sync.set({ sites });
    state = { ...state, sites };
  }

  async function registerSite(domain) {
    const descriptor = scriptFor(domain);
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [descriptor.id],
    });

    if (existing.length > 0) {
      await chrome.scripting.updateContentScripts([descriptor]);
    } else {
      await chrome.scripting.registerContentScripts([descriptor]);
    }
  }

  async function enableCurrentSite(match) {
    const domain = match?.domain || activeDomain;
    if (!domain) {
      return;
    }

    setBusy(true);
    setNotice();
    let granted = DEFAULT_DOMAINS.has(domain);

    try {
      if (!granted) {
        granted = await chrome.permissions.request({
          origins: [originFor(domain)],
        });
        if (!granted) {
          setNotice("Site access is needed to turn dimming on.", "error");
          return;
        }
        await registerSite(domain);
      }

      await saveSites({ ...state.sites, [domain]: true });
      setNotice(
        DEFAULT_DOMAINS.has(domain)
          ? "Dimming is on."
          : "Dimming is on. Reload this tab once to apply it.",
        "success",
      );
    } catch {
      if (granted && !DEFAULT_DOMAINS.has(domain)) {
        await Promise.allSettled([
          chrome.scripting.unregisterContentScripts({
            ids: [`egodim-${domain}`],
          }),
          chrome.permissions.remove({ origins: [originFor(domain)] }),
        ]);
      }
      setNotice("Dimming couldn't be enabled. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disableCurrentSite(match) {
    if (!match) {
      return;
    }

    setBusy(true);
    setNotice();

    try {
      const sites = { ...state.sites };
      if (DEFAULT_DOMAINS.has(match.domain)) {
        sites[match.domain] = false;
      } else {
        const id = `egodim-${match.domain}`;
        const existing = await chrome.scripting.getRegisteredContentScripts({
          ids: [id],
        });
        if (existing.length > 0) {
          await chrome.scripting.unregisterContentScripts({ ids: [id] });
        }
        await chrome.permissions.remove({ origins: [originFor(match.domain)] });
        delete sites[match.domain];
      }

      await saveSites(sites);
      setNotice("Dimming is off for this site.");
    } catch {
      setNotice("Dimming couldn't be turned off. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function render() {
    const match = currentMatch();
    const enabled = match?.enabled === true;
    const unavailable = !activeDomain;
    const card = document.querySelector("#site-card");
    const toggle = document.querySelector("#site-toggle");

    card.dataset.unavailable = String(unavailable);
    document.querySelector("#active-hostname").textContent =
      activeDomain || "This page";
    document.querySelector("#site-title").textContent = unavailable
      ? "Dimming isn't available here"
      : `HDR dimming is ${enabled ? "on" : "off"}`;
    document.querySelector("#site-description").textContent = unavailable
      ? "Chrome protects this page from extensions."
      : enabled
        ? "Bright HDR media is held within your chosen range."
        : "Media keeps its original brightness.";

    toggle.setAttribute("aria-checked", String(enabled));
    toggle.setAttribute(
      "aria-label",
      `${enabled ? "Turn off" : "Turn on"} HDR dimming for ${activeDomain || "this page"}`,
    );
    toggle.disabled = busy || unavailable;
    const intensity = document.querySelector("#intensity");
    intensity.hidden = !enabled;
    document.querySelectorAll('input[name="mode"]').forEach((input) => {
      input.checked = input.value === state.mode;
      input.disabled = busy || !enabled;
    });
  }

  async function initialize() {
    const [stored, tabs] = await Promise.all([
      chrome.storage.sync.get(["mode", "sites"]),
      chrome.tabs.query({ active: true, currentWindow: true }),
    ]);
    state = mergeState(stored);
    activeDomain = domainFromTab(tabs[0]);
    render();

    document.querySelector("#site-toggle").addEventListener("click", () => {
      if (busy || !activeDomain) {
        return;
      }

      const match = currentMatch();
      if (match?.enabled === true) {
        disableCurrentSite(match);
      } else {
        enableCurrentSite(match);
      }
    });

    document.querySelectorAll('input[name="mode"]').forEach((input) => {
      input.addEventListener("change", async () => {
        if (!input.checked || !VALID_MODES.has(input.value)) {
          return;
        }

        try {
          await chrome.storage.sync.set({ mode: input.value });
          state = { ...state, mode: input.value };
          render();
        } catch {
          setNotice("Intensity couldn't be saved. Try again.", "error");
        }
      });
    });
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      initialize().catch(() => {
        setNotice(
          "Ego Dimmer couldn't open. Close the popup and try again.",
          "error",
        );
      });
    });
  }

  if (globalThis.__EGODIM_TEST__) {
    globalThis.__EGODIM_TEST__.popup = {
      domainFromTab,
      findMatchingSite,
      mergeState,
      normalizeDomain,
      originFor,
      scriptFor,
    };
  }
})();
