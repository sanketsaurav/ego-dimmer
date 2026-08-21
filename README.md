# Ego Dimmer

Ego Dimmer is a tiny Chrome extension that brings attention-seeking HDR images and media back to normal SDR brightness. LinkedIn, X, and Twitter are covered by default, and any other website can be added from the popup.

The extension is Manifest V3, dependency-free, and build-free. It does not inspect, download, proxy, or modify images. It does not include analytics or make network requests.

## How it works

Chrome renders HDR images above SDR reference white on supported displays. Ego Dimmer applies the browser-native [`dynamic-range-limit`](https://developer.mozilla.org/en-US/docs/Web/CSS/dynamic-range-limit) CSS property directly to `img`, `video`, and `canvas` elements. **Full SDR** uses `standard`; **Gentle** uses `constrained`. Applying either value to ordinary SDR media is a no-op.

The content script runs at `document_start`, so the default enabled state is applied before page media paints. Settings live in `chrome.storage.sync`, and open pages react to changes immediately without a reload.

## Install unpacked

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome 136 or newer.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose this repository folder.
5. Pin Ego Dimmer from Chrome's Extensions menu if you want it visible in the toolbar.

Older Chrome versions can load the extension but ignore the unsupported CSS property.

## Use it

- Use the master switch to turn the effect on or off everywhere.
- Toggle LinkedIn, X, or Twitter independently in the site list.
- On a normal website, choose **Add this site**, approve Chrome's host-permission prompt, then reload that tab once.
- Add a domain or full URL manually with the input at the bottom of the popup.
- Remove a custom site with its × button. Default sites can be disabled but not removed.
- Choose **Full SDR** for complete neutralization or **Gentle** for limited HDR headroom.

Custom host access is requested only when you add a site. Removing it also revokes that access.

## Develop and verify

There is no install step and no runtime dependency.

```sh
npm test
npm run validate
npm run package
```

`npm run package` writes a reproducible Chrome Web Store ZIP to `dist/`.

For manual HDR QA, add the [Chromium HDR headroom example](https://ccameron-chromium.github.io/hdr-headroom-limit/example.html), reload it, and inspect an image with:

```js
getComputedStyle(document.querySelector("img")).getPropertyValue("dynamic-range-limit")
```

The expected result is `standard`, `constrained`, or `no-limit`, matching the popup state.

## Releases and Chrome Web Store publishing

Pushing a tag such as `v1.0.1` runs tests, verifies the tag matches `manifest.json`, creates the store ZIP, publishes a GitHub Release, uploads the package to the Chrome Web Store API v2, and submits it for review with automatic publication after approval.

Chrome requires the store item and listing to be created manually once. Follow [the one-time publishing setup](docs/CHROME_WEB_STORE.md) before pushing a release tag.

## Permissions

- `storage`: save the master switch, intensity, and site list in Chrome Sync.
- `scripting`: register the shared content script for sites you explicitly add.
- `activeTab`: identify the current tab after you open the popup.
- LinkedIn/X/Twitter access: run the static content script on the three default sites.
- Optional website access: requested one site at a time through Chrome's permission prompt.

See the full [privacy policy](PRIVACY.md).

## Change the name

The installed extension name and description live in `manifest.json`; the visible popup wordmark lives in `popup.html`. Search the repository for `Ego Dimmer` before packaging so the README, privacy policy, and release documentation stay consistent.
