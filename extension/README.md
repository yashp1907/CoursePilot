# CoursePilot Canvas Bridge (Chrome extension)

For schools that **block students from creating Canvas access tokens**. The extension reads *your own* Canvas
courses and assignments through the Canvas session you're already logged into (the same requests the Canvas website
makes) and hands them to your open CoursePilot tab, which saves them to your account.

## What it can and can't do
- **Read-only.** Per course it reads assignments, announcements, the syllabus tab, the home page and a few key pages, the **staff list (instructors and TAs only; it never requests students)**, sections, calendar, tabs and modules. It only makes GET requests, only to the one Canvas address you grant, and only when you press Sync in CoursePilot.
- **No credentials leave your browser.** It doesn't read, copy or send your cookies or password. It never contacts any server other than Canvas.
- **Only your CoursePilot tab can talk to it** (a content script on `localhost:3000` and any address you add below).
- It asks Chrome for permission to **one** host (your Canvas address), not all websites.

## Install (Chrome, Edge, Brave)
1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select this `extension/` folder.
2. Click the extension's icon → enter your Canvas address (e.g. `https://canvas.youruniversity.edu`) → **Grant access & save**.
   Keep yourself logged into Canvas in the same browser profile.
3. Open CoursePilot → **Integrations** (reload the page once after installing) → **Sync with extension**.

## Using a deployed CoursePilot
Add your site to `content_scripts[0].matches` in `manifest.json` (e.g. `"https://your-app.vercel.app/*"`), then click the reload icon on the extension card.

## Troubleshooting
- *"Not detected"*: reload the CoursePilot tab after installing; check the tab's address is in `matches`.
- *"Log into Canvas in this browser"*: your Canvas session expired. Open Canvas, sign in, retry.
- Some schools block API calls that use a browser session. If the popup's **Test** button fails even while logged in, ask your Canvas administrators to generate an access token for you (Canvas suggests this on the token page).

## A note on policy
This accesses only your own account data through your own login. If your school's acceptable-use policy restricts automated access to Canvas, check with them before using it.
