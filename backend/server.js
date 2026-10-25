"use strict";

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const express = require("express");
const { createHash, randomBytes } = require("node:crypto");
const { MongoClient } = require("mongodb");
const nodemailer = require("nodemailer");

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/school_queue_tracker";
const databaseName = process.env.MONGODB_DB || "school_queue_tracker";
const client = new MongoClient(mongoUri);
const ADMIN_PRESENCE_TIMEOUT_MS = 90 * 1000;

function hashOneTimeToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function createMailTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    const error = new Error("Email delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM in .env.");
    error.statusCode = 503;
    throw error;
  }
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: smtpPort,
    secure: process.env.SMTP_SECURE === "true" || smtpPort === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

function getActivationLink(token) {
  const appUrl = process.env.APP_URL || `http://${host}:${port}`;
  const activationUrl = new URL("/activate", appUrl);
  activationUrl.searchParams.set("token", token);
  return activationUrl.toString();
}

function getPasswordResetLink(token) {
  const appUrl = process.env.APP_URL || `http://${host}:${port}`;
  const resetUrl = new URL("/reset-password", appUrl);
  resetUrl.searchParams.set("token", token);
  return resetUrl.toString();
}

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (request, response, next) => {
  try {
    await client.db(databaseName).command({ ping: 1 });
    response.json({ status: "ok", database: databaseName });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin-presence", async (request, response, next) => {
  try {
    const adminId = String(request.body?.adminId || "").trim();
    if (!adminId || adminId.length > 128) {
      response.status(400).json({ error: "A valid administrator ID is required." });
      return;
    }
    await client.db(databaseName).collection("admin_presence").updateOne(
      { _id: adminId.toLowerCase() },
      { $set: { adminId, lastSeen: new Date() } },
      { upsert: true }
    );
    response.json({ saved: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin-presence", async (request, response, next) => {
  try {
    const adminId = String(request.query.adminId || "").trim();
    if (!adminId || adminId.length > 128) {
      response.status(400).json({ error: "A valid administrator ID is required." });
      return;
    }
    const presence = await client.db(databaseName).collection("admin_presence").findOne({
      _id: adminId.toLowerCase()
    });
    response.json({
      active: Boolean(presence?.lastSeen && Date.now() - presence.lastSeen.getTime() <= ADMIN_PRESENCE_TIMEOUT_MS)
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin-presence", async (request, response, next) => {
  try {
    const adminId = String(request.query.adminId || "").trim();
    if (!adminId || adminId.length > 128) {
      response.status(400).json({ error: "A valid administrator ID is required." });
      return;
    }
    await client.db(databaseName).collection("admin_presence").deleteOne({
      _id: adminId.toLowerCase()
    });
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/queue-exit", async (request, response, next) => {
  try {
    const queueId = String(request.body?.queueId || "").trim();
    const ownerId = String(request.body?.ownerId || "").trim();
    if (!queueId || queueId.length > 128 || !ownerId || ownerId.length > 128) {
      response.status(400).json({ error: "A valid queue ID and administrator ID are required." });
      return;
    }
    const database = client.db(databaseName);
    const queueState = await database.collection("queue_state").findOne({
      _id: "primary",
      "value.activeQueues": { $elemMatch: { id: queueId, ownerId } }
    });
    if (!queueState) {
      response.status(404).json({ error: "This queue is no longer active." });
      return;
    }

    const queue = queueState.value.activeQueues.find((item) =>
      item.id === queueId && item.ownerId === ownerId
    );
    const group = queueState.value.groups.find((item) => item.id === queue.groupId);
    const isOwner = group?.ownerQueueId === queue.id;
    const queueFilter = isOwner
      ? {
        $and: [
          { $ne: ["$$queue.id", queueId] },
          { $ne: ["$$queue.groupId", queue.groupId] },
          { $ne: ["$$queue.parentQueueId", queueId] },
          { $ne: ["$$queue.displayParentQueueId", queueId] }
        ]
      }
      : { $ne: ["$$queue.id", queueId] };
    const remainingQueues = {
      $filter: {
        input: { $ifNull: ["$value.activeQueues", []] },
        as: "queue",
        cond: queueFilter
      }
    };
    const result = await database.collection("queue_state").updateOne(
      {
        _id: "primary",
        updatedAt: queueState.updatedAt,
        "value.activeQueues": { $elemMatch: { id: queueId, ownerId } }
      },
      [{
        $set: {
          value: {
            $let: {
              vars: { remainingQueues },
              in: {
                $mergeObjects: [
                  "$value",
                  {
                    activeQueues: "$$remainingQueues",
                    groups: {
                      $filter: {
                        input: { $ifNull: ["$value.groups", []] },
                        as: "group",
                        cond: {
                          $or: [
                            {
                              $in: [
                                "$$group.ownerQueueId",
                                { $map: { input: "$$remainingQueues", as: "queue", in: "$$queue.id" } }
                              ]
                            },
                            {
                              $in: [
                                "$$group.id",
                                { $map: { input: "$$remainingQueues", as: "queue", in: "$$queue.groupId" } }
                              ]
                            }
                          ]
                        }
                      }
                    }
                  }
                ]
              }
            }
          },
          updatedAt: "$$NOW"
        }
      }]
    );
    if (result.modifiedCount !== 1) {
      response.status(409).json({ error: "Queue data changed while exiting. Refresh and try again." });
      return;
    }
    const updatedQueueState = await database.collection("queue_state").findOne({ _id: "primary" });
    response.json({
      exited: true,
      queueData: updatedQueueState.value,
      updatedAt: updatedQueueState.updatedAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", async (request, response, next) => {
  try {
    const database = client.db(databaseName);
    const [accountDocs, queueState, pendingAccount] = await Promise.all([
      database.collection("accounts").find({}).toArray(),
      database.collection("queue_state").findOne({ _id: "primary" }),
      database.collection("pending_accounts").findOne({ _id: "pending" })
    ]);
    response.json({
      accounts: accountDocs.map(({ _id, ...account }) => account),
      queueData: queueState?.value || null,
      queueUpdatedAt: queueState?.updatedAt?.toISOString() || "",
      pendingAccount: pendingAccount?.value || null
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/queue-state", async (request, response, next) => {
  try {
    const queueState = await client.db(databaseName).collection("queue_state").findOne({ _id: "primary" });
    response.json({
      queueData: queueState?.value || null,
      updatedAt: queueState?.updatedAt?.toISOString() || ""
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/register", async (request, response, next) => {
  try {
    const account = Object.fromEntries(["id", "firstName", "middleName", "lastName", "email"]
      .map((field) => [field, String(request.body?.[field] || "").trim()]));
    if (!account.id || !account.firstName || !account.lastName ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) {
      response.status(400).json({ error: "Enter an administrator ID, first and last name, and a valid email address." });
      return;
    }

    const database = client.db(databaseName);
    const accounts = database.collection("accounts");
    const escapedId = account.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const activeAccount = await accounts.findOne({
      _id: { $regex: `^${escapedId}$`, $options: "i" },
      passwordHash: { $exists: true }
    });
    if (activeAccount) {
      response.status(409).json({ error: "An activated account already uses this administrator ID." });
      return;
    }

    const activationTokens = database.collection("activation_tokens");
    const now = Date.now();
    const recentActivation = await activationTokens.findOne({
      adminIdLower: account.id.toLowerCase(),
      createdAt: { $gt: new Date(now - 30 * 1000) }
    }, { sort: { createdAt: -1 } });
    if (recentActivation) {
      const retryAfterSeconds = Math.max(1, Math.ceil(
        (recentActivation.createdAt.getTime() + 30 * 1000 - now) / 1000
      ));
      response.status(429).json({
        error: `Please wait ${retryAfterSeconds} seconds before requesting another activation email.`,
        retryAfterSeconds
      });
      return;
    }

    const mailTransport = createMailTransport();
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashOneTimeToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await activationTokens.insertOne({
      _id: tokenHash,
      adminIdLower: account.id.toLowerCase(),
      account,
      expiresAt,
      createdAt: new Date()
    });
    try {
      const activationLink = getActivationLink(rawToken);
      const fullName = [account.firstName, account.middleName, account.lastName].filter(Boolean).join(" ");
      await mailTransport.sendMail({
        from: process.env.EMAIL_FROM,
        to: account.email,
        subject: "Activate your School Queue Tracker admin account",
        text: `Hello ${fullName},\n\nUse this one-time link to activate your administrator account and set your password:\n${activationLink}\n\nThis link expires in 24 hours. If you did not request this account, you can ignore this email.`
      });
    } catch (error) {
      await activationTokens.deleteOne({ _id: tokenHash });
      console.error("Activation email delivery failed:", error.message);
      response.status(502).json({ error: "The activation email could not be sent. Check your SMTP settings and try again." });
      return;
    }
    response.status(202).json({ sent: true });
  } catch (error) {
    if (error.statusCode) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.get("/api/activation-details", async (request, response, next) => {
  try {
    const token = String(request.query.token || "");
    const activation = token
      ? await client.db(databaseName).collection("activation_tokens").findOne({
        _id: hashOneTimeToken(token),
        expiresAt: { $gt: new Date() }
      })
      : null;
    if (!activation) {
      response.status(410).json({ error: "This activation link is invalid or has expired. Register again to get a new link." });
      return;
    }
    const { id, firstName, middleName, lastName } = activation.account;
    response.json({ id, firstName, middleName, lastName });
  } catch (error) {
    next(error);
  }
});

app.post("/api/activate", async (request, response, next) => {
  try {
    const token = String(request.body?.token || "");
    const password = String(request.body?.password || "");
    if (password.length < 8) {
      response.status(400).json({ error: "Use a password with at least 8 characters." });
      return;
    }
    const database = client.db(databaseName);
    const activationTokens = database.collection("activation_tokens");
    const activation = token
      ? await activationTokens.findOne({ _id: hashOneTimeToken(token), expiresAt: { $gt: new Date() } })
      : null;
    if (!activation) {
      response.status(410).json({ error: "This activation link is invalid or has expired. Register again to get a new link." });
      return;
    }
    const account = {
      ...activation.account,
      passwordHash: createHash("sha256").update(password, "utf8").digest("hex")
    };
    await database.collection("accounts").replaceOne(
      { _id: account.id },
      { ...account, _id: account.id },
      { upsert: true }
    );
    await activationTokens.deleteMany({ adminIdLower: activation.adminIdLower });
    response.json({ activated: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/password-reset-request", async (request, response, next) => {
  const genericResponse = {
    message: "If the administrator ID and email match an active account, a password reset link will be sent."
  };

  try {
    const id = String(request.body?.id || "").trim();
    const email = String(request.body?.email || "").trim().toLowerCase();
    if (!id || !email || id.length > 128 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      response.status(400).json({ error: "Enter a valid administrator ID and email address." });
      return;
    }

    const database = client.db(databaseName);
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const account = await database.collection("accounts").findOne({
      _id: { $regex: `^${escapedId}$`, $options: "i" },
      passwordHash: { $exists: true }
    });
    if (!account || String(account.email || "").trim().toLowerCase() !== email) {
      response.status(202).json(genericResponse);
      return;
    }

    const resetTokens = database.collection("password_reset_tokens");
    const now = Date.now();
    const recentReset = await resetTokens.findOne({
      adminIdLower: account.id.toLowerCase(),
      createdAt: { $gt: new Date(now - 30 * 1000) }
    }, { sort: { createdAt: -1 } });
    if (recentReset) {
      response.status(202).json(genericResponse);
      return;
    }

    const mailTransport = createMailTransport();
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashOneTimeToken(rawToken);
    await resetTokens.insertOne({
      _id: tokenHash,
      adminIdLower: account.id.toLowerCase(),
      accountId: account.id,
      expiresAt: new Date(now + 30 * 60 * 1000),
      createdAt: new Date(now)
    });

    try {
      const fullName = [account.firstName, account.middleName, account.lastName].filter(Boolean).join(" ");
      await mailTransport.sendMail({
        from: process.env.EMAIL_FROM,
        to: account.email,
        subject: "Reset your School Queue Tracker password",
        text: `Hello ${fullName},\n\nUse this one-time link to reset your administrator password:\n${getPasswordResetLink(rawToken)}\n\nThis link expires in 30 minutes. If you did not request a password reset, you can ignore this email.`
      });
    } catch (error) {
      await resetTokens.deleteOne({ _id: tokenHash });
      console.error("Password reset email delivery failed:", error.message);
      response.status(502).json({ error: "The reset email could not be sent. Check the email service settings and try again." });
      return;
    }

    response.status(202).json(genericResponse);
  } catch (error) {
    if (error.statusCode) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.get("/api/password-reset-details", async (request, response, next) => {
  try {
    const token = String(request.query.token || "");
    const resetToken = token
      ? await client.db(databaseName).collection("password_reset_tokens").findOne({
        _id: hashOneTimeToken(token),
        expiresAt: { $gt: new Date() },
        consumedAt: { $exists: false }
      })
      : null;
    if (!resetToken) {
      response.status(410).json({ error: "This password reset link is invalid or has expired. Request a new link and try again." });
      return;
    }
    response.json({ id: resetToken.accountId });
  } catch (error) {
    next(error);
  }
});

app.post("/api/password-reset", async (request, response, next) => {
  try {
    const token = String(request.body?.token || "");
    const password = String(request.body?.password || "");
    if (password.length < 8) {
      response.status(400).json({ error: "Use a password with at least 8 characters." });
      return;
    }
    const database = client.db(databaseName);
    const resetToken = token
      ? await database.collection("password_reset_tokens").findOneAndUpdate(
        {
          _id: hashOneTimeToken(token),
          expiresAt: { $gt: new Date() },
          consumedAt: { $exists: false }
        },
        { $set: { consumedAt: new Date() } },
        { returnDocument: "before" }
      )
      : null;
    if (!resetToken) {
      response.status(410).json({ error: "This password reset link is invalid or has expired. Request a new link and try again." });
      return;
    }

    const result = await database.collection("accounts").updateOne(
      { _id: resetToken.accountId, passwordHash: { $exists: true } },
      { $set: { passwordHash: createHash("sha256").update(password, "utf8").digest("hex") } }
    );
    if (!result.matchedCount) {
      response.status(410).json({ error: "This administrator account is no longer available. Contact your system administrator." });
      return;
    }
    await database.collection("password_reset_tokens").updateMany(
      { adminIdLower: resetToken.adminIdLower, consumedAt: { $exists: false } },
      { $set: { consumedAt: new Date() } }
    );
    response.json({ reset: true });
  } catch (error) {
    next(error);
  }
});

app.put("/api/accounts", async (request, response, next) => {
  try {
    const accounts = request.body?.accounts;
    if (!Array.isArray(accounts) || accounts.some((account) =>
      !account || typeof account.id !== "string" || !account.id.trim()
    )) {
      response.status(400).json({ error: "Accounts must be an array with an ID for every account." });
      return;
    }
    const ids = accounts.map((account) => account.id);
    if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
      response.status(400).json({ error: "Account IDs must be unique." });
      return;
    }
    const collection = client.db(databaseName).collection("accounts");
    if (accounts.length) {
      await collection.bulkWrite(accounts.map((account) => ({
        replaceOne: {
          filter: { _id: account.id },
          replacement: { ...account, _id: account.id },
          upsert: true
        }
      })));
      await collection.deleteMany({ _id: { $nin: ids } });
    } else {
      await collection.deleteMany({});
    }
    response.json({ saved: accounts.length });
  } catch (error) {
    next(error);
  }
});

app.put("/api/queue-state", async (request, response, next) => {
  try {
    const queueData = request.body?.queueData;
    if (!queueData || typeof queueData !== "object" || Array.isArray(queueData)) {
      response.status(400).json({ error: "Queue data must be an object." });
      return;
    }
    const collection = client.db(databaseName).collection("queue_state");
    const expectedUpdatedAt = request.body?.expectedUpdatedAt;
    const current = await collection.findOne({ _id: "primary" });
    if (!current) {
      if (expectedUpdatedAt != null && expectedUpdatedAt !== "") {
        response.status(409).json({ error: "Queue data changed in another window. Refresh and retry." });
        return;
      }
      const updatedAt = new Date();
      try {
        await collection.insertOne({ _id: "primary", value: queueData, updatedAt });
      } catch (error) {
        if (error.code === 11000) {
          response.status(409).json({ error: "Queue data changed in another window. Refresh and retry." });
          return;
        }
        throw error;
      }
      response.json({ saved: true, updatedAt: updatedAt.toISOString() });
      return;
    }

    const currentUpdatedAt = current.updatedAt instanceof Date
      ? current.updatedAt.toISOString()
      : null;
    if (expectedUpdatedAt !== currentUpdatedAt) {
      response.status(409).json({ error: "Queue data changed in another window. Refresh and retry." });
      return;
    }
    const previousUpdateTime = current.updatedAt instanceof Date ? current.updatedAt.getTime() : 0;
    const updatedAt = new Date(Math.max(Date.now(), previousUpdateTime + 1));
    const versionFilter = current.updatedAt instanceof Date
      ? { _id: "primary", updatedAt: current.updatedAt }
      : { _id: "primary", updatedAt: { $exists: false } };
    const result = await collection.updateOne(versionFilter, { $set: { value: queueData, updatedAt } });
    if (result.modifiedCount !== 1) {
      response.status(409).json({ error: "Queue data changed in another window. Refresh and retry." });
      return;
    }
    response.json({ saved: true, updatedAt: updatedAt.toISOString() });
  } catch (error) {
    next(error);
  }
});

app.put("/api/pending-account", async (request, response, next) => {
  try {
    const account = request.body?.pendingAccount;
    if (!account || typeof account !== "object" || Array.isArray(account) || typeof account.id !== "string") {
      response.status(400).json({ error: "A pending account with an ID is required." });
      return;
    }
    await client.db(databaseName).collection("pending_accounts").replaceOne(
      { _id: "pending" },
      { _id: "pending", value: account, updatedAt: new Date() },
      { upsert: true }
    );
    response.json({ saved: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/pending-account", async (request, response, next) => {
  try {
    await client.db(databaseName).collection("pending_accounts").deleteOne({ _id: "pending" });
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

const frontendBuildPath = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendBuildPath, { dotfiles: "ignore" }));

app.get(/^\/(?!api\/).*/, (request, response, next) => {
  response.sendFile(path.join(frontendBuildPath, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, request, response, next) => {
  console.error(error);
  if (response.headersSent) return next(error);
  response.status(500).json({ error: "The request could not be completed." });
});

async function startServer() {
  await client.connect();
  const database = client.db(databaseName);
  const existingCollections = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map((collection) => collection.name)
  );
  for (const collectionName of ["accounts", "queue_state", "pending_accounts", "activation_tokens", "password_reset_tokens", "admin_presence"]) {
    if (!existingCollections.has(collectionName)) {
      await database.createCollection(collectionName);
    }
  }
  await database.collection("activation_tokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection("password_reset_tokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  app.listen(port, host, () => {
    console.log(`School Queue Tracker running at http://${host}:${port}`);
    console.log(`MongoDB database: ${databaseName}`);
  });
}

startServer().catch((error) => {
  console.error("Could not connect to MongoDB. Check that MongoDB is running and MONGODB_URI is correct.");
  console.error(error.message);
  process.exitCode = 1;
});
