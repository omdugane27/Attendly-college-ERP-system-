# Attendly Dark Mode — Android install

## 1. Upload the new files
1. Download and extract `attendly-dark-mode-feature.zip`.
2. Open https://github.com/omdugane27/student-attendance-system and sign in.
3. Tap **Add file → Upload files**.
4. Upload `theme.css` and `theme.js` to the repository root (same level as `index.html`).
5. Tap **Commit changes**.

## 2. Connect the feature
1. Open `index.html` in GitHub and tap the pencil/Edit icon.
2. In `<head>`, immediately after the existing `styles.css` link, add:
   `<link rel="stylesheet" href="./theme.css">`
3. Near the bottom, immediately before `</body>`, add:
   `<script src="./theme.js"></script>`
4. Tap **Commit changes**.

## 3. Test
Open the live app and look for the round moon/sun button at the bottom-right. Tap it to switch themes. The browser remembers your choice.

This add-on does not change Supabase authentication or database records. GitHub Pages may need a short time to redeploy. If GitHub says you do not have write access, verify you are signed into the correct account.
