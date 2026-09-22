# Story Hub — one-deployment version

This version serves the frontend and API from the same Node/Express service, so visitors use one URL.

## Deploy on Render
1. Put the contents of this folder in a GitHub repository.
2. In Render, create a new Web Service and connect that repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variable `ADMIN_EMAIL` = the email you want to use as the owner account.
6. `JWT_SECRET` can be generated automatically by Render (or set a long random secret yourself).
7. Deploy.
8. Open the Render URL. Story Hub should load there.

The account created with the exact `ADMIN_EMAIL` becomes the admin/owner account. Other new accounts are readers by default.

## Important storage note
SQLite and uploaded files are stored on the server's local filesystem. On hosting plans with an ephemeral filesystem, data/files can be lost after a restart or redeploy. For production, attach persistent storage or move the database/uploads to a persistent service.

## Ad note
The current ad-event system records events inside Story Hub; it does not create real advertising revenue. A real ad network must be integrated separately before earnings are counted as actual money.
