# Setup (about 20 minutes)

## 1. Google Sheet (the database), easiest way: Apps Script (about 5 minutes)
1. Create a blank Google Sheet named "Vardhaman Leads".
2. Extensions > Apps Script. Delete the sample code and paste the contents of `apps-script/Code.gs`.
3. On the line `const TOKEN = 'PASTE_YOUR_TOKEN_HERE';` put a long random string (this is `APPS_SCRIPT_TOKEN`).
4. Deploy > New deployment > type **Web app** > Execute as **Me** > Who has access **Anyone** > Deploy. Approve the permissions. Copy the **Web app URL** (this is `APPS_SCRIPT_URL`).
5. On Netlify add `APPS_SCRIPT_URL` and `APPS_SCRIPT_TOKEN`, then redeploy. The `leads` and `events` tabs are created automatically.
6. If you change the script later: Deploy > Manage deployments > Edit > New version.

The address alone is useless to others: every request must carry the token.

## 1b. Alternative: Google Cloud service account (stronger, more steps)
1. Create a blank Google Sheet named "Vardhaman Leads". Copy the long id from its URL (between `/d/` and `/edit`). That is `GOOGLE_SHEET_ID`.
2. Google Cloud Console: create a project, enable **Google Sheets API**.
3. IAM & Admin > Service accounts > Create. Open it > Keys > Add key > JSON. A file downloads. Its whole content is `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. In the Sheet, click **Share** and add the service account's email (ends with `iam.gserviceaccount.com`) as **Editor**.
5. The app creates the `leads` and `events` tabs and header rows by itself on first use.

## 2. Netlify
1. Netlify > Add new site > Import from GitHub > pick this repo. Build settings come from `netlify.toml`; leave the build command empty.
2. Site configuration > Environment variables. Add all five from `.env.example`: `ADMIN_PASSWORD_SHA256`, `SESSION_SECRET`, `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `ALLOWED_ORIGINS`.
3. Trigger a deploy. Open `https://<your-site>.netlify.app/ops-5847bf98d902/` and sign in.

## 3. Put the form on the academy website
Add this where the form should appear on the academy site (same-origin copy of `lead.js` recommended):

```html
<div id="va-lead"></div>
<script src="./lead.js" data-api="https://<your-leads-site>.netlify.app" data-whatsapp="91XXXXXXXXXX" data-consent-url="./consent/" defer></script>
```

Add the academy site's address to `ALLOWED_ORIGINS` so the leads site accepts its submissions.

## 4. Change the password
Run `npm run hash -- "new password"`, put the output in `ADMIN_PASSWORD_SHA256` on Netlify, redeploy.

## Notes
- Google Sheets is fine for tens of leads a day. When it gets slow, replace `lib/store.mjs` with a database adapter; nothing else changes.
- The Netlify free plan covers this volume.
