# Google Cloud setup (iteration 3: Drive sync)

The app stores all its data in a single `tarot.json` file on Google Drive. For a web page to read and
write that file on behalf of a player, Google requires an **OAuth client ID**, which lives in a
**Google Cloud project**. This is free, needs no billing account and no credit card, and takes about
15 minutes. Use your usual Google account: there is no separate "Google Cloud account".

> The console's labels change from time to time. The path "Google Auth Platform → Clients → Create
> client" is documented in [Manage OAuth Clients](https://support.google.com/cloud/answer/6158849);
> `drive.file` is listed as a non-sensitive scope in
> [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## 1. Create the project

1. Open <https://console.cloud.google.com/> and sign in.
2. Project selector (top bar) → **New project** → name it `FamilyTarot` → **Create**.
3. Select the new project.

## 2. Enable the APIs

**APIs & Services → Library**, then enable both:

- **Google Drive API**
- **Google Picker API**

## 3. Consent screen (Google Auth Platform)

1. **Google Auth Platform → Branding**: app name `FamilyTarot`, your e-mail as support and developer contact.
2. **Audience**: choose **External**.
3. **Data Access → Add or remove scopes**: add **only** `https://www.googleapis.com/auth/drive.file`
   (non-sensitive: it only gives the app access to the files a user created with it or picked in the file picker).
4. **Audience → Publish app** (status **In production**). Leaving the app in *Testing* limits sign-in to the
   test users you list and makes the sign-in expire after 7 days. Publishing needs no Google verification
   as long as only non-sensitive scopes are requested.

## 4. OAuth client ID

**Google Auth Platform → Clients → Create client**

- Application type: **Web application**
- Name: `FamilyTarot web`
- **Authorised JavaScript origins**: `https://wkirschenmann.github.io` (origin only, no path, no trailing slash)
- Authorised redirect URIs: leave empty (the sign-in uses a popup)

Copy the **Client ID** (it looks like `123456789-abc….apps.googleusercontent.com`). The client secret is not used.

## 5. API key for the file picker

**APIs & Services → Credentials → Create credentials → API key**, then edit it:

- Application restrictions: **Websites**, referrer `https://wkirschenmann.github.io/*`
- API restrictions: **Restrict key** → **Google Picker API**

Copy the key. Also note the **project number** (Project settings / dashboard, a number such as `123456789012`): the picker
needs it as the "app id" so that picking a file grants the app access to it.

## 6. GitHub secrets

In the repository: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Client ID from step 4 |
| `GOOGLE_API_KEY` | the API key from step 5 |
| `GOOGLE_APP_ID` | the project number from step 5 |

None of these is truly secret: they end up readable in the published page, like any web app's client ID. The deployment workflow
(`.github/workflows/pages.yml`, step "Inject configuration") writes them into `window.TAROT_CONFIG` in `app/index.html`, so nothing
is committed. A secret that is not set leaves its `__GOOGLE_…__` placeholder in the page, which the app treats as "not configured".
The Drive features that read `window.TAROT_CONFIG` come with iteration 3: until then creating the secrets is harmless but has no
visible effect. What actually protects the data is the Drive sharing: only the accounts the file is shared with can open it.

## 7. Drive file and sharing

- The first scorer creates `tarot.json` from the app (the only file the app ever creates; no dated copies, no sub-folder).
- Share it from Drive with every player's Google account, with **edit** rights.
- Each player opens the app, signs in, and picks the file **once** in the Google file picker; the app remembers it.

## What the prototype has to prove (hypotheses 1 to 3 and 12 of the plan)

Two Google accounts, A (owner) and B:

1. A creates the file and shares it with B in edit mode. B picks it once, reads it, then writes to it: no new consent on later visits.
2. Ten successive writes alternating between A and B keep the same file id and the sharing.
3. Sign-in works for a new account without a blocking "unverified app" screen.
4. The Google account id (`sub`) is stable and different for A and B.
