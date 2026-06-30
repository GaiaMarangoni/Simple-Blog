# My Simple Blog

A picture-and-text blog with a password-protected admin page for posting. No database, no complicated setup — just Node.js.

## Running it on your computer

1. Make sure you have Node.js installed (download from nodejs.org if not — any recent version works).
2. Open a terminal in this folder.
3. Set your admin password and start the server:

   **Mac/Linux:**
   ```
   ADMIN_PASSWORD=yourpassword node server.js
   ```

   **Windows (Command Prompt):**
   ```
   set ADMIN_PASSWORD=yourpassword
   node server.js
   ```

4. Open your browser to **http://localhost:3000**
5. Click "Admin" in the top right, log in with your password, and publish your first post.

If you skip setting `ADMIN_PASSWORD`, it defaults to `changeme123` — fine for testing, but change it before sharing the site with anyone.

## How it works

- All your posts (text + which image goes with them) are saved in `data/posts.json`.
- Uploaded pictures are saved in the `uploads/` folder.
- No database, no external accounts needed — just files on disk.
- There are zero external dependencies (no `npm install` needed). It only uses what comes built into Node.js.

## Deploying it to the web (so others can see it)

Since this has a real backend (the admin login + photo uploads need one), it needs a host that runs Node.js — not a purely static host like plain GitHub Pages.

Easiest free options:

### Render.com (recommended, free tier)
1. Create a free account at render.com.
2. Create a new "Web Service," and upload/connect this folder (or push it to a GitHub repo and connect that).
3. Set the **Start Command** to: `node server.js`
4. Add an environment variable: `ADMIN_PASSWORD` = your chosen password.
5. Deploy. Render gives you a public URL like `yourblog.onrender.com`.

### Railway.app (also free tier, very similar)
Same idea: connect the project, set `ADMIN_PASSWORD` as an environment variable, and it runs `node server.js` automatically.

**Important note on free hosts:** most free tiers use a temporary filesystem, meaning uploaded photos and posts can be wiped if the server restarts/redeploys. This is fine for trying things out, but if you want this to be permanent, let me know and I can adjust the storage to use a small free cloud storage service instead of local disk — just say so once you're ready to deploy for real.

## Customizing

- Change the site name: edit `My Blog` near the top of `server.js` (search for `<h1>My Blog</h1>`).
- Change colors: edit the `:root { ... }` section near the top of the `<style>` block in `server.js`.
