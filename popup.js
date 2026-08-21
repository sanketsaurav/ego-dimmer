(() => {
  "use strict";

  const DEFAULT_SITES = Object.freeze({
    "linkedin.com": true,
    "x.com": true,
    "twitter.com": true
  });
  const DEFAULT_DOMAINS = new Set(Object.keys(DEFAULT_SITES));
  const VALID_MODES = new Set(["standard", "constrained"]);
  const RESTRICTED_HOSTS = new Set([
    "chrome.google.com",
    "chromewebstore.google.com",
    "chromewebstore.googleusercontent.com"
  ]);

  let state = {
    enabled: true,
    mode: "standard",
    sites: { ...DEFAULT_SITES }
  };
  let activeDomain = null;
  let busy = false;

  function mergeState(value = {}) {
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

  function normalizeDomain(input) {
    const raw = String(input || "").trim().toLowerCase();
    if (!raw || /\s/.test(raw)) {
      return null;
    }

    let url;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }

    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
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
      persistAcrossSessions: true
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

  function createSwitch({ checked, label, onChange }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "switch";
    button.setAttribute("role", "switch");
    button.setAttribute("aria-checked", String(checked));
    button.setAttribute("aria-label", label);
    button.disabled = busy;

    const track = document.createElement("span");
    track.className = "switch__track";
    track.setAttribute("aria-hidden", "true");
    const thumb = document.createElement("span");
    thumb.className = "switch__thumb";
    track.append(thumb);

    const status = document.createElement("span");
    status.className = "switch__label";
    status.textContent = checked ? "On" : "Off";
    button.append(track, status);
    button.addEventListener("click", onChange);
    return button;
  }

  function setNotice(message = "", kind = "") {
    const notice = document.querySelector("#notice");
    notice.textContent = message;
    notice.dataset.kind = kind;
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll("button, .mode-option input").forEach((control) => {
      control.disabled = value;
    });
  }

  async function saveSites(sites) {
    await chrome.storage.sync.set({ sites });
    state = { ...state, sites };
  }

  async function toggleSite(domain) {
    setNotice();
    const sites = { ...state.sites, [domain]: !state.sites[domain] };

    try {
      await saveSites(sites);
      render();
    } catch {
      setNotice("Chrome couldn't save that change. Try again.", "error");
    }
  }

  async function registerSite(domain) {
    const descriptor = scriptFor(domain);
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [descriptor.id]
    });

    if (existing.length > 0) {
      await chrome.scripting.updateContentScripts([descriptor]);
    } else {
      await chrome.scripting.registerContentScripts([descriptor]);
    }
  }

  async function addSite(input) {
    const domain = normalizeDomain(input);
    const domainInput = document.querySelector("#domain-input");
    domainInput.setAttribute("aria-invalid", String(!domain));

    if (!domain) {
      setNotice("Enter a valid domain, like example.com.", "error");
      return;
    }

    if (Object.hasOwn(state.sites, domain)) {
      setNotice(`${domain} is already in your list.`);
      return;
    }

    setBusy(true);
    setNotice();
    const origin = originFor(domain);

    let granted = false;
    try {
      // Keep this request in the direct click/submit user-gesture path.
      granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        setNotice("Permission is needed to run on this site.", "error");
        return;
      }

      await registerSite(domain);
      await saveSites({ ...state.sites, [domain]: true });
      domainInput.value = "";
      domainInput.setAttribute("aria-invalid", "false");
      setNotice(`Added ${domain}. Reload it once to start dimming.`, "success");
      render();
    } catch {
      if (granted) {
        await Promise.allSettled([
          chrome.scripting.unregisterContentScripts({ ids: [`egodim-${domain}`] }),
          chrome.permissions.remove({ origins: [origin] })
        ]);
      }
      setNotice("That site couldn't be added. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeSite(domain) {
    if (DEFAULT_DOMAINS.has(domain)) {
      return;
    }

    setBusy(true);
    setNotice();

    try {
      const id = `egodim-${domain}`;
      const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
      if (existing.length > 0) {
        await chrome.scripting.unregisterContentScripts({ ids: [id] });
      }
      await chrome.permissions.remove({ origins: [originFor(domain)] });

      const sites = { ...state.sites };
      delete sites[domain];
      await saveSites(sites);
      setNotice(`Removed ${domain}.`, "success");
      render();
    } catch {
      setNotice("That site couldn't be removed. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function renderThisSite() {
    const section = document.querySelector("#this-site");
    if (!activeDomain) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    document.querySelector("#active-hostname").textContent = activeDomain;
    const action = document.querySelector("#this-site-action");
    action.replaceChildren();

    const match = findMatchingSite(activeDomain, state.sites);
    if (match) {
      action.append(
        createSwitch({
          checked: match.enabled,
          label: `${match.enabled ? "Disable" : "Enable"} dimming on ${match.domain}`,
          onChange: () => toggleSite(match.domain)
        })
      );
      return;
    }

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "action-button";
    addButton.textContent = "Add this site";
    addButton.disabled = busy;
    addButton.addEventListener("click", () => addSite(activeDomain));
    action.append(addButton);
  }

  function sortedSites() {
    const defaults = Object.keys(DEFAULT_SITES).filter((domain) =>
      Object.hasOwn(state.sites, domain)
    );
    const custom = Object.keys(state.sites)
      .filter((domain) => !DEFAULT_DOMAINS.has(domain))
      .sort((a, b) => a.localeCompare(b));
    return [...defaults, ...custom];
  }

  function renderSiteList() {
    const list = document.querySelector("#site-list");
    const domains = sortedSites();
    list.replaceChildren();

    domains.forEach((domain, index) => {
      const row = document.createElement("div");
      row.className = "site-row";
      row.dataset.enabled = String(state.sites[domain]);
      row.style.animationDelay = `${index * 18}ms`;

      const label = document.createElement("span");
      label.className = "site-domain";
      label.textContent = domain;
      label.title = domain;

      const toggle = createSwitch({
        checked: state.sites[domain],
        label: `${state.sites[domain] ? "Disable" : "Enable"} dimming on ${domain}`,
        onChange: () => toggleSite(domain)
      });

      row.append(label, toggle);
      if (DEFAULT_DOMAINS.has(domain)) {
        const spacer = document.createElement("span");
        spacer.className = "remove-spacer";
        spacer.setAttribute("aria-hidden", "true");
        row.append(spacer);
      } else {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-button";
        remove.textContent = "×";
        remove.title = `Remove ${domain}`;
        remove.setAttribute("aria-label", `Remove ${domain}`);
        remove.disabled = busy;
        remove.addEventListener("click", () => removeSite(domain));
        row.append(remove);
      }
      list.append(row);
    });

    const count = document.querySelector("#site-count");
    count.textContent = String(domains.length).padStart(2, "0");
    count.setAttribute("aria-label", `${domains.length} sites`);
  }

  function render() {
    const panel = document.querySelector(".panel");
    panel.dataset.master = state.enabled ? "on" : "off";

    const master = document.querySelector("#master-toggle");
    master.setAttribute("aria-checked", String(state.enabled));
    master.setAttribute("aria-label", `Turn Ego Dimmer ${state.enabled ? "off" : "on"}`);
    master.disabled = busy;
    document.querySelector("#master-label").textContent = state.enabled ? "On" : "Off";

    document.querySelectorAll('input[name="mode"]').forEach((input) => {
      input.checked = input.value === state.mode;
      input.disabled = busy;
    });
    document.querySelector("#meter-marker").style.left =
      state.mode === "standard" ? "72%" : "88%";

    renderThisSite();
    renderSiteList();
  }

  async function initialize() {
    const [stored, tabs] = await Promise.all([
      chrome.storage.sync.get(["enabled", "mode", "sites"]),
      chrome.tabs.query({ active: true, currentWindow: true })
    ]);
    state = mergeState(stored);
    activeDomain = domainFromTab(tabs[0]);
    render();

    document.querySelector("#master-toggle").addEventListener("click", async () => {
      const enabled = !state.enabled;
      try {
        await chrome.storage.sync.set({ enabled });
        state = { ...state, enabled };
        render();
      } catch {
        setNotice("Chrome couldn't save that change. Try again.", "error");
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
          setNotice("Chrome couldn't save that change. Try again.", "error");
        }
      });
    });

    document.querySelector("#add-form").addEventListener("submit", (event) => {
      event.preventDefault();
      addSite(document.querySelector("#domain-input").value);
    });

    document.querySelector("#domain-input").addEventListener("input", (event) => {
      event.currentTarget.setAttribute("aria-invalid", "false");
      if (document.querySelector("#notice").dataset.kind === "error") {
        setNotice();
      }
    });
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      initialize().catch(() => {
        document.querySelector("#notice").textContent =
          "Ego Dimmer couldn't open. Close the popup and try again.";
        document.querySelector("#notice").dataset.kind = "error";
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
      scriptFor
    };
  }
})();
