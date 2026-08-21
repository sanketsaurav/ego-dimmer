# Ego Dimmer Privacy Policy

**Effective date:** August 21, 2026

Ego Dimmer does not collect, transmit, sell, or share personal information. It has no analytics, advertising, tracking, remote code, or background network requests.

The extension stores only its selected intensity and the domains where the user enables dimming. These preferences are stored with Chrome's `storage.sync` API and may be synchronized by Chrome through the user's signed-in browser profile. Ego Dimmer's developer does not receive or have access to that data.

Ego Dimmer reads the hostname of the active tab only after the user opens the popup, so it can show controls for the current site. It applies a CSS luminance limit to images, videos, and canvases on enabled sites. It does not read their contents, inspect whether media is HDR, alter page content, or observe browsing history.

LinkedIn, X, and Twitter are enabled by default. Access to any other website is requested through Chrome's permission prompt only when the user adds that site. Removing a custom site revokes the corresponding host permission.

Questions or requests can be opened in this repository's GitHub issue tracker.
