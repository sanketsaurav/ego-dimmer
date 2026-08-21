# Ego Dimmer

Ego Dimmer is a Chrome extension that brings attention-seeking HDR images and video back to a comfortable brightness. Turn it on for the current website, choose how much HDR headroom to keep, and get back to the page without the glare.

It works locally in Chrome. There is no analytics, tracking, advertising, account, or background network activity.

## What it does

- Dims HDR images, videos, and canvases on websites you choose.
- Includes LinkedIn, X, and Twitter by default.
- Offers two levels: **Full SDR** removes extra HDR brightness, while **Gentle** keeps a little HDR headroom.
- Requests access to other websites only when you turn dimming on for that site.
- Revokes a custom website's permission when you turn dimming off there.
- Stores your selected intensity and enabled websites in Chrome Sync.

Ego Dimmer does not inspect, download, proxy, or modify media. Ordinary SDR media is unaffected.

## Install

### Chrome Web Store

The Chrome Web Store listing will be linked here after the first public release.

### Install from source

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome 136 or newer.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the repository folder.
5. Optionally pin Ego Dimmer from Chrome's Extensions menu.

No build step is required to load the extension.

## Use Ego Dimmer

1. Open the website whose HDR media you want to control.
2. Open Ego Dimmer and turn on the large switch.
3. If Chrome asks for access to that website, approve the request and reload the tab once.
4. Choose **Full SDR** or **Gentle**.

Open the popup again to change the intensity or turn dimming off for that website.

## How it works

Chrome can display HDR media above normal SDR reference white on supported displays. Ego Dimmer uses the browser-native [`dynamic-range-limit`](https://developer.mozilla.org/en-US/docs/Web/CSS/dynamic-range-limit) CSS property to limit that extra brightness:

- **Full SDR** applies `standard`.
- **Gentle** applies `constrained`.

The content script runs at `document_start`, before page media paints. Settings are stored with `chrome.storage.sync`, and open pages respond to intensity changes immediately.

Chrome versions older than 136 can load the extension but ignore the unsupported CSS property.

## Privacy and permissions

Ego Dimmer collects and transmits no personal data. Its permissions are limited to what the current-site controls require:

- `storage` saves your intensity and enabled websites in Chrome Sync.
- `activeTab` identifies the current website after you open the popup.
- `scripting` registers the shared dimming script on websites you explicitly enable.
- LinkedIn, X, and Twitter host access runs the dimming script on the default websites.
- Optional host access is requested one website at a time and revoked when you turn that website off.

Read the complete [privacy policy](PRIVACY.md).

## Inspect and contribute

The extension source is intentionally direct: no framework, bundler, minification, remote code, or runtime dependencies. The files in this repository are the files Chrome runs.

To work on Ego Dimmer, install the development tools and run the complete verification suite:

```sh
npm ci
npm run check
```

Useful commands:

- `npm run preview` opens the popup preview at `http://127.0.0.1:4174/`.
- `npm run format` formats supported source and documentation files.
- `npm run package` creates the Chrome Web Store ZIP in `dist/`.

Bug reports and focused pull requests are welcome. [Open an issue](https://github.com/sanketsaurav/ego-dimmer/issues) to start a discussion.

## License

Ego Dimmer is open source under the [MIT License](LICENSE).
