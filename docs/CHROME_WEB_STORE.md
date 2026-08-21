# Chrome Web Store publishing

The release workflow uses the current Chrome Web Store API v2 and short-lived Google credentials issued through GitHub Actions OIDC. It does not require an OAuth refresh token or a long-lived service-account key.

Chrome does not let API v2 create a new store item or complete its listing. The first item setup is therefore a one-time manual prerequisite; every later version is driven by a Git tag.

## What the repository owner must provide

You need:

1. A Chrome Web Store developer account with 2-Step Verification enabled.
2. An existing Chrome Web Store item, including its 32-character extension ID.
3. The publisher ID shown under **Developer Dashboard → Publisher → Settings**.
4. A Google Cloud project with the Chrome Web Store API enabled.
5. One Google service account linked to the Chrome Web Store publisher account.
6. A Workload Identity Federation provider that trusts release tags from this GitHub repository.

The IDs and provider names are configuration, not secrets. No private key is stored in GitHub.

## 1. Create and publish the first item manually

Run:

```sh
npm test
npm run validate
npm run package
```

In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), choose **Add new item** and upload `dist/ego-dimmer-v1.0.0.zip`. Complete the Store listing, Privacy practices, and Distribution tabs, then submit the initial `1.0.0` release manually.

This initializes the item, listing, visibility, and privacy declarations that API v2 intentionally does not manage. Save the extension ID and publisher ID. Automated tags begin with the next version.

Recommended privacy answers should reflect the code accurately:

- Single purpose: limit the displayed brightness of media on user-enabled websites.
- Remote code: no.
- Data use: no collection or transfer; settings are stored in Chrome Sync.
- Permission justifications: copy the explanations from the README's Permissions section.
- Privacy policy URL: use the public GitHub URL for `PRIVACY.md` after the repository is pushed.

## 2. Create the Google service account

These commands assume the Google Cloud CLI is installed and authenticated. Replace the uppercase placeholders first.

```sh
export EGO_GCP_PROJECT_ID="YOUR_GOOGLE_CLOUD_PROJECT_ID"
export EGO_GITHUB_REPOSITORY="GITHUB_OWNER/ego-dimmer"
export EGO_SERVICE_ACCOUNT_NAME="chrome-web-store-publisher"

gcloud services enable chromewebstore.googleapis.com \
  --project "$EGO_GCP_PROJECT_ID"

gcloud iam service-accounts create "$EGO_SERVICE_ACCOUNT_NAME" \
  --display-name "Chrome Web Store publisher" \
  --project "$EGO_GCP_PROJECT_ID"
```

The service account does not need a project-level IAM role. In the Chrome Web Store Developer Dashboard, open **Account** and add this email as the publisher's API service account:

```text
chrome-web-store-publisher@YOUR_GOOGLE_CLOUD_PROJECT_ID.iam.gserviceaccount.com
```

The Chrome Web Store currently permits one linked service account per publisher.

## 3. Trust this repository's release tags

Create a dedicated workload identity pool and provider:

```sh
gcloud iam workload-identity-pools create "github" \
  --location "global" \
  --display-name "GitHub Actions" \
  --project "$EGO_GCP_PROJECT_ID"

gcloud iam workload-identity-pools providers create-oidc "ego-dimmer-tags" \
  --location "global" \
  --workload-identity-pool "github" \
  --display-name "Ego Dimmer release tags" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition "assertion.repository=='$EGO_GITHUB_REPOSITORY' && assertion.ref.startsWith('refs/tags/v')" \
  --project "$EGO_GCP_PROJECT_ID"
```

Get the Google Cloud project number and grant only this repository permission to impersonate the service account:

```sh
export EGO_GCP_PROJECT_NUMBER="$(gcloud projects describe "$EGO_GCP_PROJECT_ID" --format='value(projectNumber)')"
export EGO_SERVICE_ACCOUNT_EMAIL="$EGO_SERVICE_ACCOUNT_NAME@$EGO_GCP_PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "$EGO_SERVICE_ACCOUNT_EMAIL" \
  --role "roles/iam.workloadIdentityUser" \
  --member "principalSet://iam.googleapis.com/projects/$EGO_GCP_PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$EGO_GITHUB_REPOSITORY" \
  --project "$EGO_GCP_PROJECT_ID"

gcloud iam workload-identity-pools providers describe "ego-dimmer-tags" \
  --location "global" \
  --workload-identity-pool "github" \
  --project "$EGO_GCP_PROJECT_ID" \
  --format "value(name)"
```

The final command prints the provider name used in GitHub, in the form `projects/123456789/locations/global/workloadIdentityPools/github/providers/ego-dimmer-tags`.

## 4. Configure the GitHub environment

Create an environment named `chrome-web-store` under **Repository Settings → Environments**. Add these environment variables:

| Variable | Value |
| --- | --- |
| `CWS_PUBLISHER_ID` | Chrome Web Store publisher ID |
| `CWS_EXTENSION_ID` | 32-character extension/item ID |
| `CWS_SERVICE_ACCOUNT` | Full service-account email |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider name printed above |

Optionally add required reviewers to this environment. A release tag will then wait for human approval immediately before it uploads to the Chrome Web Store, while the GitHub Release can still be created automatically.

## 5. Release from a tag

For each release, update the version in both `manifest.json` and `package.json`, commit it, and push a matching tag:

```sh
git tag v1.0.1
git push origin v1.0.1
```

The workflow rejects a tag that does not exactly equal `v` plus the manifest version. It then:

1. Runs tests and structural validation.
2. Creates a reproducible `ego-dimmer-vX.Y.Z.zip`.
3. Creates or updates the matching GitHub Release.
4. Exchanges GitHub's OIDC token for a short-lived Google access token scoped to the Chrome Web Store API.
5. Uploads the package through API v2.
6. Blocks on Web Store validation warnings, then submits for review with automatic publication after approval.

The Chrome review itself is asynchronous, so a green workflow means the submission was accepted—not that review has completed.

Official references: [Chrome Web Store API setup](https://developer.chrome.com/docs/webstore/using-api), [service accounts](https://developer.chrome.com/docs/webstore/service-accounts), and [API v2 reference](https://developer.chrome.com/docs/webstore/api/reference/rest).
