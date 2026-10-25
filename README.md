<<<<<<< HEAD
# School Queue Tracker

## Project structure

- `frontend/` contains the Vue application, styles, and static assets. Its only HTML file is the Vite entry shell; Vue renders all application pages.
- `backend/` contains the Express server and its API.
- `package.json` and `.env` stay at the project root so the app can be installed and started from one place.

Vue renders each view at a clean URL such as `/my-queue`; Express serves the built Vue app for these paths. The browser also calls API endpoints such as `/api/bootstrap` on the same server.

## Run locally

### Requirements

- Node.js 18 or newer
- MongoDB Community Server running locally, or a MongoDB Atlas connection string

### Start the app

Run these commands in PowerShell from the project root:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm start
```

`npm start` builds the Vue frontend and starts the Express server. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser. Keep the terminal running while using the app. If port `3000` is unavailable, change `PORT` in `.env` and use the corresponding port in the browser. When using SMTP on a custom port, also set `APP_URL` to that local URL so emailed activation and reset links point to the running app.

The default MongoDB connection is `mongodb://127.0.0.1:27017/school_queue_tracker`. Update `MONGODB_URI` and `MONGODB_DB` in `.env` if you use a different database. The server reads `.env` from the project root even though its code lives in `backend/`.

Admin registration sends a one-time activation link that expires after 24 hours, so configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` in `.env` to enable email delivery. For Gmail, use a Google App Password; do not use your normal account password. `APP_URL` should be set to the public HTTPS address when deploying outside localhost.

The login page's **Forgot password?** flow emails a single-use reset link to the address on the administrator account. Reset links expire after 30 minutes. Email settings must be configured for password reset emails to be sent.

MongoDB is the source of truth for accounts, queue data, and pending registration. Browser storage is refreshed from MongoDB on page load; clearing MongoDB will not restore old records from a browser cache. Data opened previously through `file://` is isolated by the browser and is not available to the localhost app.

Administrator sessions expire five hours after sign-in. Shared queue members are removed when the owner logs out, starts a new independent queue, or stops sending presence heartbeats for 90 seconds. Members are notified and returned to the dashboard when their joined window closes.

Leaving the My Queue page asks for confirmation. Confirming removes the current queue window; leaving an owner queue also removes its joined windows. The customer display checks for its queue ending, attempts to close its tab, and exits to the sign-in page if the browser blocks tab closure. Closing or reloading the browser tab uses the browser's native leave-page confirmation, since browsers do not allow custom dialogs during tab closure.

When joining with a code, select a service type and an available window. Windows already used by an active queue are disabled in both Queue Setup and the dashboard shortcut.

Queue owners can jump to any positive whole ticket number from My Queue, including a number completed earlier. Recalling a completed number records a new service event. After the jump ticket is completed, the queue continues sequentially from the next number; existing waiting tickets do not interrupt this run. Numbers currently being served at another window are skipped.

## Why this stack instead of PHP?

The existing application uses JavaScript in the browser and Node.js/Express on the server. Using JavaScript on both sides keeps the current API and app behavior together and avoids introducing a second runtime. PHP could serve the same role, but adopting it would require rewriting the Express API and its MongoDB/email integration; it is a valid alternative, not a requirement for URL navigation.

## MongoDB Compass

Connect Compass with:

```text
mongodb://127.0.0.1:27017/school_queue_tracker
```

The `accounts`, `queue_state`, `pending_accounts`, and `activation_tokens` collections are created on startup. This local setup is intended for development; configure authentication and access controls before exposing the server or database to a network.

To use MongoDB Atlas instead, set `MONGODB_URI` in `.env` to the Atlas connection string and keep the database name in `MONGODB_DB`.

The customer display arranges active service windows by count: two windows sit side by side, three place the two-window service across the top and the remaining window below, and four place Cashier windows in a left column and Registrar windows in a right column.
=======
# School-Queue-Tracker-AU-South
>>>>>>> origin/main
