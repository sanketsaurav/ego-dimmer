(() => {
  const mockState = {
    mode: "standard",
    sites: {
      "linkedin.com": true,
      "x.com": true,
      "twitter.com": false,
      "example.com": true,
      "photos.example.net": false,
    },
  };
  const registrations = new Map();

  globalThis.chrome = {
    permissions: {
      async remove() {
        return true;
      },
      async request() {
        return true;
      },
    },
    scripting: {
      async getRegisteredContentScripts({ ids } = {}) {
        const values = [...registrations.values()];
        return ids ? values.filter(({ id }) => ids.includes(id)) : values;
      },
      async registerContentScripts(scripts) {
        scripts.forEach((script) => registrations.set(script.id, script));
      },
      async unregisterContentScripts({ ids }) {
        ids.forEach((id) => registrations.delete(id));
      },
      async updateContentScripts(scripts) {
        scripts.forEach((script) => registrations.set(script.id, script));
      },
    },
    storage: {
      onChanged: { addListener() {} },
      sync: {
        async get() {
          return structuredClone(mockState);
        },
        async set(patch) {
          Object.assign(mockState, structuredClone(patch));
        },
      },
    },
    tabs: {
      async query() {
        return [
          {
            url: "https://ccameron-chromium.github.io/hdr-headroom-limit/example.html",
          },
        ];
      },
    },
  };
})();
