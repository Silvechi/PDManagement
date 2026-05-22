# Installation Guide

This guide gets PD Tracker running from scratch. No coding experience required. Every step is explained in plain language — follow them in order and you'll have a working app at the end.

---

## What you'll need

- A Google account (Gmail)
- A web browser (Chrome, Firefox, Safari, or Edge)

That's it. No servers, no subscriptions, no software to install.

**Time required:** about 15–20 minutes.

---

## Step 1 — Create the Google Sheet

This sheet is where all your data lives. The app reads and writes to it automatically.

1. Go to **[sheets.google.com](https://sheets.google.com)** and sign in to your Google account.

2. Click **Blank spreadsheet** (the big + tile).

3. Click "Untitled spreadsheet" at the very top of the page and type `PD Tracker`, then press Enter.

4. You need **four tabs** at the bottom of the sheet, named exactly as shown below. Right now you only have one called "Sheet1" — rename it and add the rest.

   | Tab name | How to get there |
   |---|---|
   | `Daily_Measurements` | Right-click "Sheet1" → Rename → type the name → press Enter |
   | `Inventory` | Click the **+** button bottom-left → rename the new tab |
   | `Dashboard` | Click **+** again → rename |
   | `Config` | Click **+** again → rename |

   > **The names are case-sensitive.** `Daily_Measurements` works; `daily_measurements` or `Daily Measurements` will not.

---

## Step 2 — Add the backend code

The backend is a small script that runs inside Google and handles saving/reading data. You paste it in once.

1. In your Google Sheet, click **Extensions** in the top menu, then click **Apps Script**.  
   A new browser tab opens showing a code editor with a few lines of placeholder code.

2. Click anywhere inside the editor, press **Ctrl+A** (Windows) or **Cmd+A** (Mac) to select everything, then press **Delete** to clear it. The editor should now be blank.

3. Open the file `apps-script/Code.gs` from the PDManagement folder on your computer. Open it with any text editor — on Windows you can right-click → Open with → Notepad; on Mac, right-click → Open With → TextEdit.

4. Press **Ctrl+A** / **Cmd+A** to select all the text, then **Ctrl+C** / **Cmd+C** to copy it.

5. Switch back to the Apps Script browser tab and press **Ctrl+V** / **Cmd+V** to paste. The editor should now be full of code.

6. Press **Ctrl+S** / **Cmd+S** to save. If a popup asks you to name the project, type `PD Tracker` and click **OK** (or **Rename**).

7. Near the top of the editor you'll see a dropdown that probably says **"myFunction"**. Click it and select **`setupSheet`** from the list.

8. Click the **Run ▶** button (the play button, to the right of the dropdown).

9. A popup titled "Authorization required" appears. Click **Review permissions**.
   - Choose your Google account.
   - You'll see a warning screen saying "Google hasn't verified this app". This is normal — it's your own code, not a third-party app.
   - Click **Advanced** (small text at the bottom left of the warning screen).
   - Click **Go to PD Tracker (unsafe)**.
   - Click **Allow**.

10. The script runs. After a few seconds, a green bar at the bottom says "Execution completed". Switch back to your Google Sheet — you'll see all four tabs now have column headers, and the Config tab is pre-filled with default items.

   > If you get a red error bar instead, check that you cleared the editor completely before pasting and that all four tabs are named exactly as shown in Step 1.

---

## Step 3 — Deploy as a Web App

This step creates a URL that the app will use to talk to your Google Sheet.

1. Still in the Apps Script editor, click **Deploy** in the top-right corner, then click **New deployment**.

2. On the left side of the dialog that appears, click the **gear icon ⚙** next to "Select type" and choose **Web app** from the menu.

3. Fill in the settings as follows:
   - **Description:** type anything, e.g. `v1` (this is just a label for your own reference)
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`

4. Click **Deploy**.

5. Another permissions popup may appear — follow the same steps as in Step 2 (Review permissions → Advanced → Allow).

6. A URL now appears in a box, looking something like:  
   `https://script.google.com/macros/s/AKfycbx.../exec`  
   Click **Copy** to copy it, then paste it somewhere safe (a note, a text file) — you'll need it in the next step.

7. Click **Done**.

> **Important:** if you ever edit `Code.gs` in the future, you must create a **New deployment** again to publish your changes. Simply saving the code file is not enough — the live app will keep running the old version until you deploy again.

---

## Step 4 — Connect the frontend

This step tells the app where your Google Sheet is.

1. On your computer, open the `PDManagement` folder and go into the `js` subfolder. Find the file named `api.js`.

2. Open `api.js` with a text editor (Notepad on Windows, TextEdit on Mac, or any code editor).

3. Near the top of the file, find this line:

   ```
   const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || 'YOUR_APPS_SCRIPT_URL_HERE';
   ```

4. Replace `YOUR_APPS_SCRIPT_URL_HERE` with the URL you copied in Step 3.  
   Keep the single quote marks on either side. The result should look like this:

   ```
   const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbx.../exec';
   ```

   > Make sure there are no extra spaces inside the quotes, and that you haven't deleted the single quotes.

5. Save the file (Ctrl+S / Cmd+S).

---

## Step 5 — Test locally

Before sharing the app, confirm it works on your own computer.

1. Open the `PDManagement` folder and double-click `index.html`. It will open in your default web browser.

2. The Dashboard should load and show inventory cards. If it shows "Failed to load", check the troubleshooting section at the bottom of this guide.

3. Try logging a measurement — tap **Log**, enter some values, and tap **Save Drainage**. Then go back to the Dashboard and confirm the data appears.

The app is now working. Skip to **Customising** if you only need it on your own computer and don't need to share it.

---

## Step 6 — Share the app (optional)

Opening `index.html` directly from your computer works fine for personal use, but the file URL (`file:///...`) cannot be sent to someone else. To share the app or use it on your phone, you need to host the files somewhere on the web.

Below are two free options, ordered from simplest to most flexible.

---

### Option A — Google Drive (simplest, no account setup needed)

Google Drive can serve static web pages for free, with no technical setup.

1. Go to **[drive.google.com](https://drive.google.com)** and sign in.

2. Click **New → Folder** and name it `PD Tracker`.

3. Open the folder, then drag and drop the entire contents of your `PDManagement` folder into it (all files and subfolders: `index.html`, `css/`, `js/`, etc.).  
   Wait for the upload to finish.

   > **⚠ Google Drive no longer serves HTML files in the browser** — any link you share will download the file instead of opening it. Option A is not usable for this app. Use **Option B (GitHub Pages)** instead.

---

### Option B — GitHub Pages (recommended, free forever)

GitHub Pages is designed exactly for hosting web apps like this one. It's free, reliable, and gives you a clean URL.

#### Part 1: Create a GitHub account (skip if you already have one)

1. Go to **[github.com](https://github.com)** and click **Sign up**.
2. Follow the steps to create a free account. You only need the free tier.

#### Part 2: Create a repository and upload your files

1. Once signed in, click the **+** icon in the top-right corner → **New repository**.

2. Fill in the settings:
   - **Repository name:** `pd-tracker` (or any name you like — this becomes part of your URL)
   - **Visibility:** you can choose Public or Private. Note: GitHub Pages on free accounts requires Public.
   - Leave everything else as-is.

3. Click **Create repository**.

4. On the next page, look for the option that says **"uploading an existing file"** and click it.

5. Drag and drop **all the files and folders** from your `PDManagement` folder into the upload area. Make sure to include:
   - `index.html`
   - The `css/` folder
   - The `js/` folder  
   - (You don't need to upload `apps-script/`, `tests/`, or development files)

6. Scroll down, add a short commit message like `initial upload`, and click **Commit changes**.

#### Part 3: Enable GitHub Pages

1. On your repository page, click **Settings** (the tab near the top).

2. In the left sidebar, click **Pages**.

3. Under "Source", change the dropdown from "None" to **Deploy from a branch**.

4. Under "Branch", select **main** (or **master**) and leave the folder as `/ (root)`.

5. Click **Save**.

6. Wait about 1–2 minutes, then refresh the page. A green banner will appear with your app's URL, which looks like:  
   `https://your-username.github.io/pd-tracker/`

7. Open that URL on your phone or share it with a caregiver. Bookmark it for easy access.

> **Updating the app:** if you make changes to any files (e.g. edit `api.js` or change styles), go back to the repository on GitHub, click the file, click the pencil icon to edit, paste the new content, and commit. The site updates automatically within a minute or two.

---

### Option C — Other free hosting options

| Service | How | Best for |
|---|---|---|
| **Netlify** | Drag and drop your folder onto [netlify.com/drop](https://app.netlify.com/drop) | Instant, no account required |
| **Vercel** | Connect a GitHub repo at [vercel.com](https://vercel.com) | If you're already using GitHub |
| **Cloudflare Pages** | Connect a GitHub repo at [pages.cloudflare.com](https://pages.cloudflare.com) | Fastest global delivery |

For all of these: the folder to upload is `PDManagement`, and there is no build step needed — it's just static files.

---

## Customising items and steps

Everything in the **Prep** and **Inventory** screens comes from the `Config` tab in your Google Sheet. You can change it at any time without touching any code.

| Column A | Column B | Column C | Column D (optional) |
|---|---|---|---|
| `inventory` | item name | minimum count before warning | *(leave blank)* |
| `prep_items` | order number (1, 2, 3…) | item text | explanation shown as a tooltip |
| `prep_steps` | order number (1, 2, 3…) | step text | explanation shown as a tooltip |

**To add a supply item:**  
Add a new row. Column A = `inventory`, Column B = the item name (e.g. `Sodium Bags`), Column C = the minimum count number (e.g. `5`). Leave Column D blank.

**To add a tooltip explanation to a prep item or step:**  
Type the explanation text in Column D of that row. Leave Column D empty for items that don't need one.

**To remove an item:**  
Delete the entire row.

**To change the order of steps:**  
Change the numbers in Column B. The app sorts by these numbers, so you can use any numbers — they don't have to be consecutive.

> Config changes take effect immediately when the app is refreshed. No redeployment needed.

---

## Troubleshooting

### The app shows "Failed to load" on the Dashboard

1. Check that you pasted the correct URL into `js/api.js` — it should end with `/exec`, not `/dev`.
2. Make sure there are no extra spaces inside the quotes.
3. Open `js/api.js` in a text editor and confirm the line looks exactly like the example in Step 4.
4. If you changed `Code.gs` since your last deployment, create a new deployment (Step 3).

### Data saves but the Dashboard shows nothing

The four sheet tabs must be named exactly as specified in Step 1. Names are case-sensitive and must use underscores (not spaces). Open your Google Sheet and check:
- `Daily_Measurements` ✓ (not `Daily Measurements` or `daily_measurements`)
- `Inventory` ✓
- `Dashboard` ✓
- `Config` ✓

If any name is wrong, rename the tab and reload the app.

### The permissions popup never appeared (Step 2, item 9)

The script may have run without asking because you already authorised it for another project, or a browser extension blocked the popup. Try:
1. In the Apps Script editor, click **Run → Run function → setupSheet**.
2. If no popup appears and you see a red error, click the **Triggers** icon (clock icon in the left sidebar) — there may be a stale permission there.

### I see "Exception: You do not have permission to call…"

Re-run the authorisation:
1. In Apps Script, click **Project Settings** (gear icon, left sidebar).
2. Click **Reset permissions** if that option is available, or simply delete the deployment and create a new one.

### The app works on my computer but not when I open the shared link

- If using Google Drive: the file may not be set to "Anyone with the link". Go to Drive, right-click the file → Share, and confirm the access setting.
- If using GitHub Pages: the site may still be building — wait 2 minutes and refresh.
- Check that you uploaded `index.html` to the root of the repository (not inside a subfolder). The URL `your-site.github.io/pd-tracker/` must directly serve `index.html`.
- Confirm the URL in `js/api.js` ends in `/exec` and was saved before you uploaded.

### Items I added to the Config sheet don't appear in the app

The Config sheet is read live — no redeployment needed. If changes don't appear:
1. Hard-refresh the app: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac).
2. Check the spelling of the Category value in Column A — it must be exactly `inventory`, `prep_items`, or `prep_steps` (all lowercase).

### The app shows the wrong date or time

The app uses your device's local clock. If the date or time looks wrong, check your device's date/time settings.
