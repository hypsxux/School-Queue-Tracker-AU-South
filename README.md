# School Queue Tracker

A web app for school administrators to manage service queues and for customers to check their ticket status.

## Run locally

### Requirements

- Git
- Node.js 18 or newer (npm is included with Node.js)
- MongoDB Community Server running locally, or a MongoDB Atlas connection string

### 1. Clone the repository

```powershell
git clone https://github.com/hypsxux/School-Queue-Tracker-AU-South.git
cd School-Queue-Tracker-AU-South
```

### 2. Configure environment

Create a local environment file from the example:

```powershell
Copy-Item .env.example .env
```

The defaults connect to a MongoDB server on this computer:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/school_queue_tracker
MONGODB_DB=school_queue_tracker
HOST=127.0.0.1
PORT=3000
APP_URL=http://127.0.0.1:3000
```

Make sure MongoDB is running before starting the app. For MongoDB Atlas, set `MONGODB_URI` in `.env` to your connection string.

Admin registration requires email activation. To register an account, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` in `.env`. Password reset emails use the same settings. Keep `.env` private; do not commit it to GitHub.

### 3. Install dependencies and start

Run these commands from the repository folder:

```powershell
npm ci
npm run start
```

The start command builds the frontend and launches the Express backend. Keep the terminal open while using the app. Visit [http://127.0.0.1:3000](http://127.0.0.1:3000) on the computer running the app. Press **Ctrl+C** in the terminal to stop it.

If you use `npm install` instead of `npm ci`, start the app with `npm start`; both start commands run the same script.

### Use from a phone on the same Wi-Fi (optional)

The default `HOST=127.0.0.1` only accepts connections from the computer running the app. For temporary local-network testing, change it to `HOST=0.0.0.0` in `.env`, restart the app, then open `http://<computer-LAN-IP>:3000` on the computer and phone. Find the computer's LAN IP with `ipconfig` on Windows. Reopen the customer display from that address so its QR code uses the LAN address. Windows Firewall may ask you to allow Node.js on a private network. Do not expose the development server or MongoDB directly to the public internet.

## User guide

There are two user roles: **Admin** manages queues; **Customer** checks a ticket.

### Admin

1. Open the app and select **Register here**. Complete registration and activate the account using the link sent by email. If no account exists yet, SMTP must be configured for activation email.
2. Sign in with the administrator ID and password.
3. Select **Start Queue**, choose a service (Cashier or Registrar) and an available window, then start the queue.
4. In **My Queue**, select **Start the Queue** to call the first ticket. Use **Served** or **No Show** to record the current ticket and call the next one.
5. Select **Share** to open the customer display or share the queue join code with another administrator. A joined administrator selects a service and an available window; occupied windows cannot be selected.
6. Use **Jump to number** to call a specific whole ticket number. Only the queue owner can jump. After a jump, the queue continues from the following number; already completed numbers and numbers active at another window are skipped. Use **Restart queue** to clear the waiting line and restart numbering.
7. Use **Dashboard** to review completed-service totals and charts. Use **Profile** to update account details, and **Logout** to end the session.

### Customer

1. Get a ticket number from the service desk.
2. Scan the QR code on the customer display, or click the QR code when viewing the app in a browser.
3. On the customer page, choose the ticket's service type and enter the ticket number. Select **Confirm**.
4. The ticket page shows the customer's number, the current number being served, and the estimated wait. Keep or bookmark the page to check updates.
5. A ticket already completed in that queue cannot be submitted again by a customer. Contact the service desk if the ticket details are incorrect.

## Data and privacy

MongoDB stores accounts and queue data and is the source of truth when the app loads. The default local database is `school_queue_tracker`. The server creates its application collections on startup. Do not store secrets in the repository; `.env` and generated frontend build files are ignored by Git.
