# Installation Guide

This guide gets PD Tracker running from scratch. No coding experience required. Every step is explained in plain language — follow them in order and you'll have a working app at the end.

---

## What you'll need

- A Google account (Gmail)
- A web browser (Chrome, Firefox, Safari, or Edge)

That's it. No servers, no subscriptions, no software to install.

**Time required:** about 20–25 minutes.

---

## Step 1 — Create the Google Sheet

This sheet is where all your data lives. The app reads and writes to it automatically.

1. Go to **[sheets.google.com](https://sheets.google.com)** and sign in to your Google account.

2. Click **Blank spreadsheet** (the big + tile).

3. Click "Untitled spreadsheet" at the very top and type `PD Tracker`, then press Enter.

   > Leave the default "Sheet1" tab as-is — the setup script in Step 2 will create all the required tabs automatically.

---

## Step 2 — Add the backend code

The backend is a small script that runs inside Google and handles saving/reading data. You paste it in once.

1. In your Google Sheet, click **Extensions** in the top menu, then click **Apps Script**.  
   A new browser tab opens showing a code editor.

2. Click anywhere inside the editor, press **Ctrl+A** (Windows) or **Cmd+A** (Mac) to select everything, then press **Delete** to clear it.

3. Open the file `apps-script/Code.gs` from the PDManagement folder on your computer. Open it with any text editor (Notepad on Windows, TextEdit on Mac).

4. Press **Ctrl+A** / **Cmd+A** to select all, then **Ctrl+C** / **Cmd+C** to copy.

5. Switch back to the Apps Script browser tab and press **Ctrl+V** / **Cmd+V** to paste.

6. Press **Ctrl+S** / **Cmd+S** to save. If a popup asks you to name the project, type `PD Tracker` and click **OK**.

7. Near the top of the editor you'll see a dropdown. Click it and select **`setupSheet`** from the list.

8. Click the **Run ▶** button.

9. A popup titled "Authorization required" appears. Click **Review permissions**.
   - Choose your Google account.
   - You'll see a warning screen saying "Google hasn't verified this app". This is normal — it's your own code.
   - Click **Advanced** (small text at the bottom left).
   - Click **Go to PD Tracker (unsafe)**.
   - Click **Allow**.

10. The script runs. After a few seconds, a green bar at the bottom says "Execution completed". Switch back to your Google Sheet — all required tabs are now created with column headers (Daily_Measurements, Inventory, Config, Tokens, Patients, Recipients, AuditLog), the Config tab is pre-filled with default items, and the Tokens tab has a status dropdown in column C.

    > If you get a red error bar instead, check that you cleared the editor completely before pasting (Step 2 above).

---

## Step 3 — Deploy as a Web App

This step creates a URL that the app will use to talk to your Google Sheet.

1. Still in the Apps Script editor, click **Deploy** in the top-right corner, then click **New deployment**.

2. On the left side of the dialog, click the **gear icon ⚙** next to "Select type" and choose **Web app**.

3. Fill in the settings:
   - **Description:** type anything, e.g. `v1`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`

4. Click **Deploy**.

5. Another permissions popup may appear — follow the same steps as in Step 2.

6. A URL appears, looking like:  
   `https://script.google.com/macros/s/AKfycbx.../exec`  
   Click **Copy** and paste it somewhere safe — you'll need it in the next step.

7. Click **Done**.

> **Important:** if you ever edit `Code.gs` in the future, you must create a **New deployment** again to publish your changes. Simply saving the file is not enough.

---

## Step 4 — Connect the frontend

This step tells the app where your Google Sheet is.

1. On your computer, open the `PDManagement/js` folder.

2. Create a new file called exactly `config.js` (use Notepad on Windows, TextEdit on Mac, or any text editor).

3. Paste the following into the file, replacing the URL with the one you copied in Step 3:

   ```js
   window.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx.../exec';
   ```

   Keep the single quote marks on either side of the URL.

4. Save the file inside the `js` folder so the path is `PDManagement/js/config.js`.

---

## Step 5 — Register your device

On first launch, the app shows a registration screen instead of the dashboard. You need to register each device (phone, tablet, computer) individually.

1. Open `index.html` in your browser (or open the hosted URL if you've already shared the app — see Step 6).

2. The **PD Tracker** registration screen appears. Optionally enter a name like "Mom's phone" so you can identify the device in the Tokens sheet.

3. Click **Request access**. The app shows a "Waiting for approval" screen with a bookmark URL.

4. **Save that URL as a bookmark right now.** It looks like `your-app-url/#some-long-code`. This is the URL you'll use every time you open the app — it won't work without the code at the end.

5. Open your **PD Tracker Google Sheet** and click the **Tokens** tab.

6. You'll see a new row with your device name and status `pending`. Click the cell in the **Status** column and change it to `approved` using the dropdown.

7. Go back to the app and click **Check again**. The dashboard loads.

> **Each device or browser needs its own registration.** If you use the app on a second phone, repeat Steps 1–7 on that device. You'll see a second `pending` row appear in the Tokens sheet.

---

## Step 6 — Test the app

Confirm everything works before sharing.

1. The Dashboard should show your inventory cards. If it shows "Failed to load", see the Troubleshooting section.

2. Tap **Log**, enter some values, and tap **Save Drainage**.

3. Go back to the Dashboard — the "Last exchange" time should update.

4. Open the **History** tab and confirm the entry appears.

The app is working. Continue to Step 7 if you want to use it on your phone or share it with a caregiver.

---

## Step 7 — Share the app (optional)

Opening `index.html` directly from your computer works for personal use, but the file URL (`file:///...`) cannot be sent to someone else. To use the app on a phone or share it, you need to host the files on the web.

---

### Option A — GitHub Pages (recommended, free forever)

#### Part 1: Create a GitHub account (skip if you already have one)

1. Go to **[github.com](https://github.com)** and click **Sign up**.
2. Follow the steps to create a free account.

#### Part 2: Create a repository and upload your files

1. Once signed in, click **+** → **New repository**.

2. Fill in:
   - **Repository name:** `pd-tracker` (this becomes part of your URL)
   - **Visibility:** Public (required for free GitHub Pages)

3. Click **Create repository**.

4. Click **"uploading an existing file"** and drag in the following from your `PDManagement` folder:
   - `index.html`
   - The `css/` folder
   - The `js/` folder (make sure `config.js` is included)
   
   You don't need to upload `apps-script/`, `tests/`, or development files.

5. Scroll down, add a commit message like `initial upload`, and click **Commit changes**.

#### Part 3: Enable GitHub Pages

1. Click **Settings** on your repository page.
2. In the left sidebar, click **Pages**.
3. Under "Source", select **Deploy from a branch**.
4. Under "Branch", select **main** (or **master**), folder `/ (root)`.
5. Click **Save**.
6. Wait 1–2 minutes, then refresh. A green banner shows your URL:  
   `https://your-username.github.io/pd-tracker/`

**To add a new device after hosting:** open the app URL on the new device (no `#code` yet), register, approve in the Tokens sheet, then save the generated bookmark URL on that device.

---

### Option B — Other free hosting options

| Service | How | Best for |
|---|---|---|
| **Netlify** | Drag and drop your folder onto [netlify.com/drop](https://app.netlify.com/drop) | Instant, no account required |
| **Vercel** | Connect a GitHub repo at [vercel.com](https://vercel.com) | If you're already using GitHub |
| **Cloudflare Pages** | Connect a GitHub repo at [pages.cloudflare.com](https://pages.cloudflare.com) | Fastest global delivery |

For all of these: upload the `PDManagement` folder contents; there is no build step.

---

## Customising items and steps

Everything in the **Prep** and **Inventory** screens comes from the `Config` tab. You can change it at any time without touching any code.

**Inventory rows (columns A–H):**

| Col | Field | Example |
|---|---|---|
| A | `inventory` | (literal text) |
| B | Item name | `Solution Bags 2.27%` |
| C | Minimum stock count | `5` |
| D | Description / tooltip | `Green bag. Check expiry.` |
| E | Is a solution bag (`TRUE`/`FALSE`) | `TRUE` |
| F | Active — show in app (`TRUE`/`FALSE`) | `TRUE` |
| G | Bag colour (hex) | `#2BA15A` |
| H | Display name | `2.27%` |

**Prep/step rows (columns A–D):**

| Col | Field | Example |
|---|---|---|
| A | `prep_items` or `prep_steps` | |
| B | Order number | `1` |
| C | Item / step text | `Blue mask` |
| D | Tooltip explanation (optional) | `Check expiry date` |

Changes take effect immediately when the app is refreshed. No redeployment needed.

---

## Managing device access

The **Tokens** tab in your Google Sheet is the access control panel:

| Action | How |
|---|---|
| **Approve a device** | Change status from `pending` → `approved` |
| **Revoke a device** | Change status to `revoked` in the Tokens sheet, or use **Settings → Users → Revoke** in the app (requires a full-access device) |
| **Add a label** | Edit the Label column to identify the device (e.g. "Dad's iPad") |

The **Last Used** column updates automatically each time an approved device opens the app.

---

## Troubleshooting

### The app shows "Failed to load" on the Dashboard

1. Check that `js/config.js` exists and contains the correct URL ending with `/exec` (not `/dev`).
2. Make sure there are no extra spaces inside the quotes.
3. If you changed `Code.gs` since your last deployment, create a new deployment (Step 3).

### The registration screen keeps appearing / "Check again" stays on "Still pending"

1. Open the **Tokens** tab in Google Sheets.
2. Find the row with your device and confirm the Status column shows `approved` (not `pending`).
3. If you don't see a row for your device, the registration call may have failed — try the **Request access** button again.
4. Make sure `Code.gs` has been deployed (Step 3) and `config.js` points to the correct URL.

### The app shows "Access denied"

Your device's token has been revoked. Open the Tokens sheet and change the status back to `approved`, or register as a new device.

### Data saves but the Dashboard shows nothing

The five sheet tabs must be named exactly as specified in Step 1. Names are case-sensitive and must use underscores. Open your Google Sheet and check each tab name.

### The permissions popup never appeared (Step 2)

The script may have run without asking because you already authorised it for another project. Try:
1. In the Apps Script editor, click **Run → Run function → setupSheet**.
2. If no popup appears and you see a red error, check the **Triggers** icon in the left sidebar.

### I see "Exception: You do not have permission to call…"

Re-run the authorisation: in Apps Script, click **Project Settings** (gear icon) and reset or re-authorise permissions, or delete the deployment and create a new one.

### The app works on my computer but not on the shared link

- Check that `js/config.js` was included in the upload (it's easy to miss since it's often gitignored).
- Confirm `index.html` is at the root of the repository, not inside a subfolder.
- If using GitHub Pages, wait 2 minutes after the first deployment.

### Items I added to the Config sheet don't appear in the app

Hard-refresh the app: **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac). Check that the Category value in Column A is exactly `inventory`, `prep_items`, or `prep_steps` (all lowercase).

### The app shows the wrong date or time

The app uses your device's local clock. Check your device's date/time settings.

### The "Send report" screen shows no recipients

Open the **Recipients** tab in your Google Sheet. Make sure at least one row exists with **Active** set to `TRUE`. If the tab doesn't exist, run `setupSheet()` again from the Apps Script editor to create it.

### A history report email was sent but never arrived

1. Check the spam folder — the email comes from the Google account that owns the script, not your own address.
2. Consumer Gmail accounts can send at most 100 emails per day via `MailApp`. If the daily limit is reached, the send will fail silently. Try again the next day.
3. Confirm the recipient's address in the **Recipients** tab is spelled correctly.
