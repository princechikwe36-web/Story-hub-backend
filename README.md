# Story Hub Full Stack

## Folder structure
- `frontend/index.html` — Story Hub website UI.
- `backend/src/server.js` — Express + SQLite API.
- `backend/package.json` — backend dependencies.

## Run locally
1. Install Node.js 18+.
2. Open a terminal in `backend`.
3. Run `npm install`.
4. Run `npm start`.
5. Open `frontend/index.html` in a browser.
6. If the backend is not at `http://localhost:3000`, set:
   `localStorage.setItem("storyhub_api","https://YOUR-BACKEND/api")`
   before loading the page.

## Accounts
- Normal sign-up creates a reader account.
- Author/admin creation is intentionally protected by the server.
- To make an existing account the owner/admin, set `ADMIN_BOOTSTRAP_SECRET` on the server, then POST:
  `/api/admin/bootstrap`
  with `{ "email":"owner@example.com", "secret":"your-secret" }`.
- Never put the admin secret in the frontend.

## Important production steps
Use HTTPS, a strong JWT secret, a real managed database/backups, object storage for uploaded images, secure admin authentication, and an approved ad provider. The demo ad event is not an ad network and must not be treated as real advertising revenue.
