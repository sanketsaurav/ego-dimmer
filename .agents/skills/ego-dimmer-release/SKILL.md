---
name: ego-dimmer-release
description: Prepare and publish Ego Dimmer releases, including versioning, a user-facing changelog, signed Git history, GitHub Releases, and manual or automated Chrome Web Store submission. Use when asked to prepare, tag, cut, publish, or troubleshoot an Ego Dimmer release.
---

# Ego Dimmer Release

Release only code that is merged into `main`. Treat the Git tag as the immutable source of the GitHub release ZIP and the Chrome Web Store submission.

## Respect the requested scope

- A request to **prepare** a release permits local edits and verification, but not pushing, creating a PR, tagging, or publishing.
- A request to **create a release PR** permits pushing the release branch and opening the PR, but not merging it or tagging.
- A request to **release** or **publish** permits the requested commit, push, tag, and publishing workflow after all preconditions pass. Do not merge a PR unless the user authorizes merging.
- Stop before the tag if the intended Web Store path is not ready. A pushed tag triggers external release and submission actions.

## Establish the release state

1. Read `manifest.json`, `package.json`, `package-lock.json`, `.github/workflows/release.yml`, `scripts/check-version.mjs`, `scripts/package.mjs`, and `docs/CHROME_WEB_STORE.md`.
2. Inspect the worktree, current branch, latest remote `main`, tags, GitHub releases, merged/open PRs, and release workflow status. Preserve unrelated user changes.
3. Confirm all intended changes are merged. Never release from a feature branch or tag an unmerged commit.
4. Confirm the versions in `manifest.json`, `package.json`, and `package-lock.json` agree. The new version must exceed the version already uploaded to the Chrome Web Store.
5. Use semantic versioning: patch for fixes, copy, metadata, and refinements; minor for new user-facing capability; major for an intentional incompatible change. Follow a version explicitly chosen by the user.

The Chrome Web Store item ID for this project is `jddadhkcjolcpiogmofjnckbonlldfdh`. It belongs in the GitHub environment variable `CWS_EXTENSION_ID`; do not hardcode it into the extension package.

## Check the publishing path before tagging

The release workflow expects a GitHub environment named `chrome-web-store` with these variables:

- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`
- `CWS_SERVICE_ACCOUNT`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`

Check presence without printing access tokens or credential material. If automated publishing is expected and any variable or Google/Chrome service-account linkage is missing, stop before tagging and report the exact missing setup.

For an item's first publication, determine whether its visibility has already been manually published. Chrome may require the first submission after a dashboard visibility change to be published manually. In that case, build and verify the final ZIP, hand it to the user for the dashboard submission, and begin tag-based Web Store publishing with the next version. Do not describe a green GitHub workflow as a completed Chrome release: it means the submission was accepted, while Chrome review remains asynchronous.

## Write the public changelog

Create or update the repository-root `CHANGELOG.md` as part of every release. Derive it from the diff and merged PRs since the previous tag, then verify each claim against the code.

Use this shape:

```markdown
# Changelog

Notable user-facing changes to Ego Dimmer are documented here.

## [Unreleased]

## [1.2.3] - YYYY-MM-DD

One or two sentences explaining the release in plain language.

### Added

- A user-visible capability and why it helps.

### Changed

- A user-visible refinement.

### Fixed

- A corrected behavior and its impact.
```

Include only populated sections. Add `Privacy`, `Accessibility`, or `Developer experience` only when materially useful. Keep bullets concise, specific, and understandable without reading commits. Do not paste commit titles, inflate routine maintenance, expose secrets, or claim outcomes that were not verified. Maintain comparison links at the bottom when a prior tag exists.

The GitHub Release body must use the same curated release entry. After the tag workflow creates the release, replace generic generated notes with the human-written summary and link to the full `CHANGELOG.md`. Preserve useful contributor and comparison links.

## Prepare the release change

1. Start a clean `codex/release-vX.Y.Z` branch from the latest `origin/main`, unless the user explicitly authorizes a different branch strategy.
2. Update `manifest.json`, `package.json`, and `package-lock.json` to `X.Y.Z` without creating an npm-generated tag.
3. Add the dated changelog entry and reset the `[Unreleased]` section.
4. Run:

   ```sh
   npm run check
   node scripts/check-version.mjs vX.Y.Z
   npm run package
   unzip -t dist/ego-dimmer-vX.Y.Z.zip
   ```

5. Inspect the ZIP contents. It must contain only the packaged runtime files enumerated by `scripts/package.mjs`, with no tests, development scripts, credentials, or release notes.
6. Review the final diff and create a signed release commit using the repository's configured signing identity. Fail closed if signing was requested or configured and the signature cannot be created.
7. If the user requested a PR, push the release branch and open a focused PR containing the version bump, changelog, and no unrelated changes.

## Tag and publish after merge

1. Refresh local `main` after the release PR merges. Verify the merged commit contains the intended version and changelog entry and that the worktree is clean.
2. Re-run the version check and complete verification on the merged commit.
3. Create a signed annotated tag `vX.Y.Z`. Never move, reuse, delete, or force-push a public release tag to repair a failed release; fix the problem and publish a higher patch version.
4. Push the tag, then monitor the `Release` GitHub Actions workflow through completion.
5. Verify the GitHub Release exists, its ZIP name matches the tag, and the asset passes `unzip -t`. Publish the curated release notes from `CHANGELOG.md`.
6. For automated Web Store publishing, verify the job uploaded to item `jddadhkcjolcpiogmofjnckbonlldfdh` and reached a submitted or pending-review state. For a manual first submission, provide the verified ZIP and exact dashboard handoff instead.

## Report the outcome

Return links to the release PR, tag, GitHub Release, workflow run, public changelog, and Chrome Web Store item when available. State the verification performed and distinguish clearly among packaged, submitted for review, approved, and publicly available.
