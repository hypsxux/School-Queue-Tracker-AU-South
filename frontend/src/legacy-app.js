"use strict";

const ACCOUNTS_KEY = "schoolQueueTracker.adminAccounts";
const PENDING_KEY = "schoolQueueTracker.pendingAdmin";
const QUEUE_DATA_KEY = "schoolQueueTracker.queueData";
const SESSION_KEY = "schoolQueueTracker.adminSession";
const SESSION_STARTED_KEY = "schoolQueueTracker.adminSessionStartedAt";
const SESSION_TIMEOUT_MS = 5 * 60 * 60 * 1000;
const ADMIN_PRESENCE_INTERVAL_MS = 20 * 1000;
const DEMO_ADMIN_ID = "ADMIN001";
const DEMO_WINDOW_ADMIN_ID = "ADMIN002";
const REMEMBERED_ADMIN_KEY = "schoolQueueTracker.rememberedAdmin";
const DISPLAY_SESSION_PREFIX = "schoolQueueTracker.displaySession.";
const DISPLAY_CLOSE_KEY = "schoolQueueTracker.closeDisplays";
let mongoWriteQueue = Promise.resolve();
let lastQueueWriteAt = 0;
let lastMongoQueueUpdate = "";
let lastMongoQueueData = "";
let queueRefreshInProgress = false;
let adminSessionInterval;
let adminSessionAdminId = "";
let adminSessionEnding = false;
let adminPresenceHeartbeat = Promise.resolve();
let adminPresenceHeartbeatInProgress = false;
let myQueueExitContext = null;

async function mongoRequest(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    keepalive: method !== "GET"
  });
  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    result = null;
  }
  if (!response.ok) {
    const error = new Error(result?.error || `MongoDB API request to ${response.url} failed (${response.status}).`);
    error.status = response.status;
    error.details = result;
    throw error;
  }
  return result;
}

function queueValuesEqual(left, right) {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function queueArrayKey(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.id === "string") return `id:${value.id}`;
  if (typeof value.number === "string" || typeof value.number === "number") return `number:${value.number}`;
  if (typeof value.ticketId === "string") return `ticketId:${value.ticketId}`;
  return null;
}

function mergeQueueValue(base, local, remote, path = []) {
  if (queueValuesEqual(local, base)) return remote;
  if (queueValuesEqual(remote, base) || queueValuesEqual(local, remote)) return local;

  if (local && remote && typeof local === "object" && typeof remote === "object" &&
      !Array.isArray(local) && !Array.isArray(remote) &&
      (!base || (typeof base === "object" && !Array.isArray(base)))) {
    const merged = {};
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)]);
    keys.forEach((key) => {
      const value = mergeQueueValue(base?.[key], local[key], remote[key], [...path, key]);
      if (value !== undefined) merged[key] = value;
    });
    return merged;
  }

  if (Array.isArray(local) && Array.isArray(remote) && (base === undefined || Array.isArray(base))) {
    const allItems = [...(base || []), ...local, ...remote];
    if (allItems.every((item) => queueArrayKey(item) !== null)) {
      const baseItems = new Map((base || []).map((item) => [queueArrayKey(item), item]));
      const localItems = new Map(local.map((item) => [queueArrayKey(item), item]));
      const remoteItems = new Map(remote.map((item) => [queueArrayKey(item), item]));
      const keys = [...remoteItems.keys(), ...[...localItems.keys()].filter((key) => !remoteItems.has(key))];
      const merged = [];
      keys.forEach((key) => {
        const item = mergeQueueValue(baseItems.get(key), localItems.get(key), remoteItems.get(key), [...path, key]);
        if (item !== undefined) merged.push(item);
      });
      return merged;
    }
  }

  return remote;
}

function replaceQueueData(target, source) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, source);
}

function persistMongoWrite(url, method, body, propagateError = false, queueWriteBase = null, queueWriteTarget = null) {
  const request = mongoWriteQueue.then(async () => {
    const requestBody = url === "/api/queue-state" && method === "PUT"
      ? { ...body, expectedUpdatedAt: lastMongoQueueUpdate || null }
      : body;
    try {
      return await mongoRequest(url, method, requestBody);
    } catch (error) {
      if (url !== "/api/queue-state" || method !== "PUT" || error.status !== 409) throw error;

      const saved = await mongoRequest("/api/bootstrap");
      if (!saved.queueData) throw error;
      const remoteQueueData = saved.queueData;
      const mergedQueueData = mergeQueueValue(queueWriteBase, body.queueData, remoteQueueData);
      localStorage.setItem(QUEUE_DATA_KEY, JSON.stringify(mergedQueueData));
      if (queueWriteTarget) replaceQueueData(queueWriteTarget, mergedQueueData);
      lastMongoQueueUpdate = saved.queueUpdatedAt || "";
      lastMongoQueueData = JSON.stringify(remoteQueueData);

      return mongoRequest("/api/queue-state", "PUT", {
        queueData: mergedQueueData,
        expectedUpdatedAt: saved.queueUpdatedAt || null
      });
    }
  }).then((result) => {
    if (url === "/api/queue-state") {
      lastMongoQueueUpdate = result.updatedAt || "";
      lastMongoQueueData = JSON.stringify(body.queueData);
    }
    return result;
  });
  mongoWriteQueue = request.catch((error) => {
    console.error(error);
    const message = document.querySelector(".form-message");
    if (message) showMessage(message, error.status === 409
      ? `${error.message} The latest queue state will be refreshed automatically.`
      : `MongoDB save failed: ${error.message}`, false);
  });
  return propagateError ? request : mongoWriteQueue;
}

async function hydrateMongoStorage() {
  const saved = await mongoRequest("/api/bootstrap");
  lastMongoQueueUpdate = saved.queueUpdatedAt || "";
  lastMongoQueueData = JSON.stringify(saved.queueData || null);
  const demoAccountIds = new Set([DEMO_ADMIN_ID.toLowerCase(), DEMO_WINDOW_ADMIN_ID.toLowerCase()]);
  const savedAccounts = saved.accounts.filter((account) => !demoAccountIds.has(account.id.toLowerCase()));
  const sessionAdminId = sessionStorage.getItem(SESSION_KEY);
  if (sessionAdminId && !savedAccounts.some((account) => account.id.toLowerCase() === sessionAdminId.toLowerCase())) {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_STARTED_KEY);
  }

  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(savedAccounts));
  if (savedAccounts.length !== saved.accounts.length) {
    await mongoRequest("/api/accounts", "PUT", { accounts: savedAccounts });
  }
  if (saved.queueData) {
    localStorage.setItem(QUEUE_DATA_KEY, JSON.stringify(saved.queueData));
  } else {
    localStorage.removeItem(QUEUE_DATA_KEY);
  }
  if (saved.pendingAccount) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(saved.pendingAccount));
  } else {
    localStorage.removeItem(PENDING_KEY);
  }
}

async function refreshQueueDataFromMongo(force = false) {
  if (queueRefreshInProgress || (!force && Date.now() - lastQueueWriteAt < 1500)) return false;
  queueRefreshInProgress = true;
  try {
    const saved = await mongoRequest("/api/bootstrap");
    const queueDataSnapshot = JSON.stringify(saved.queueData || null);
    const queueChanged = saved.queueUpdatedAt
      ? saved.queueUpdatedAt !== lastMongoQueueUpdate
      : queueDataSnapshot !== lastMongoQueueData;
    if (!saved.queueData) {
      const hadLocalQueueData = localStorage.getItem(QUEUE_DATA_KEY) !== null;
      localStorage.removeItem(QUEUE_DATA_KEY);
      lastMongoQueueUpdate = "";
      lastMongoQueueData = queueDataSnapshot;
      return hadLocalQueueData || queueChanged;
    }
    if (!queueChanged) return false;
    lastMongoQueueUpdate = saved.queueUpdatedAt || "";
    lastMongoQueueData = queueDataSnapshot;
    localStorage.setItem(QUEUE_DATA_KEY, JSON.stringify(saved.queueData));
    return true;
  } finally {
    queueRefreshInProgress = false;
  }
}

function getQueueOwnerQueue(data, queue) {
  const displayOwner = queue.displayParentQueueId && getQueueById(data, queue.displayParentQueueId);
  if (displayOwner) return displayOwner;
  const parent = queue.parentQueueId && getQueueById(data, queue.parentQueueId);
  if (parent) return parent;
  const groupOwner = getRootQueue(data, queue);
  return groupOwner && groupOwner.id !== queue.id ? groupOwner : null;
}

function removeQueueAndOrphanedGroup(data, queueId) {
  const queue = getQueueById(data, queueId);
  if (!queue) return false;
  data.activeQueues = data.activeQueues.filter((item) => item.id !== queueId);
  const activeQueueIds = new Set(data.activeQueues.map((item) => item.id));
  const activeGroupIds = new Set(data.activeQueues.map((item) => item.groupId));
  data.groups = data.groups.filter((group) =>
    activeQueueIds.has(group.ownerQueueId) || activeGroupIds.has(group.id)
  );
  return true;
}

function countJoinedQueuesForOwner(data, adminId) {
  const ownQueueIds = new Set(
    data.activeQueues.filter((queue) => queue.ownerId === adminId).map((queue) => queue.id)
  );
  const ownGroupIds = new Set(data.groups
    .filter((group) => group.ownerId === adminId && ownQueueIds.has(group.ownerQueueId))
    .map((group) => group.id));
  return data.activeQueues.filter((queue) =>
    queue.ownerId !== adminId &&
    (ownGroupIds.has(queue.groupId) ||
      ownQueueIds.has(queue.parentQueueId) ||
      ownQueueIds.has(queue.displayParentQueueId))
  ).length;
}

function closeJoinedQueuesForOwner(data, adminId) {
  const ownQueueIds = new Set(
    data.activeQueues.filter((queue) => queue.ownerId === adminId).map((queue) => queue.id)
  );
  const ownGroupIds = new Set(data.groups
    .filter((group) => group.ownerId === adminId && ownQueueIds.has(group.ownerQueueId))
    .map((group) => group.id));
  let changed = false;
  data.activeQueues.forEach((queue) => {
    if (queue.ownerId === adminId && ownGroupIds.has(queue.groupId) && queue.allowMembers) {
      queue.allowMembers = false;
      changed = true;
    }
  });
  const joinedQueueIds = data.activeQueues
    .filter((queue) =>
      queue.ownerId !== adminId &&
      (ownGroupIds.has(queue.groupId) ||
        ownQueueIds.has(queue.parentQueueId) ||
        ownQueueIds.has(queue.displayParentQueueId))
    )
    .map((queue) => queue.id);
  joinedQueueIds.forEach((queueId) => {
    changed = removeQueueAndOrphanedGroup(data, queueId) || changed;
  });
  return { changed, removedCount: joinedQueueIds.length };
}

async function heartbeatAdminPresence(adminId) {
  if (adminPresenceHeartbeatInProgress) return adminPresenceHeartbeat;
  adminPresenceHeartbeatInProgress = true;
  adminPresenceHeartbeat = mongoRequest("/api/admin-presence", "PUT", { adminId })
    .finally(() => {
      adminPresenceHeartbeatInProgress = false;
    });
  return adminPresenceHeartbeat;
}

async function enforceJoinedQueueLifecycle(adminId) {
  await refreshQueueDataFromMongo(true);
  const data = readQueueData();
  if (!data || !Array.isArray(data.activeQueues)) return;
  const linkedQueues = data.activeQueues
    .filter((queue) => {
      if (queue.ownerId === adminId) return false;
      const groupOwner = getRootQueue(data, queue);
      return Boolean(queue.parentQueueId || queue.displayParentQueueId ||
        (groupOwner && groupOwner.id !== queue.id));
    })
    .map((queue) => ({ queue, owner: getQueueOwnerQueue(data, queue) }));
  const ownerIds = [...new Set(linkedQueues.map(({ owner }) => owner?.ownerId).filter(Boolean))];
  if (!ownerIds.length) return;
  const presenceResults = await Promise.all(ownerIds.map(async (ownerId) => {
    const result = await mongoRequest(`/api/admin-presence?adminId=${encodeURIComponent(ownerId)}`);
    return [ownerId, result.active];
  }));
  const ownerIsActive = new Map(presenceResults);
  const removedQueueIds = linkedQueues
    .filter(({ owner }) => !owner || !ownerIsActive.get(owner.ownerId))
    .map(({ queue }) => queue.id);
  if (!removedQueueIds.length) return;
  removedQueueIds.forEach((queueId) => removeQueueAndOrphanedGroup(data, queueId));
  await writeQueueData(data, true);
  removedQueueIds.forEach((queueId) => {
    window.dispatchEvent(new CustomEvent("queue-closed-by-owner", { detail: { queueId } }));
  });
}

function clearAdminSessionLocally() {
  window.clearInterval(adminSessionInterval);
  adminSessionInterval = undefined;
  adminSessionAdminId = "";
  adminSessionEnding = true;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_STARTED_KEY);
  localStorage.removeItem(REMEMBERED_ADMIN_KEY);
}

async function endAdminSession(adminId) {
  if (adminSessionEnding) return;
  adminSessionEnding = true;
  window.clearInterval(adminSessionInterval);
  try {
    const data = readQueueData();
    if (data) {
      const { changed } = closeJoinedQueuesForOwner(data, adminId);
      if (changed) await writeQueueData(data, true);
    }
    await closeActiveDisplays(adminId);
    await adminPresenceHeartbeat;
    await mongoRequest(`/api/admin-presence?adminId=${encodeURIComponent(adminId)}`, "DELETE");
  } finally {
    clearAdminSessionLocally();
    window.location.href = "/";
  }
}

async function removeQueueOnExit(queueId, ownerId) {
  await mongoWriteQueue;
  const result = await mongoRequest("/api/queue-exit", "POST", { queueId, ownerId });
  lastMongoQueueUpdate = result.updatedAt || "";
  lastMongoQueueData = JSON.stringify(result.queueData || null);
  if (result.queueData) {
    localStorage.setItem(QUEUE_DATA_KEY, JSON.stringify(result.queueData));
  } else {
    localStorage.removeItem(QUEUE_DATA_KEY);
  }
}

function startAdminSessionLifecycle(adminId) {
  if (adminSessionAdminId === adminId && adminSessionInterval) return;
  window.clearInterval(adminSessionInterval);
  adminSessionAdminId = adminId;
  adminSessionEnding = false;
  if (!Number.isFinite(Number(sessionStorage.getItem(SESSION_STARTED_KEY)))) {
    sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
  }
  const checkSession = async () => {
    if (getAdminId() !== adminId || adminSessionEnding) return;
    const sessionStartedAt = Number(sessionStorage.getItem(SESSION_STARTED_KEY));
    if (!Number.isFinite(sessionStartedAt) || Date.now() - sessionStartedAt >= SESSION_TIMEOUT_MS) {
      try {
        await endAdminSession(adminId);
      } catch (error) {
        console.error(`Could not finish the expired administrator session: ${error.message}`);
        clearAdminSessionLocally();
        window.location.href = "/";
      }
      return;
    }
    try {
      await heartbeatAdminPresence(adminId);
      await enforceJoinedQueueLifecycle(adminId);
    } catch (error) {
      console.error(`Could not check queue owner presence: ${error.message}`);
    }
  };
  checkSession();
  adminSessionInterval = window.setInterval(checkSession, ADMIN_PRESENCE_INTERVAL_MS);
}

function windowsForService(service) {
  return service === "Cashier" ? ["Window 1", "Window 2"]
    : service === "Registrar" ? ["Window 3", "Window 4"] : [];
}

function populateWindowOptions(select, service, occupiedWindows = []) {
  const previousValue = select.value;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = "Select a window";
  select.append(placeholder);
  windowsForService(service).forEach((windowName) => {
    const option = document.createElement("option");
    option.value = windowName;
    option.textContent = occupiedWindows.includes(windowName)
      ? `${windowName} (in use)` : windowName;
    option.disabled = occupiedWindows.includes(windowName);
    select.append(option);
  });
  if (windowsForService(service).includes(previousValue) &&
      !occupiedWindows.includes(previousValue)) {
    select.value = previousValue;
  }
}

function postLoginDestination() {
  const requested = new URLSearchParams(window.location.search).get("return") || "";
  if (/^\/queue-setup(?:\?join=[\w-]+)?$/.test(requested)) {
    return requested;
  }
  return "/dashboard";
}

function getAdminId() {
  const adminId = sessionStorage.getItem(SESSION_KEY);
  if ([DEMO_ADMIN_ID, DEMO_WINDOW_ADMIN_ID].some((demoId) =>
    demoId.toLowerCase() === String(adminId || "").toLowerCase()
  )) {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_STARTED_KEY);
    return null;
  }
  return adminId;
}

function setAdminId(adminId) {
  sessionStorage.setItem(SESSION_KEY, adminId);
  sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
  localStorage.removeItem(REMEMBERED_ADMIN_KEY);
}

function getActiveDisplaySessions(adminId) {
  const now = Date.now();
  const sessions = [];
  Object.keys(localStorage).filter((key) => key.startsWith(DISPLAY_SESSION_PREFIX)).forEach((key) => {
    try {
      const session = JSON.parse(localStorage.getItem(key));
      if (!session || now - session.updatedAt > 8000) {
        localStorage.removeItem(key);
      } else if (session.ownerId === adminId) {
        sessions.push(session);
      }
    } catch (error) {
      throw new Error("An active display session could not be checked. Close its display tab manually and try again.");
    }
  });
  return sessions;
}

async function closeActiveDisplays(adminId) {
  const closeRequest = { ownerId: adminId, requestedAt: Date.now(), nonce: createId() };
  localStorage.setItem(DISPLAY_CLOSE_KEY, JSON.stringify(closeRequest));
  await new Promise((resolve) => window.setTimeout(resolve, 500));
}

function showConfirmModal({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel" }) {
  const dialog = document.createElement("dialog");
  dialog.className = "outcome-dialog app-confirm-dialog";
  dialog.setAttribute("aria-labelledby", "app-confirm-title");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "PLEASE CONFIRM";
  const heading = document.createElement("h2");
  heading.id = "app-confirm-title";
  heading.textContent = title;
  const description = document.createElement("p");
  description.className = "queue-action-copy";
  description.textContent = message;
  const actions = document.createElement("div");
  actions.className = "outcome-buttons";
  const confirmButton = document.createElement("button");
  confirmButton.className = "button button-primary";
  confirmButton.type = "button";
  confirmButton.textContent = confirmLabel;
  const cancelButton = document.createElement("button");
  cancelButton.className = "button button-secondary";
  cancelButton.type = "button";
  cancelButton.textContent = cancelLabel;
  actions.append(confirmButton, cancelButton);
  dialog.append(eyebrow, heading, description, actions);
  document.body.append(dialog);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close(confirmed ? "confirm" : "cancel");
      dialog.remove();
      resolve(confirmed);
    };
    confirmButton.addEventListener("click", () => finish(true));
    cancelButton.addEventListener("click", () => finish(false));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.showModal();
  });
}

function readAccounts() {
  try {
    const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
    return Array.isArray(accounts) ? accounts : [];
  } catch (error) {
    throw new Error("Saved account data could not be read. Clear this site's local storage and try again.");
  }
}

function writeAccounts(accounts) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    return persistMongoWrite("/api/accounts", "PUT", { accounts });
  } catch (error) {
    throw new Error("Account data could not be saved in this browser. Check your browser storage settings.");
  }
}

function readQueueData() {
  try {
    const data = JSON.parse(localStorage.getItem(QUEUE_DATA_KEY) || "null");
    return data && typeof data === "object" ? data : null;
  } catch (error) {
    throw new Error("Queue data could not be read. Clear this site's local storage and try again.");
  }
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ticketNumber(number) {
  return `#${number}`;
}

function numericTicketPart(value) {
  const match = String(value || "").match(/(\d+)\s*$/);
  return match ? Number(match[1]) : 0;
}

function ensureQueueShape(data) {
  let changed = false;
  const currentAdminId = getAdminId() || DEMO_ADMIN_ID;
  if (!Array.isArray(data.activeQueues)) {
    data.activeQueues = [];
    changed = true;
  }
  if (!Array.isArray(data.groups)) {
    data.groups = [];
    changed = true;
  }
  if (!Array.isArray(data.history)) {
    data.history = [];
    changed = true;
  }
  data.activeQueues.forEach((queue) => {
    if (!queue.id) {
      queue.id = createId();
      changed = true;
    }
    if (!queue.ownerId) {
      queue.ownerId = currentAdminId;
      changed = true;
    }
    if (!queue.shareToken) {
      queue.shareToken = createId().replace(/-/g, "").slice(0, 16);
      changed = true;
    }
    if (!windowsForService(queue.service).includes(queue.window)) {
      queue.window = windowsForService(queue.service)[0] || "Window 1";
      queue.displayLabel = queue.window;
      changed = true;
    }
    if (typeof queue.allowMembers !== "boolean") {
      queue.allowMembers = true;
      changed = true;
    }
    if (typeof queue.displayEnabled !== "boolean") {
      queue.displayEnabled = true;
      changed = true;
    }
    if (!queue.displayLabel) {
      queue.displayLabel = queue.window;
      changed = true;
    }
    if (!Number.isFinite(queue.served)) {
      queue.served = 0;
      changed = true;
    }
    if (!Number.isFinite(queue.noShow)) {
      queue.noShow = 0;
      changed = true;
    }
    if (!Array.isArray(queue.completedTickets)) {
      queue.completedTickets = [];
      changed = true;
    }
    if (!Array.isArray(queue.tickets)) {
      const servingNumber = numericTicketPart(queue.nowServing);
      const waiting = Number.isFinite(queue.waiting) ? Math.max(0, queue.waiting) : 0;
      queue.tickets = Array.from({ length: waiting }, (_, index) => ({
        number: ticketNumber(servingNumber + index + 1),
        status: "waiting"
      }));
      changed = true;
    }
    if (!queue.groupId) {
      queue.groupId = queue.id;
      changed = true;
    }
    let group = data.groups.find((item) => item.id === queue.groupId);
    if (!group) {
      group = { id: queue.groupId, tickets: queue.tickets, completedTickets: queue.completedTickets };
      data.groups.push(group);
      changed = true;
    }
    if (!Array.isArray(group.tickets)) {
      group.tickets = queue.tickets;
      changed = true;
    }
    if (!Array.isArray(group.completedTickets)) {
      group.completedTickets = queue.completedTickets;
      changed = true;
    }
    if (!group.ownerQueueId) {
      group.ownerQueueId = queue.parentQueueId || queue.id;
      changed = true;
    }
    if (!Number.isFinite(group.nextNumber)) {
      const numbers = [
        numericTicketPart(queue.nowServing),
        ...group.tickets.map((ticket) => numericTicketPart(ticket.number)),
        ...group.completedTickets.map((ticket) => numericTicketPart(ticket.number))
      ];
      group.nextNumber = Math.max(0, ...numbers) + 1;
      changed = true;
    }
    if (queue.nowServing && /^([CR])-\d+$/i.test(queue.nowServing)) {
      queue.nowServing = `#${numericTicketPart(queue.nowServing)}`;
      changed = true;
    }
    group.tickets.forEach((ticket) => {
      if (/^[CR]-\d+$/i.test(ticket.number)) {
        ticket.number = `#${numericTicketPart(ticket.number)}`;
        changed = true;
      }
    });
    group.completedTickets.forEach((ticket) => {
      if (/^[CR]-\d+$/i.test(ticket.number)) {
        ticket.number = `#${numericTicketPart(ticket.number)}`;
        changed = true;
      }
    });
    const groupOwner = data.activeQueues.find((candidate) => candidate.id === group.ownerQueueId);
    if (!groupOwner) {
      group.ownerQueueId = queue.id;
      changed = true;
    }
    if (!groupOwner || groupOwner.id === queue.id) {
      group.ownerId = queue.ownerId;
    }
    queue.tickets = group.tickets;
    queue.completedTickets = group.completedTickets;
    if (queue.waiting !== group.tickets.length) {
      queue.waiting = group.tickets.length;
      changed = true;
    }
  });
  if (changed) {
    writeQueueData(data);
  }
  return data;
}

function writeQueueData(data, propagateError = false) {
  try {
    const queueWriteBase = lastMongoQueueData ? JSON.parse(lastMongoQueueData) : null;
    localStorage.setItem(QUEUE_DATA_KEY, JSON.stringify(data));
    lastQueueWriteAt = Date.now();
    return persistMongoWrite("/api/queue-state", "PUT", { queueData: data }, propagateError, queueWriteBase, data);
  } catch (error) {
    throw new Error("Queue data could not be saved in this browser. Check your browser storage settings.");
  }
}

function readPendingAccount() {
  try {
    const account = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    return account && typeof account === "object" ? account : null;
  } catch (error) {
    throw new Error("Pending account data could not be read. Please register again.");
  }
}

function writePendingAccount(account) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(account));
  return persistMongoWrite("/api/pending-account", "PUT", { pendingAccount: account });
}

function clearPendingAccount() {
  localStorage.removeItem(PENDING_KEY);
  return persistMongoWrite("/api/pending-account", "DELETE");
}

function showMessage(element, message, isSuccess) {
  element.textContent = message;
  element.classList.toggle("success", Boolean(isSuccess));
}

function markInvalid(input, invalid) {
  if (invalid) {
    input.setAttribute("aria-invalid", "true");
  } else {
    input.removeAttribute("aria-invalid");
  }
}

async function hashPassword(password) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("Secure password hashing is unavailable in this browser. Open the pages through a secure local web server.");
  }
  const bytes = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function initLogin() {
  const form = document.getElementById("login-form");
  const message = document.getElementById("login-message");
  const forgotPasswordForm = document.getElementById("forgot-password-form");
  const forgotPasswordMessage = document.getElementById("reset-request-message");
  const forgotPasswordButton = document.getElementById("show-forgot-password");
  const loginLinks = document.querySelectorAll(".form-switch");

  forgotPasswordButton.addEventListener("click", () => {
    form.hidden = true;
    forgotPasswordButton.hidden = true;
    forgotPasswordForm.hidden = false;
    loginLinks.forEach((link) => { link.hidden = true; });
    forgotPasswordForm.elements.id.focus();
  });

  document.getElementById("back-to-login").addEventListener("click", () => {
    forgotPasswordForm.hidden = true;
    form.hidden = false;
    forgotPasswordButton.hidden = false;
    loginLinks.forEach((link) => { link.hidden = false; });
    form.elements.id.focus();
  });

  forgotPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const idInput = forgotPasswordForm.elements.id;
    const emailInput = forgotPasswordForm.elements.email;
    const id = idInput.value.trim();
    const email = emailInput.value.trim();
    const invalidId = !id;
    const invalidEmail = !email || !emailInput.validity.valid;
    markInvalid(idInput, invalidId);
    markInvalid(emailInput, invalidEmail);
    if (invalidId || invalidEmail) {
      showMessage(forgotPasswordMessage, "Enter your administrator ID and a valid email address.", false);
      (invalidId ? idInput : emailInput).focus();
      return;
    }

    const submitButton = document.getElementById("reset-request-submit");
    submitButton.disabled = true;
    try {
      const result = await mongoRequest("/api/password-reset-request", "POST", { id, email });
      showMessage(forgotPasswordMessage, result.message, true);
    } catch (error) {
      showMessage(forgotPasswordMessage, error.message, false);
    } finally {
      submitButton.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const idInput = form.elements.id;
    const passwordInput = form.elements.password;
    const id = idInput.value.trim();
    const password = passwordInput.value;
    const invalidId = !id;
    const invalidPassword = !password;
    markInvalid(idInput, invalidId);
    markInvalid(passwordInput, invalidPassword);

    if (invalidId || invalidPassword) {
      showMessage(message, "Enter both your administrator ID and password.", false);
      (invalidId ? idInput : passwordInput).focus();
      return;
    }

    try {
      const accounts = readAccounts();
      const account = accounts.find((savedAccount) => savedAccount.id.toLowerCase() === id.toLowerCase());
      if (!account) {
        showMessage(message, "No activated account was found for that ID.", false);
        return;
      }
      const passwordHash = await hashPassword(password);
      if (passwordHash !== account.passwordHash) {
        showMessage(message, "The ID or password is incorrect.", false);
        return;
      }
      setAdminId(account.id);
      window.location.href = postLoginDestination();
    } catch (error) {
      showMessage(message, error.message, false);
    }
  });
}

function todayKey() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function getDemoQueueData() {
  const today = todayKey();
  const history = [];
  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() - offset);
    const dateKey = date.toISOString().slice(0, 10);
    history.push({
      date: dateKey,
      cashier: offset === 0 ? 48 : 32 + ((offset * 7) % 25),
      registrar: offset === 0 ? 35 : 21 + ((offset * 5) % 19)
    });
  }
  return {
    demoData: true,
    activeQueues: [
      { service: "Cashier", window: "Window 1", nowServing: "C-024", waiting: 7, invitationLink: "" },
      { service: "Registrar", window: "Window 3", nowServing: "R-018", waiting: 4, invitationLink: "" }
    ],
    history
  };
}

function ensureQueueData() {
  const adminId = getAdminId();
  const storedData = readQueueData();
  const data = storedData || ([DEMO_ADMIN_ID, DEMO_WINDOW_ADMIN_ID].includes(adminId)
    ? getDemoQueueData()
    : { demoData: false, activeQueues: [], groups: [], history: [] });
  ensureQueueShape(data);
  if ((!storedData && data.demoData) || (data.demoData && ensureDemoSharedWindows(data))) {
    writeQueueData(data);
  }
  return data;
}

function ensureDemoSharedWindows(data) {
  let changed = false;
  if (!data.demoSharedWindowsSeeded) {
    ["Cashier", "Registrar"].forEach((service) => {
      const ownerQueue = data.activeQueues.find((queue) =>
        queue.ownerId === DEMO_ADMIN_ID && queue.service === service &&
        queue.id === getQueueGroup(data, queue)?.ownerQueueId
      );
      if (!ownerQueue) return;
      const group = getQueueGroup(data, ownerQueue);
      if (!group) return;
      const freeWindow = windowsForService(service).find((windowName) =>
        !data.activeQueues.some((queue) =>
          queue.groupId === group.id && queue.window === windowName
        )
      );
      if (!freeWindow) return;
      data.activeQueues.push({
        id: createId(),
        shareToken: createId().replace(/-/g, "").slice(0, 16),
        ownerId: DEMO_WINDOW_ADMIN_ID,
        service,
        window: freeWindow,
        displayLabel: freeWindow,
        displayEnabled: true,
        allowMembers: true,
        nowServing: service === "Cashier" ? "#8" : "#5",
        tickets: group.tickets,
        waiting: group.tickets.length,
        served: 3,
        noShow: 1,
        completedTickets: group.completedTickets,
        groupId: group.id,
        parentQueueId: ownerQueue.id
      });
    });
    data.demoSharedWindowsSeeded = true;
    changed = true;
  }
  if (!data.demoCrossServiceDisplaySeededV2) {
    const cashierOwner = data.activeQueues.find((queue) =>
      queue.ownerId === DEMO_ADMIN_ID &&
      queue.service === "Cashier" &&
      queue.id === getQueueGroup(data, queue)?.ownerQueueId
    );
    const registrarOwner = data.activeQueues.find((queue) =>
      queue.ownerId === DEMO_ADMIN_ID &&
      queue.service === "Registrar" &&
      queue.id === getQueueGroup(data, queue)?.ownerQueueId
    );
    const registrarWindow = data.activeQueues.find((queue) =>
      queue.ownerId === DEMO_WINDOW_ADMIN_ID && queue.service === "Registrar"
    );
    if (cashierOwner) {
      [registrarOwner, registrarWindow].filter(Boolean).forEach((queue) => {
        queue.displayParentQueueId = cashierOwner.id;
      });
    }
    data.demoCrossServiceDisplaySeededV2 = true;
    changed = true;
  }
  return changed;
}

function getQueueById(data, queueId) {
  return data.activeQueues.find((queue) => queue.id === queueId) || null;
}

function getQueueGroup(data, queue) {
  return data.groups.find((group) => group.id === queue.groupId);
}

function getRootQueue(data, queue) {
  const group = getQueueGroup(data, queue);
  return group ? getQueueById(data, group.ownerQueueId) : null;
}

function getOwnQueues(data) {
  const adminId = getAdminId();
  return data.activeQueues.filter((queue) => queue.ownerId === adminId);
}

function getDisplayMembers(data, queue) {
  return data.activeQueues.filter((member) =>
    member.id !== queue.id &&
    (member.groupId === queue.groupId || member.displayParentQueueId === queue.id)
  );
}

function detachQueueMemberFromGroup(data, member) {
  const previousGroup = getQueueGroup(data, member);
  const tickets = member.tickets.map((ticket) => ({ ...ticket }));
  const completedTickets = member.completedTickets.map((ticket) => ({ ...ticket }));
  member.groupId = member.id;
  member.parentQueueId = "";
  member.displayParentQueueId = "";
  member.shareToken = createId().replace(/-/g, "").slice(0, 16);
  member.allowMembers = true;
  member.displayEnabled = true;
  member.tickets = tickets;
  member.completedTickets = completedTickets;
  data.groups.push({
    id: member.id,
    ownerQueueId: member.id,
    ownerId: member.ownerId,
    nextNumber: previousGroup ? previousGroup.nextNumber : 1,
    tickets,
    completedTickets
  });
}

function syncQueueGroup(data, groupId) {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group) return;
  data.activeQueues.filter((queue) => queue.groupId === groupId).forEach((queue) => {
    queue.tickets = group.tickets;
    queue.completedTickets = group.completedTickets;
    queue.waiting = group.tickets.length;
  });
}

function assignNextTicket(data, queue) {
  const group = getQueueGroup(data, queue);
  if (!group) throw new Error("The shared queue could not be found.");

  const groupQueues = data.activeQueues.filter((member) => member.groupId === queue.groupId);
  if (Number.isSafeInteger(group.jumpSequenceNext) && group.jumpSequenceNext > 0) {
    const activeAtOtherWindows = new Set(groupQueues
      .filter((member) => member.id !== queue.id)
      .map((member) => normalizeCustomerTicket(String(member.nowServing || "")))
      .filter((number) => number && !["NOT STARTED", "NO CUSTOMERS WAITING"].includes(number)));
    let nextNumber = group.jumpSequenceNext;
    while (activeAtOtherWindows.has(ticketNumber(nextNumber).toUpperCase())) {
      nextNumber += 1;
    }
    if (!Number.isSafeInteger(nextNumber + 1)) {
      throw new Error("The queue ticket number has reached its maximum supported value.");
    }
    const nextNumberText = ticketNumber(nextNumber).toUpperCase();
    const queuedIndex = group.tickets.findIndex((ticket) =>
      normalizeCustomerTicket(String(ticket.number || "")) === nextNumberText
    );
    const nextTicket = queuedIndex >= 0
      ? group.tickets.splice(queuedIndex, 1)[0]
      : { number: nextNumberText, status: "called" };
    nextTicket.status = "called";
    group.jumpSequenceNext = nextNumber + 1;
    group.nextNumber = nextNumber + 1;
    syncQueueGroup(data, queue.groupId);
    queue.nowServing = nextTicket.number;
    return nextTicket.number;
  }

  const unavailable = new Set(group.completedTickets.map((ticket) =>
    normalizeCustomerTicket(String(ticket.number || ""))
  ));
  groupQueues.forEach((member) => {
    const current = normalizeCustomerTicket(String(member.nowServing || ""));
    if (current && !["NOT STARTED", "NO CUSTOMERS WAITING"].includes(current)) {
      unavailable.add(current);
    }
  });

  const seenWaiting = new Set();
  const eligibleTickets = group.tickets.filter((ticket) => {
    const number = normalizeCustomerTicket(String(ticket.number || ""));
    if (!number || unavailable.has(number) || seenWaiting.has(number)) return false;
    seenWaiting.add(number);
    return true;
  });
  group.tickets = eligibleTickets;

  let nextTicket = group.tickets.shift();
  if (!nextTicket) {
    let nextNumber = Math.max(1, Number.isSafeInteger(group.nextNumber) ? group.nextNumber : 1);
    while (unavailable.has(ticketNumber(nextNumber).toUpperCase())) {
      nextNumber += 1;
    }
    group.nextNumber = nextNumber;
    nextTicket = { number: ticketNumber(group.nextNumber), status: "called" };
    group.nextNumber += 1;
  } else {
    nextTicket.status = "called";
    group.nextNumber = Math.max(group.nextNumber, numericTicketPart(nextTicket.number) + 1);
  }

  syncQueueGroup(data, queue.groupId);
  queue.nowServing = nextTicket.number;
  return nextTicket.number;
}

function reconcileGroupAssignments(data, groupId) {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group) return false;

  const completed = new Set(group.completedTickets.map((ticket) =>
    String(ticket.number || "").trim().toUpperCase()
  ));
  const assigned = new Set();
  const queues = data.activeQueues
    .filter((queue) => queue.groupId === groupId)
    .sort((first, second) =>
      Number(second.id === group.ownerQueueId) - Number(first.id === group.ownerQueueId)
    );
  let changed = false;

  queues.forEach((queue) => {
    const current = String(queue.nowServing || "").trim().toUpperCase();
    if (!current || ["NOT STARTED", "NO CUSTOMERS WAITING"].includes(current)) return;
    if (!completed.has(current) && !assigned.has(current)) {
      assigned.add(current);
      return;
    }
    queue.nowServing = "Not started";
    assignNextTicket(data, queue);
    assigned.add(String(queue.nowServing).trim().toUpperCase());
    changed = true;
  });
  return changed;
}

function recordCompletedTicket(data, queue, status) {
  const group = getQueueGroup(data, queue);
  if (!group) throw new Error("The shared queue could not be found.");
  group.completedTickets.push({
    number: queue.nowServing,
    status,
    completedAt: new Date().toISOString(),
    window: queue.window,
    ownerId: queue.ownerId,
    service: queue.service
  });
  syncQueueGroup(data, queue.groupId);
  const today = todayKey();
  let history = data.history.find((entry) => entry.date === today);
  if (!history) {
    history = { date: today, cashier: 0, registrar: 0 };
    data.history.push(history);
  }
  if (status === "served") {
    queue.served += 1;
    history[queue.service.toLowerCase()] = (history[queue.service.toLowerCase()] || 0) + 1;
  } else {
    queue.noShow += 1;
  }
}

function formatCount(value) {
  return new Intl.NumberFormat().format(value);
}

function renderDashboard() {
  const notice = document.getElementById("dashboard-message");
  try {
    const data = ensureQueueData();
    updateServedTotal(data);
    if (data.demoData) {
      showMessage(notice, "Showing sample queue data for preview. Start a queue to add your own demo activity.", false);
      notice.classList.add("info-message");
    }
  } catch (error) {
    showMessage(notice, error.message, false);
  }
}

function dateRangeForFilter(filter, startValue, endValue, selectedValue = todayKey()) {
  const selectedDate = new Date(`${selectedValue}T12:00:00`);
  const today = Number.isNaN(selectedDate.getTime())
    ? new Date(`${todayKey()}T12:00:00`)
    : selectedDate;
  const start = new Date(today);
  const end = new Date(today);
  if (filter === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  } else if (filter === "month") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  } else if (filter === "year") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  } else if (filter === "range") {
    return { start: startValue, end: endValue };
  } else {
    return { start: dateKey(today), end: dateKey(today) };
  }
  return {
    start: dateKey(start),
    end: dateKey(end)
  };
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAccountServedByDate(data, adminId) {
  const counts = new Map();
  let recordedServices = 0;
  data.groups.forEach((group) => {
    const ownerQueue = getQueueById(data, group.ownerQueueId);
    (group.completedTickets || []).forEach((ticket) => {
      if (ticket.status !== "served") return;
      const ownerId = ticket.ownerId || group.ownerId || (ownerQueue && ownerQueue.ownerId);
      if (ownerId !== adminId) return;
      const completedDate = new Date(ticket.completedAt);
      const service = ticket.service || (ownerQueue && ownerQueue.service);
      if (Number.isNaN(completedDate.getTime()) || !["Cashier", "Registrar"].includes(service)) return;
      const key = dateKey(completedDate);
      const dateCounts = counts.get(key) || { Cashier: 0, Registrar: 0 };
      dateCounts[service] += 1;
      counts.set(key, dateCounts);
      recordedServices += 1;
    });
  });
  if (recordedServices === 0 && data.demoData && adminId === DEMO_ADMIN_ID) {
    data.history.forEach((entry) => {
      counts.set(entry.date, {
        Cashier: Number(entry.cashier) || 0,
        Registrar: Number(entry.registrar) || 0
      });
    });
  }
  return counts;
}

function getAccountNoShowsByDate(data, adminId) {
  const counts = new Map();
  data.groups.forEach((group) => {
    const ownerQueue = getQueueById(data, group.ownerQueueId);
    (group.completedTickets || []).forEach((ticket) => {
      if (ticket.status !== "noShow") return;
      const ownerId = ticket.ownerId || group.ownerId || (ownerQueue && ownerQueue.ownerId);
      if (ownerId !== adminId) return;
      const completedDate = new Date(ticket.completedAt);
      const service = ticket.service || (ownerQueue && ownerQueue.service);
      if (Number.isNaN(completedDate.getTime()) || !["Cashier", "Registrar"].includes(service)) return;
      const key = dateKey(completedDate);
      const dateCounts = counts.get(key) || { Cashier: 0, Registrar: 0 };
      dateCounts[service] += 1;
      counts.set(key, dateCounts);
    });
  });
  return counts;
}

function getChartBuckets(filter, range) {
  const startDate = new Date(`${range.start}T12:00:00`);
  const endDate = new Date(`${range.end}T12:00:00`);
  const totalDays = Math.floor((endDate - startDate) / 86400000) + 1;
  if (filter === "year") {
    const year = startDate.getFullYear();
    return Array.from({ length: 12 }, (_, month) => {
      const start = new Date(year, month, 1, 12);
      const end = new Date(year, month + 1, 0, 12);
      return {
        start: dateKey(start),
        end: dateKey(end),
        label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(start)
      };
    });
  }
  const bucketMode = filter === "range"
    ? totalDays <= 31 ? "day" : totalDays <= 180 ? "week" : "month"
    : filter === "week" || filter === "month" ? "day" : "day";
  const buckets = [];
  if (bucketMode === "day") {
    for (const day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
      const current = new Date(day);
      buckets.push({
        start: dateKey(current),
        end: dateKey(current),
        label: filter === "day"
          ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(current)
          : new Intl.DateTimeFormat(undefined, filter === "week"
            ? { weekday: "short" }
            : { day: "numeric" }).format(current)
      });
    }
    return buckets;
  }
  if (bucketMode === "week") {
    const cursor = new Date(startDate);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    while (cursor <= endDate) {
      const bucketEnd = new Date(cursor);
      bucketEnd.setDate(bucketEnd.getDate() + 6);
      const boundedStart = cursor < startDate ? startDate : cursor;
      const boundedEnd = bucketEnd > endDate ? endDate : bucketEnd;
      buckets.push({
        start: dateKey(boundedStart),
        end: dateKey(boundedEnd),
        label: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(cursor)
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return buckets;
  }
  for (let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 12);
    cursor <= endDate;
    cursor.setMonth(cursor.getMonth() + 1)) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
    const boundedStart = bucketStart < startDate ? startDate : bucketStart;
    const boundedEnd = bucketEnd > endDate ? endDate : bucketEnd;
    buckets.push({
      start: dateKey(boundedStart),
      end: dateKey(boundedEnd),
      label: new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(cursor)
    });
  }
  return buckets;
}

function renderServiceChart(data, range) {
  const chart = document.getElementById("service-chart");
  const caption = document.getElementById("service-chart-caption");
  chart.replaceChildren();
  if (!range.start || !range.end || range.start > range.end) {
    chart.setAttribute("aria-label", "Invalid date range");
    caption.textContent = "Choose a start date on or before the end date.";
    return;
  }
  const adminId = getAdminId();
  const counts = getAccountServedByDate(data, adminId);
  const noShowCounts = getAccountNoShowsByDate(data, adminId);
  const filter = document.getElementById("served-period").value;
  const serviceFilter = document.getElementById("chart-service-filter").value;
  const buckets = getChartBuckets(filter, range);
  const values = buckets.map((bucket) => {
    let cashier = 0;
    let registrar = 0;
    let cashierNoShow = 0;
    let registrarNoShow = 0;
    counts.forEach((daily, key) => {
      if (key >= bucket.start && key <= bucket.end) {
        cashier += daily.Cashier;
        registrar += daily.Registrar;
      }
    });
    noShowCounts.forEach((daily, key) => {
      if (key >= bucket.start && key <= bucket.end) {
        cashierNoShow += daily.Cashier;
        registrarNoShow += daily.Registrar;
      }
    });
    return {
      ...bucket,
      cashier: serviceFilter === "Registrar" ? 0 : cashier,
      registrar: serviceFilter === "Cashier" ? 0 : registrar,
      cashierNoShow: serviceFilter === "Registrar" ? 0 : cashierNoShow,
      registrarNoShow: serviceFilter === "Cashier" ? 0 : registrarNoShow
    };
  });
  const maxValue = Math.max(1, ...values.flatMap((bucket) => [
    bucket.cashier,
    bucket.registrar,
    bucket.cashierNoShow,
    bucket.registrarNoShow
  ]));
  const total = values.reduce((sum, bucket) =>
    sum + bucket.cashier + bucket.registrar + bucket.cashierNoShow + bucket.registrarNoShow, 0);
  const serviceLabel = serviceFilter === "all" ? "" : ` ${serviceFilter}`;
  caption.textContent = `${formatCount(total)}${serviceLabel} completed tickets for this period`;
  chart.setAttribute("aria-label", values.map((bucket) => {
    if (serviceFilter === "Cashier") return `${bucket.label}: Cashier ${bucket.cashier}, Cashier No Show ${bucket.cashierNoShow}`;
    if (serviceFilter === "Registrar") return `${bucket.label}: Registrar ${bucket.registrar}, Registrar No Show ${bucket.registrarNoShow}`;
    return `${bucket.label}: Cashier ${bucket.cashier}, Registrar ${bucket.registrar}, Cashier No Show ${bucket.cashierNoShow}, Registrar No Show ${bucket.registrarNoShow}`;
  }).join("; "));
  document.querySelector(".chart-legend-cashier").parentElement.hidden = serviceFilter === "Registrar";
  document.querySelector(".chart-legend-registrar").parentElement.hidden = serviceFilter === "Cashier";
  document.querySelector(".chart-legend-cashier-no-show").parentElement.hidden = serviceFilter === "Registrar";
  document.querySelector(".chart-legend-registrar-no-show").parentElement.hidden = serviceFilter === "Cashier";
  values.forEach((bucket) => {
    const group = document.createElement("div");
    group.className = `service-chart-group${filter === "day" ? " single-date" : ""}`;
    const bars = document.createElement("div");
    bars.className = "service-chart-bars";
    const series = serviceFilter === "Cashier"
      ? [["Cashier", bucket.cashier, "cashier"], ["Cashier No Show", bucket.cashierNoShow, "cashier-no-show"]]
      : serviceFilter === "Registrar"
        ? [["Registrar", bucket.registrar, "registrar"], ["Registrar No Show", bucket.registrarNoShow, "registrar-no-show"]]
        : [
          ["Cashier", bucket.cashier, "cashier"],
          ["Registrar", bucket.registrar, "registrar"],
          ["Cashier No Show", bucket.cashierNoShow, "cashier-no-show"],
          ["Registrar No Show", bucket.registrarNoShow, "registrar-no-show"]
        ];
    series.forEach(([service, count, className]) => {
      const column = document.createElement("div");
      column.className = `service-chart-column ${className}`;
      const value = document.createElement("span");
      value.className = "service-chart-value";
      value.textContent = formatCount(count);
      const bar = document.createElement("span");
      bar.className = "service-chart-bar";
      bar.style.height = `${count ? Math.max(4, (count / maxValue) * 150) : 2}px`;
      bar.title = `${service}: ${formatCount(count)}`;
      column.append(value, bar);
      bars.append(column);
    });
    const label = document.createElement("span");
    label.className = "service-chart-label";
    label.textContent = bucket.label;
    group.append(bars, label);
    chart.append(group);
  });
  const scroll = document.querySelector(".service-chart-scroll");
  scroll.scrollLeft = scroll.scrollWidth;
}

function updateServedTotal(data) {
  const filter = document.getElementById("served-period").value;
  const startInput = document.getElementById("range-start");
  const endInput = document.getElementById("range-end");
  const periodFields = {
    day: document.getElementById("period-day-fields"),
    week: document.getElementById("period-week-fields"),
    month: document.getElementById("period-month-fields"),
    year: document.getElementById("period-year-fields"),
    range: document.getElementById("range-fields")
  };
  Object.entries(periodFields).forEach(([period, fields]) => {
    fields.hidden = filter !== period;
  });
  const selectedValue = filter === "week"
    ? document.getElementById("period-week").value || todayKey()
    : filter === "month"
      ? `${document.getElementById("period-month").value || todayKey().slice(0, 7)}-01`
      : filter === "year"
        ? `${document.getElementById("period-year").value || todayKey().slice(0, 4)}-01-01`
        : document.getElementById("period-day").value || todayKey();
  const range = dateRangeForFilter(
    filter,
    startInput.value,
    endInput.value,
    selectedValue || todayKey()
  );
  const caption = document.getElementById("served-caption");
  if (filter === "range" && (!range.start || !range.end)) {
    document.getElementById("served-total").textContent = "0";
    caption.textContent = "Choose both dates to view served totals";
    renderServiceChart(data, range);
    return;
  }
  if (filter === "range" && range.start > range.end) {
    document.getElementById("served-total").textContent = "0";
    caption.textContent = "Start date must be on or before end date";
    renderServiceChart(data, range);
    return;
  }
  let served = 0;
  getAccountServedByDate(data, getAdminId()).forEach((daily, key) => {
    if (key >= range.start && key <= range.end) {
      served += daily.Cashier + daily.Registrar;
    }
  });
  document.getElementById("served-total").textContent = formatCount(served);
  const periodLabel = filter === "day" ? `on ${selectedValue}`
    : filter === "week" ? `for the week of ${selectedValue}`
      : filter === "month" ? `in ${selectedValue.slice(0, 7)}`
        : filter === "year" ? `in ${selectedValue.slice(0, 4)}` : "in selected dates";
  caption.textContent = `Customers served ${periodLabel}`;
  renderServiceChart(data, range);
}

function initDashboard() {
  if (!getAdminId()) {
    window.location.href = "/";
    return;
  }
  initializeAuthenticatedShell();
  document.getElementById("dashboard-date").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  }).format(new Date());
  const today = todayKey();
  document.getElementById("period-day").value = today;
  document.getElementById("period-week").value = today;
  document.getElementById("period-month").value = today.slice(0, 7);
  document.getElementById("period-year").value = today.slice(0, 4);
  const defaultStart = new Date(`${today}T12:00:00`);
  defaultStart.setDate(defaultStart.getDate() - 6);
  document.getElementById("range-start").value = dateKey(defaultStart);
  document.getElementById("range-end").value = today;
  const dashboardService = document.getElementById("dashboard-service");
  const dashboardWindow = document.getElementById("dashboard-window");
  const dashboardJoinCode = document.getElementById("dashboard-join-code");
  const dashboardSubmit = document.getElementById("dashboard-queue-submit");
  const refreshDashboardWindowOptions = () => {
    const data = ensureQueueData();
    const occupiedWindows = data.activeQueues
      .filter((queue) => queue.service === dashboardService.value)
      .map((queue) => queue.window);
    populateWindowOptions(dashboardWindow, dashboardService.value, occupiedWindows);
  };
  const updateDashboardJoinCodeState = () => {
    const joiningQueue = Boolean(dashboardJoinCode.value.trim());
    dashboardSubmit.textContent = joiningQueue ? "Join queue" : "Continue";
  };
  dashboardService.addEventListener("change", () => {
    refreshDashboardWindowOptions();
  });
  dashboardJoinCode.addEventListener("input", () => {
    updateDashboardJoinCodeState();
    refreshDashboardWindowOptions();
  });
  document.getElementById("open-start-queue-modal").addEventListener("click", () => {
    document.getElementById("dashboard-queue-form").reset();
    updateDashboardJoinCodeState();
    refreshDashboardWindowOptions();
    document.getElementById("dashboard-queue-message").textContent = "";
    document.getElementById("start-queue-dialog").showModal();
  });
  document.getElementById("dashboard-queue-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const adminId = getAdminId();
    const service = document.getElementById("dashboard-service").value;
    const windowName = document.getElementById("dashboard-window").value;
    try {
      if (dashboardJoinCode.value.trim()) {
        await mongoWriteQueue;
        await refreshQueueDataFromMongo(true);
      }
      const data = ensureQueueData();
      const occupied = data.activeQueues.some((queue) =>
        queue.service === service && queue.window === windowName
      );
      if (occupied) {
        showMessage(document.getElementById("dashboard-queue-message"), `${windowName} is already in use. Choose an available window.`, false);
        refreshDashboardWindowOptions();
        return;
      }
      const joinCode = dashboardJoinCode.value.replace(/\s/g, "").toLowerCase();
      if (joinCode) {
        const matchingQueue = data.activeQueues.find((queue) =>
          String(queue.shareToken || "").toLowerCase() === joinCode
        );
        const group = matchingQueue && getQueueGroup(data, matchingQueue);
        const owner = group && getQueueById(data, group.ownerQueueId);
        if (!owner || !owner.allowMembers) {
          showMessage(document.getElementById("dashboard-queue-message"), "That Join Code is invalid or no longer accepting windows.", false);
          return;
        }
        const joinedGroup = owner.service === service ? getQueueGroup(data, owner) : null;
        if (owner.service === service && !joinedGroup) {
          showMessage(document.getElementById("dashboard-queue-message"), "That shared queue is unavailable. Ask its owner to share a new Join Code.", false);
          return;
        }
        const joinedQueue = {
          id: createId(),
          shareToken: createId().replace(/-/g, "").slice(0, 16),
          ownerId: adminId,
          parentQueueId: joinedGroup ? owner.id : "",
          displayParentQueueId: joinedGroup ? "" : owner.id,
          service,
          window: windowName,
          displayLabel: windowName,
          displayEnabled: true,
          allowMembers: !joinedGroup,
          nowServing: joinedGroup ? owner.nowServing : "Not started",
          tickets: joinedGroup ? joinedGroup.tickets : [],
          waiting: joinedGroup ? joinedGroup.tickets.length : 0,
          served: 0,
          noShow: 0,
          groupId: joinedGroup ? owner.groupId : ""
        };
        joinedQueue.groupId = joinedQueue.groupId || joinedQueue.id;
        if (!joinedGroup) {
          data.groups.push({
            id: joinedQueue.groupId,
            ownerQueueId: joinedQueue.id,
            ownerId: joinedQueue.ownerId,
            nextNumber: 1,
            tickets: joinedQueue.tickets,
            completedTickets: []
          });
        }
        data.activeQueues.push(joinedQueue);
        await writeQueueData(data);
        document.getElementById("start-queue-dialog").close();
        window.location.href = `/my-queue?queue=${encodeURIComponent(joinedQueue.id)}`;
        return;
      }
      const activeDisplays = getActiveDisplaySessions(adminId);
      const joinedQueueCount = countJoinedQueuesForOwner(data, adminId);
      const previewWarning = activeDisplays.length
        ? `Starting this queue will close ${activeDisplays.length} active queue preview${activeDisplays.length === 1 ? "" : "s"} to prevent overlapping displays.`
        : "Any open queue previews for this account will be closed to prevent overlapping displays.";
      const joinedQueueWarning = joinedQueueCount
        ? ` This will also remove ${joinedQueueCount} joined window${joinedQueueCount === 1 ? "" : "s"} from your existing queues.`
        : "";
      if (!await showConfirmModal({
        title: "Start a new queue?",
        message: `${service} · ${windowName}. This will start a fresh, separate queue. ${previewWarning}${joinedQueueWarning}`,
        confirmLabel: "Start queue"
      })) return;
      await closeActiveDisplays(adminId);
      closeJoinedQueuesForOwner(data, adminId);
      const queue = {
        id: createId(),
        shareToken: createId().replace(/-/g, "").slice(0, 16),
        ownerId: adminId,
        service,
        window: windowName,
        displayLabel: windowName,
        displayEnabled: true,
        allowMembers: true,
        nowServing: "Not started",
        tickets: [],
        waiting: 0,
        served: 0,
        noShow: 0,
        completedTickets: [],
        groupId: ""
      };
      queue.groupId = queue.id;
      data.activeQueues.push(queue);
      data.groups.push({
        id: queue.groupId,
        ownerQueueId: queue.id,
        ownerId: adminId,
        nextNumber: 1,
        tickets: queue.tickets,
        completedTickets: []
      });
      await writeQueueData(data);
      document.getElementById("start-queue-dialog").close();
      window.location.href = `/my-queue?queue=${encodeURIComponent(queue.id)}`;
    } catch (error) {
      showMessage(document.getElementById("dashboard-queue-message"), error.message, false);
    }
  });
  document.getElementById("served-period").addEventListener("change", () => {
    try {
      updateServedTotal(ensureQueueData());
    } catch (error) {
      showMessage(document.getElementById("dashboard-message"), error.message, false);
    }
  });
  ["range-start", "range-end"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      if (document.getElementById("served-period").value === "range") {
        try {
          updateServedTotal(ensureQueueData());
        } catch (error) {
          showMessage(document.getElementById("dashboard-message"), error.message, false);
        }
      }
    });
  });
  ["period-day", "period-week", "period-month", "period-year", "chart-service-filter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      try {
        updateServedTotal(ensureQueueData());
      } catch (error) {
        showMessage(document.getElementById("dashboard-message"), error.message, false);
      }
    });
  });
  document.getElementById("service-chart-older").addEventListener("click", () => {
    const scroll = document.querySelector(".service-chart-scroll");
    scroll.scrollLeft -= Math.max(180, scroll.clientWidth * 0.75);
  });
  document.getElementById("service-chart-newer").addEventListener("click", () => {
    const scroll = document.querySelector(".service-chart-scroll");
    scroll.scrollLeft += Math.max(180, scroll.clientWidth * 0.75);
  });
  renderDashboard();
}

function initQueueSetup() {
  if (!getAdminId()) {
    const returnPath = `/queue-setup${window.location.search}`;
    window.location.href = `/?return=${encodeURIComponent(returnPath)}`;
    return;
  }
  const form = document.getElementById("queue-form");
  const message = document.getElementById("queue-message");
  const serviceSelect = document.getElementById("service-type");
  const windowSelect = document.getElementById("service-window");
  const queueSetupParams = new URLSearchParams(window.location.search);
  let joinToken = queueSetupParams.get("join");
  let invitedOwner = null;
  initializeAuthenticatedShell();
  const refreshWindowOptions = () => {
    const occupiedWindows = queueData.activeQueues
      .filter((queue) => queue.service === serviceSelect.value)
      .map((queue) => queue.window);
    populateWindowOptions(windowSelect, serviceSelect.value, occupiedWindows);
  };
  let queueData;
  try {
    queueData = ensureQueueData();
    if (joinToken) {
      const tokenQueue = queueData.activeQueues.find((queue) => queue.shareToken === joinToken);
      const group = tokenQueue && getQueueGroup(queueData, tokenQueue);
      invitedOwner = group && getQueueById(queueData, group.ownerQueueId);
      if (!invitedOwner || !invitedOwner.allowMembers) {
        invitedOwner = null;
        showMessage(message, "This shared queue link is invalid or no longer accepting windows.", false);
        document.getElementById("queue-submit-button").disabled = true;
      } else {
        document.title = "Join shared queue | School Queue Tracker";
        document.getElementById("queue-setup-title").textContent = "Join or start a queue";
        document.getElementById("queue-setup-description").textContent =
          "Choose a service and window. Selecting the owner's service joins the shared ticket line.";
        document.getElementById("queue-submit-button").innerHTML = "Continue <span aria-hidden=\"true\">→</span>";
        document.getElementById("queue-setup-hint").textContent =
          `Cashier uses Windows 1–2; Registrar uses Windows 3–4. Choosing ${invitedOwner.service} joins this ticket line; another service keeps a separate ticket line and appears beside the owner on the customer display.`;
        serviceSelect.value = "";
      }
    }
  } catch (error) {
    showMessage(message, error.message, false);
  }
  const setInvitedOwner = (owner) => {
    invitedOwner = owner;
    joinToken = owner.shareToken;
    serviceSelect.value = "";
    refreshWindowOptions();
    document.title = "Join shared queue | School Queue Tracker";
    document.getElementById("queue-setup-title").textContent = "Join or start a queue";
    document.getElementById("queue-setup-description").textContent =
      "Choose a service type and an available window to join the shared queue.";
    document.getElementById("queue-submit-button").innerHTML = "Continue <span aria-hidden=\"true\">→</span>";
    document.getElementById("queue-setup-hint").textContent =
      `Choose ${invitedOwner.service} to join its shared ticket line, or another service to display alongside the owner. Windows already in use are unavailable.`;
    document.getElementById("queue-submit-button").disabled = false;
  };
  if (invitedOwner) setInvitedOwner(invitedOwner);
  serviceSelect.addEventListener("change", () => {
    refreshWindowOptions();
    if (invitedOwner) {
      const hint = document.getElementById("queue-setup-hint");
      hint.textContent = serviceSelect.value === invitedOwner.service
        ? `Choose an unused ${invitedOwner.service} window to join the shared ticket line.`
        : `This ${serviceSelect.value} window keeps its own ticket line and appears beside the owner's service on the customer display.`;
    }
  });
  refreshWindowOptions();
  const joinCodeForm = document.getElementById("join-code-form");
  const joinCodeMessage = document.getElementById("join-code-message");
  const joinCodeInput = document.getElementById("join-queue-code");
  joinCodeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const joinCode = joinCodeInput.value.replace(/\s/g, "").toLowerCase();
    if (!joinCode) {
      showMessage(joinCodeMessage, "Enter a join code.", false);
      return;
    }
    try {
      await refreshQueueDataFromMongo(true);
      queueData = ensureQueueData();
      const matchingQueue = queueData.activeQueues.find((queue) =>
        String(queue.shareToken || "").toLowerCase() === joinCode
      );
      const group = matchingQueue && getQueueGroup(queueData, matchingQueue);
      const owner = group && getQueueById(queueData, group.ownerQueueId);
      if (!owner || !owner.allowMembers) {
        invitedOwner = null;
        joinToken = null;
        showMessage(joinCodeMessage, "That join code is invalid or no longer accepting windows.", false);
        return;
      }
      setInvitedOwner(owner);
      showMessage(joinCodeMessage, "Join code accepted. Select a service and an available window.", true);
    } catch (error) {
      showMessage(joinCodeMessage, error.message, false);
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const service = serviceSelect.value;
    const windowName = windowSelect.value;
    if (!windowsForService(service).includes(windowName)) {
      showMessage(message, "Choose a window assigned to the selected service.", false);
      return;
    }
    if (joinCodeInput.value.trim() && !invitedOwner) {
      showMessage(joinCodeMessage, "Enter a valid join code before continuing.", false);
      return;
    }
    try {
      await refreshQueueDataFromMongo(true);
      queueData = ensureQueueData();
      let joinedOwner = null;
      if (joinToken) {
        const tokenQueue = queueData.activeQueues.find((queue) => queue.shareToken === joinToken);
        const group = tokenQueue && getQueueGroup(queueData, tokenQueue);
        joinedOwner = group && getQueueById(queueData, group.ownerQueueId);
        if (!joinedOwner || !joinedOwner.allowMembers) {
          showMessage(message, "This shared queue link is invalid or no longer accepting windows.", false);
          return;
        }
      }
      if (!joinedOwner) {
        const joinedQueueCount = countJoinedQueuesForOwner(queueData, getAdminId());
        if (joinedQueueCount && !await showConfirmModal({
          title: "Start a new queue?",
          message: `Starting this queue will remove ${joinedQueueCount} joined window${joinedQueueCount === 1 ? "" : "s"} from your existing queues.`,
          confirmLabel: "Start queue"
        })) return;
        closeJoinedQueuesForOwner(queueData, getAdminId());
      }
      let joinedGroup = null;
      const occupied = queueData.activeQueues.some((queue) =>
        queue.service === service && queue.window === windowName
      );
      if (occupied) {
        showMessage(message, `${windowName} is already in use. Choose an available window.`, false);
        refreshWindowOptions();
        return;
      }
      if (joinedOwner && joinedOwner.service === service) {
        joinedGroup = getQueueGroup(queueData, joinedOwner);
      }
      const newQueue = {
        id: createId(),
        shareToken: createId().replace(/-/g, "").slice(0, 16),
        ownerId: getAdminId(),
        parentQueueId: joinedGroup ? joinedOwner.id : "",
        displayParentQueueId: joinedOwner && joinedOwner.service !== service ? joinedOwner.id : "",
        service,
        window: windowName,
        displayLabel: windowName,
        displayEnabled: true,
        allowMembers: !joinedGroup,
        nowServing: joinedGroup ? joinedOwner.nowServing : "Not started",
        tickets: joinedGroup ? joinedGroup.tickets : [],
        waiting: joinedGroup ? joinedGroup.tickets.length : 0,
        served: 0,
        noShow: 0,
        groupId: joinedGroup ? joinedOwner.groupId : ""
      };
      newQueue.groupId = newQueue.groupId || newQueue.id;
      queueData.activeQueues.push(newQueue);
      if (!joinedGroup) {
        queueData.groups.push({
          id: newQueue.groupId,
          ownerQueueId: newQueue.id,
          ownerId: newQueue.ownerId,
          nextNumber: 1,
          tickets: newQueue.tickets,
          completedTickets: []
        });
      }
      await writeQueueData(queueData);
      window.location.href = `/my-queue?queue=${encodeURIComponent(newQueue.id)}`;
    } catch (error) {
      showMessage(message, error.message, false);
    }
  });
}

function initializeAuthenticatedShell() {
      const adminId = getAdminId();
      const account = readAccounts().find((item) => item.id === adminId);
      const name = account ? [account.firstName, account.lastName].filter(Boolean).join(" ") : "Administrator";
      startAdminSessionLifecycle(adminId);
      document.querySelectorAll("#admin-name").forEach((element) => {
        element.textContent = name;
      });
      document.querySelectorAll("[data-logout]").forEach((button) => {
        button.addEventListener("click", logout);
      });
      const logoutButton = document.getElementById("logout-button");
      if (logoutButton) {
        logoutButton.addEventListener("click", logout);
      }
    }

async function logout() {
  const adminId = getAdminId();
  try {
    const activeDisplays = getActiveDisplaySessions(adminId);
    const queueExitWarning = myQueueExitContext
      ? "Leaving this page will exit your current queue and remove its joined windows."
      : "";
    const previewNotice = activeDisplays.length
      ? `${activeDisplays.length} active queue preview${activeDisplays.length === 1 ? "" : "s"} will close.`
      : "Any active queue previews will close.";
    if (!await showConfirmModal({
      title: myQueueExitContext ? "Exit queue and log out?" : "Log out?",
      message: `Are you sure you want to log out? ${queueExitWarning} ${previewNotice}`,
      confirmLabel: "Log out"
    })) return;
    if (myQueueExitContext) {
      const { queueId, ownerId } = myQueueExitContext;
      await removeQueueOnExit(queueId, ownerId);
      myQueueExitContext.bypassUnloadPrompt = true;
    }
    await endAdminSession(adminId);
  } catch (error) {
    window.alert(`Could not safely exit the queue and close active previews: ${error.message}`);
  }
}

const QUEUE_HISTORY_PAGE_SIZE = 10;
let queueHistoryPage = 0;

function renderMyQueue(data, queueId) {
      const message = document.getElementById("queue-page-message");
      const queue = getQueueById(data, queueId);
      if (!queue || queue.ownerId !== getAdminId()) {
        showMessage(message, "You do not have an active queue yet. Start one to manage your service window.", false);
        document.getElementById("current-serving-number").textContent = "—";
        document.getElementById("current-service-name").textContent = "No active service";
        document.getElementById("current-window-name").textContent = "—";
        document.getElementById("queue-waiting-count").textContent = "0";
        document.getElementById("queue-served-count").textContent = "0";
        document.getElementById("queue-noshow-count").textContent = "0";
        document.getElementById("serving-outcome-buttons").hidden = true;
        document.getElementById("start-queue-button").hidden = true;
        document.getElementById("mark-served-button").disabled = true;
        document.getElementById("mark-no-show-button").disabled = true;
        document.getElementById("open-share-modal").disabled = true;
        document.getElementById("open-restart-modal").disabled = true;
        document.getElementById("open-jump-queue-modal").disabled = true;
        document.getElementById("open-jump-queue-modal").hidden = true;
        renderQueueHistory(null);
        return;
      }
      document.getElementById("current-serving-number").textContent = queue.nowServing || "Not started";
      document.getElementById("current-service-name").textContent = queue.service;
      document.getElementById("current-window-name").textContent = queue.window;
      document.getElementById("queue-waiting-count").textContent = formatCount(queue.tickets.length);
      document.getElementById("queue-served-count").textContent = formatCount(queue.served);
      document.getElementById("queue-noshow-count").textContent = formatCount(queue.noShow);
      const hasCurrentCustomer = queue.nowServing &&
        !["Not started", "No customers waiting"].includes(queue.nowServing);
      const isNotStarted = !queue.nowServing || queue.nowServing === "Not started";
      document.getElementById("serving-outcome-buttons").hidden = isNotStarted;
      document.getElementById("start-queue-button").hidden = !isNotStarted;
      document.getElementById("mark-served-button").disabled = !hasCurrentCustomer;
      document.getElementById("mark-no-show-button").disabled = !hasCurrentCustomer;
      document.getElementById("open-share-modal").disabled = false;
      document.getElementById("open-restart-modal").disabled = false;
      const rootQueue = getRootQueue(data, queue);
      const isQueueOwner = !rootQueue || rootQueue.id === queue.id;
      const jumpButton = document.getElementById("open-jump-queue-modal");
      jumpButton.disabled = !isQueueOwner;
      jumpButton.hidden = !isQueueOwner;
      renderQueueHistory(getQueueGroup(data, queue));
      message.textContent = "";
      return queue;
    }

function renderQueueHistory(group) {
      const body = document.getElementById("queue-history-body");
      const emptyMessage = document.getElementById("empty-history-message");
      const pagination = document.getElementById("queue-history-pagination");
      const previousButton = document.getElementById("queue-history-previous");
      const nextButton = document.getElementById("queue-history-next");
      const pageLabel = document.getElementById("queue-history-page-label");
      body.replaceChildren();
      const records = group ? [...group.completedTickets].sort((a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      ) : [];
      const pageCount = Math.ceil(records.length / QUEUE_HISTORY_PAGE_SIZE);
      queueHistoryPage = Math.min(queueHistoryPage, Math.max(0, pageCount - 1));
      const pageRecords = records.slice(
        queueHistoryPage * QUEUE_HISTORY_PAGE_SIZE,
        (queueHistoryPage + 1) * QUEUE_HISTORY_PAGE_SIZE
      );
      emptyMessage.hidden = records.length > 0;
      pagination.hidden = pageCount <= 1;
      previousButton.disabled = queueHistoryPage === 0;
      nextButton.disabled = queueHistoryPage >= pageCount - 1;
      pageLabel.textContent = pageCount ? `Page ${queueHistoryPage + 1} of ${pageCount}` : "";
      pageRecords.forEach((record) => {
        const date = new Date(record.completedAt);
        const row = document.createElement("tr");
        const ticketCell = document.createElement("td");
        ticketCell.textContent = record.number;
        const statusCell = document.createElement("td");
        const status = document.createElement("span");
        status.className = `history-status ${record.status === "served" ? "status-served" : "status-no-show"}`;
        status.textContent = record.status === "served" ? "Served" : "No show";
        statusCell.append(status);
        const dateCell = document.createElement("td");
        dateCell.textContent = Number.isNaN(date.getTime())
          ? "—"
          : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
        const timeCell = document.createElement("td");
        timeCell.textContent = Number.isNaN(date.getTime())
          ? "—"
          : new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit"
          }).format(date);
        row.append(ticketCell, statusCell, dateCell, timeCell);
        body.append(row);
      });
    }

function initMyQueue() {
      if (!getAdminId()) {
        window.location.href = "/";
        return;
      }
      initializeAuthenticatedShell();
      const message = document.getElementById("queue-page-message");
      const shareDialog = document.getElementById("share-queue-dialog");
      const restartDialog = document.getElementById("restart-queue-dialog");
      const jumpDialog = document.getElementById("jump-queue-dialog");
      let data;
      let queueId;
      let shareQueueId = "";
      try {
        data = ensureQueueData();
        const ownQueues = getOwnQueues(data);
        const requestedQueue = new URLSearchParams(window.location.search).get("queue");
        queueId = ownQueues.some((queue) => queue.id === requestedQueue)
          ? requestedQueue
          : ownQueues[0]?.id || "";
        let queue = getQueueById(data, queueId);
        if (queue && reconcileGroupAssignments(data, queue.groupId)) {
          writeQueueData(data);
          queue = getQueueById(data, queueId);
        }
        if (queue && !queue.nowServing && queue.tickets.length) {
          callNextTicket(data, queue);
        } else if (queue && ["Not started", "No customers waiting"].includes(queue.nowServing) && queue.tickets.length) {
          callNextTicket(data, queue);
        } else {
          renderMyQueue(data, queueId);
        }
      } catch (error) {
        showMessage(message, error.message, false);
        return;
      }

      const initialQueue = getQueueById(data, queueId);
      if (initialQueue) {
        const currentAdminId = getAdminId();
        const rootQueue = getRootQueue(data, initialQueue);
        const isQueueOwner = !rootQueue || rootQueue.id === initialQueue.id;
        const joinedWindowCount = isQueueOwner
          ? data.activeQueues.filter((queue) =>
            queue.id !== initialQueue.id &&
            (queue.groupId === initialQueue.groupId ||
              queue.parentQueueId === initialQueue.id ||
              queue.displayParentQueueId === initialQueue.id)
          ).length
          : 0;
        myQueueExitContext = {
          queueId: initialQueue.id,
          ownerId: currentAdminId,
          bypassUnloadPrompt: false
        };
        const confirmQueueExit = () => showConfirmModal({
          title: "Exit queue?",
          message: isQueueOwner
            ? `Leaving this page will end your queue${joinedWindowCount ? ` and remove ${joinedWindowCount} joined window${joinedWindowCount === 1 ? "" : "s"}` : ""}.`
            : "Leaving this page will remove your joined window from the owner's queue.",
          confirmLabel: "Exit queue"
        });
        const handleQueuePageNavigation = async (event) => {
          if (!(event.target instanceof Element)) return;
          const link = event.target.closest("a[href]");
          if (!link || link.hasAttribute("download") ||
              (link.target && link.target !== "_self") ||
              event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const destination = new URL(link.href, window.location.href);
          if (destination.origin !== window.location.origin ||
              (destination.pathname === window.location.pathname &&
                destination.search === window.location.search)) return;
          event.preventDefault();
          if (!await confirmQueueExit()) return;
          try {
            await removeQueueOnExit(initialQueue.id, currentAdminId);
            myQueueExitContext.bypassUnloadPrompt = true;
            window.location.assign(destination.href);
          } catch (error) {
            showMessage(message, `Could not exit the queue: ${error.message}`, false);
          }
        };
        document.addEventListener("click", handleQueuePageNavigation, true);
        window.addEventListener("beforeunload", (event) => {
          if (!myQueueExitContext || myQueueExitContext.bypassUnloadPrompt) return;
          event.preventDefault();
          event.returnValue = "";
        });
        window.addEventListener("pagehide", () => {
          if (!myQueueExitContext || myQueueExitContext.bypassUnloadPrompt) return;
          const payload = new Blob(
            [JSON.stringify({ queueId: initialQueue.id, ownerId: currentAdminId })],
            { type: "application/json" }
          );
          if (!navigator.sendBeacon("/api/queue-exit", payload)) {
            fetch("/api/queue-exit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true
            }).catch((error) => console.error(`Could not exit the queue while leaving the page: ${error.message}`));
          }
        }, { once: true });
      }

      const getCurrentQueue = () => getQueueById(data, queueId);
      window.addEventListener("queue-closed-by-owner", (event) => {
        if (event.detail?.queueId !== queueId) return;
        data = readQueueData() || { activeQueues: [], groups: [], history: [] };
        renderMyQueue(data, queueId);
        showMessage(message, "The queue owner disconnected or signed out. Your joined window has been closed.", false);
        window.setTimeout(() => {
          window.location.href = "/dashboard";
        }, 3000);
      });
      const joinCodeField = document.getElementById("join-code-output");
      const shareCopyMessage = document.getElementById("share-copy-message");
      const shareCopyToast = document.getElementById("share-copy-toast");
      let shareCopyToastTimeout;
      joinCodeField.addEventListener("copy", (event) => event.preventDefault());
      joinCodeField.addEventListener("contextmenu", (event) => event.preventDefault());
      joinCodeField.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
          event.preventDefault();
        }
      });
      document.getElementById("start-queue-button").addEventListener("click", () => {
        const queue = getCurrentQueue();
        if (!queue || (queue.nowServing && queue.nowServing !== "Not started")) return;
        callNextTicket(data, queue);
      });
      document.getElementById("queue-history-previous").addEventListener("click", () => {
        if (queueHistoryPage === 0) return;
        queueHistoryPage -= 1;
        renderMyQueue(data, queueId);
      });
      document.getElementById("queue-history-next").addEventListener("click", () => {
        queueHistoryPage += 1;
        renderMyQueue(data, queueId);
      });
      ["served", "no-show"].forEach((outcome) => {
        const button = document.getElementById(outcome === "served" ? "mark-served-button" : "mark-no-show-button");
        button.addEventListener("click", () => {
          const queue = getCurrentQueue();
          if (!queue || !queue.nowServing || ["Not started", "No customers waiting"].includes(queue.nowServing)) return;
          recordCompletedTicket(data, queue, outcome === "served" ? "served" : "noShow");
          callNextTicket(data, queue);
        });
      });

      document.getElementById("open-share-modal").addEventListener("click", async () => {
        const queue = getCurrentQueue();
        if (!queue) return;
        const rootQueue = getRootQueue(data, queue);
        if (!rootQueue || rootQueue.ownerId !== getAdminId()) {
          showMessage(message, "Only the owner of this shared queue can manage its invitation link.", false);
          return;
        }
        shareQueueId = rootQueue.id;
        rootQueue.allowMembers = true;
        try {
          await writeQueueData(data, true);
        } catch (error) {
          showMessage(message, error.message, false);
          return;
        }
        document.getElementById("join-code-output").value = rootQueue.shareToken.toUpperCase();
        document.getElementById("share-copy-message").textContent = "Enter this code in Queue Setup to join the shared queue.";
        buildDisplayPreview(data, rootQueue, "share-display-preview");
        const displayLink = new URL("/display", window.location.origin);
        displayLink.searchParams.set("queue", rootQueue.id);
        document.getElementById("open-customer-display-preview").href = displayLink.href;
        const membersBody = document.getElementById("share-members-body");
        const emptyMembers = document.getElementById("share-members-empty");
        membersBody.replaceChildren();
        let accountById;
        try {
          accountById = new Map(readAccounts().map((account) => [account.id, account]));
        } catch (error) {
          showMessage(message, error.message, false);
          return;
        }
        const sharedQueues = data.activeQueues.filter((member) =>
          member.groupId === rootQueue.groupId || member.displayParentQueueId === rootQueue.id
        );
        emptyMembers.hidden = sharedQueues.length > 1;
        sharedQueues.forEach((member) => {
          const row = document.createElement("tr");
          const accountCell = document.createElement("td");
          const account = accountById.get(member.ownerId);
          accountCell.textContent = account
            ? `${account.id} · ${[account.firstName, account.lastName].filter(Boolean).join(" ")}`
            : member.ownerId;
          const serviceCell = document.createElement("td");
          serviceCell.textContent = member.service;
          const windowCell = document.createElement("td");
          windowCell.textContent = member.window;
          const actionCell = document.createElement("td");
          if (member.id === rootQueue.id) {
            actionCell.textContent = "Owner";
          } else {
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "button button-remove";
            removeButton.textContent = "Remove";
            removeButton.addEventListener("click", async () => {
              if (!await showConfirmModal({
                title: "Remove this window?",
                message: `Remove ${member.ownerId}'s ${member.window} from the shared queue?`,
                confirmLabel: "Remove window"
              })) return;
              try {
                if (member.groupId === rootQueue.groupId) {
                  detachQueueMemberFromGroup(data, member);
                } else {
                  member.displayParentQueueId = "";
                }
                writeQueueData(data);
                buildDisplayPreview(data, rootQueue, "share-display-preview");
                row.remove();
                emptyMembers.hidden = membersBody.rows.length > 1;
              } catch (error) {
                showMessage(message, error.message, false);
              }
            });
            actionCell.append(removeButton);
          }
          row.append(accountCell, serviceCell, windowCell, actionCell);
          membersBody.append(row);
        });
        shareDialog.showModal();
      });
      document.getElementById("copy-join-code").addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(joinCodeField.value);
          shareDialog.close();
          shareCopyToast.textContent = "Join code copied successfully and ready to paste.";
          shareCopyToast.hidden = false;
          clearTimeout(shareCopyToastTimeout);
          shareCopyToastTimeout = setTimeout(() => {
            shareCopyToast.hidden = true;
            shareCopyToast.textContent = "";
          }, 4000);
        } catch (error) {
          showMessage(shareCopyMessage, "Could not copy the Join Code. Allow clipboard access and try again.", false);
        }
      });
      document.getElementById("generate-join-code").addEventListener("click", async () => {
        const status = document.getElementById("share-copy-message");
        const rootQueue = data.activeQueues.find((member) => member.id === shareQueueId);
        if (!rootQueue || rootQueue.ownerId !== getAdminId()) {
          showMessage(status, "The owner queue is no longer available. Close and reopen this dialog, then try again.", false);
          return;
        }
        const previousToken = rootQueue.shareToken;
        let nextToken;
        do {
          nextToken = createId().replace(/-/g, "").slice(0, 16);
        } while (data.activeQueues.some((member) =>
          String(member.shareToken || "").toLowerCase() === nextToken.toLowerCase()
        ));

        rootQueue.shareToken = nextToken;
        try {
          await writeQueueData(data, true);
          document.getElementById("join-code-output").value = nextToken.toUpperCase();
          status.textContent = "New Join Code generated. Previous codes are no longer valid.";
        } catch (error) {
          rootQueue.shareToken = previousToken;
          try {
            localStorage.setItem(QUEUE_DATA_KEY, JSON.stringify(data));
          } catch (storageError) {
            console.error("Could not restore the previous queue state after a failed Join Code update.", storageError);
          }
          showMessage(status, error.message, false);
        }
      });
      document.getElementById("open-restart-modal").addEventListener("click", () => {
        restartDialog.showModal();
      });
      document.getElementById("open-jump-queue-modal").addEventListener("click", () => {
        document.getElementById("jump-queue-form").reset();
        document.getElementById("jump-queue-message").textContent = "";
        jumpDialog.showModal();
        document.getElementById("jump-queue-number").focus();
      });
      document.getElementById("cancel-jump-queue").addEventListener("click", () => {
        jumpDialog.close();
      });
      document.getElementById("jump-queue-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = document.getElementById("jump-queue-number");
        const jumpMessage = document.getElementById("jump-queue-message");
        const targetNumber = Number(input.value);
        if (!Number.isSafeInteger(targetNumber) || targetNumber < 1 || targetNumber >= Number.MAX_SAFE_INTEGER) {
          showMessage(jumpMessage, "Enter a whole ticket number greater than zero.", false);
          input.focus();
          return;
        }
        try {
          await refreshQueueDataFromMongo(true);
          data = ensureQueueData();
          const queue = getCurrentQueue();
          const group = queue && getQueueGroup(data, queue);
          if (!queue || !group) {
            showMessage(jumpMessage, "This queue is no longer available.", false);
            return;
          }
          const rootQueue = getRootQueue(data, queue);
          if ((rootQueue && rootQueue.id !== queue.id) || queue.ownerId !== getAdminId()) {
            showMessage(jumpMessage, "Only the owner of this queue can jump to a number.", false);
            return;
          }
          const targetTicket = ticketNumber(targetNumber).toUpperCase();
          if (data.activeQueues.some((member) =>
            member.id !== queue.id &&
            member.groupId === queue.groupId &&
            normalizeCustomerTicket(String(member.nowServing || "")) === targetTicket
          )) {
            showMessage(jumpMessage, `${targetTicket} is already being served at another window.`, false);
            input.focus();
            return;
          }
          const skippedCount = group.tickets.filter((ticket) => {
            const number = numericTicketPart(ticket.number);
            return number > 0 && number < targetNumber;
          }).length;
          group.tickets = group.tickets.filter((ticket) => {
            const number = numericTicketPart(ticket.number);
            return number === 0 || number > targetNumber;
          });
          group.tickets = group.tickets.filter((ticket) =>
            normalizeCustomerTicket(String(ticket.number || "")) !== targetTicket
          );
          group.jumpSequenceNext = targetNumber + 1;
          group.nextNumber = targetNumber + 1;
          syncQueueGroup(data, queue.groupId);
          queue.nowServing = targetTicket;
          await writeQueueData(data, true);
          renderMyQueue(data, queueId);
          jumpDialog.close();
          showMessage(message, skippedCount
            ? `Now serving ${targetTicket}. Skipped ${skippedCount} lower-numbered waiting ticket${skippedCount === 1 ? "" : "s"}.`
            : `Now serving ${targetTicket}.`, true);
        } catch (error) {
          showMessage(jumpMessage, error.message, false);
        }
      });
      document.getElementById("cancel-restart-queue").addEventListener("click", () => {
        restartDialog.close();
      });
      document.getElementById("confirm-restart-queue").addEventListener("click", () => {
        const queue = getCurrentQueue();
        if (!queue) {
          restartDialog.close();
          return;
        }
        const group = getQueueGroup(data, queue);
        group.tickets.splice(0, group.tickets.length);
        group.nextNumber = 1;
        data.activeQueues.filter((member) => member.groupId === queue.groupId).forEach((member) => {
          member.nowServing = "Not started";
          member.served = 0;
          member.noShow = 0;
        });
        syncQueueGroup(data, queue.groupId);
        try {
          writeQueueData(data);
          renderMyQueue(data, queue.id);
          showMessage(message, "Queue restarted. Completed-ticket history has been kept.", true);
        } catch (error) {
          showMessage(message, error.message, false);
        }
        restartDialog.close();
      });
      window.addEventListener("storage", (event) => {
        if (event.key === QUEUE_DATA_KEY) {
          try {
            data = ensureQueueData();
            const queue = getCurrentQueue();
            if (queue && ["Not started", "No customers waiting"].includes(queue.nowServing) && queue.tickets.length) {
              callNextTicket(data, queue);
            } else {
              renderMyQueue(data, queueId);
            }
          } catch (error) {
            showMessage(message, error.message, false);
          }
        }
      });
      window.setInterval(async () => {
        try {
          if (await refreshQueueDataFromMongo()) {
            data = ensureQueueData();
            const queue = getCurrentQueue();
            if (!queue) {
              showMessage(message, "The queue owner disconnected or signed out. Your joined window has been closed.", false);
              window.setTimeout(() => {
                window.location.href = "/dashboard";
              }, 3000);
              return;
            }
            if (queue && reconcileGroupAssignments(data, queue.groupId)) {
              await writeQueueData(data);
            }
            renderMyQueue(data, queueId);
          }
        } catch (error) {
          showMessage(message, `Could not refresh the shared queue: ${error.message}`, false);
        }
      }, 2000);
    }

function callNextTicket(data, queue) {
      assignNextTicket(data, queue);
      try {
        writeQueueData(data);
        renderMyQueue(data, queue.id);
      } catch (error) {
        showMessage(document.getElementById("queue-page-message"), error.message, false);
      }
    }

function initProfile() {
      if (!getAdminId()) {
        window.location.href = "/";
        return;
      }
      initializeAuthenticatedShell();
      const form = document.getElementById("profile-form");
      const message = document.getElementById("profile-message");
      let accounts;
      const adminId = getAdminId();
      try {
        accounts = readAccounts();
      } catch (error) {
        showMessage(message, error.message, false);
        return;
      }
      const account = accounts.find((item) => item.id === adminId);
      if (!account) {
        showMessage(message, "Your administrator account could not be found in this browser.", false);
        form.querySelector("button[type='submit']").disabled = true;
        return;
      }
      document.getElementById("profile-id").value = account.id;
      document.getElementById("profile-first-name").value = account.firstName || "";
      document.getElementById("profile-middle-name").value = account.middleName || "";
      document.getElementById("profile-last-name").value = account.lastName || "";
      document.getElementById("profile-email").value = account.email || "";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        account.firstName = document.getElementById("profile-first-name").value.trim();
        account.middleName = document.getElementById("profile-middle-name").value.trim();
        account.lastName = document.getElementById("profile-last-name").value.trim();
        account.email = document.getElementById("profile-email").value.trim();
        try {
          await writeAccounts(accounts);
          const name = [account.firstName, account.lastName].filter(Boolean).join(" ");
          document.querySelectorAll("#admin-name").forEach((element) => {
            element.textContent = name;
          });
          showMessage(message, "Profile updated.", true);
        } catch (error) {
          showMessage(message, error.message, false);
        }
      });
    }

function initRegister() {
  const form = document.getElementById("register-form");
  const message = document.getElementById("register-message");
  const submitButton = form.querySelector("button[type='submit']");

  const startResendCountdown = (seconds) => {
    const unlockAt = Date.now() + seconds * 1000;
    submitButton.disabled = true;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
      if (!remaining) {
        submitButton.disabled = false;
        submitButton.textContent = "Resend activation email";
        return;
      }
      submitButton.textContent = `Resend in ${remaining}s`;
      window.setTimeout(updateCountdown, 1000);
    };
    updateCountdown();
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }

    const formData = new FormData(form);
    const account = {
      id: String(formData.get("id")).trim(),
      firstName: String(formData.get("firstName")).trim(),
      middleName: String(formData.get("middleName")).trim(),
      lastName: String(formData.get("lastName")).trim(),
      email: String(formData.get("email")).trim()
    };

    submitButton.disabled = true;
    try {
      await mongoRequest("/api/register", "POST", account);
      showMessage(message, `Activation link sent to ${account.email}. You can request another in 30 seconds.`, true);
      startResendCountdown(30);
    } catch (error) {
      showMessage(message, error.message || "The activation email could not be sent.", false);
      if (error.status === 429) {
        startResendCountdown(error.details?.retryAfterSeconds || 30);
      } else {
        submitButton.disabled = false;
        submitButton.textContent = "Send activation email";
      }
    }
  });
}

async function initActivate() {
  const form = document.getElementById("activate-form");
  const message = document.getElementById("activate-message");
  const accountId = document.getElementById("account-id");
  const accountName = document.getElementById("account-name");
  const idInput = document.getElementById("activate-id");
  const activationToken = new URLSearchParams(window.location.search).get("token");
  let pendingAccount;

  try {
    pendingAccount = activationToken
      ? await mongoRequest(`/api/activation-details?token=${encodeURIComponent(activationToken)}`)
      : readPendingAccount();
  } catch (error) {
    accountId.textContent = "Not available";
    accountName.textContent = "Register first";
    showMessage(message, error.message, false);
    form.querySelector("button[type='submit']").disabled = true;
    form.querySelector("button[type='submit']").classList.add("button-disabled");
    return;
  }

  if (!pendingAccount) {
    accountId.textContent = "Not available";
    accountName.textContent = "Register first";
    showMessage(message, "No account is awaiting activation. Please register before continuing.", false);
    form.querySelector("button[type='submit']").disabled = true;
    form.querySelector("button[type='submit']").classList.add("button-disabled");
    return;
  }

  const fullName = [pendingAccount.firstName, pendingAccount.middleName, pendingAccount.lastName]
    .filter(Boolean)
    .join(" ");
  accountId.textContent = pendingAccount.id;
  accountName.textContent = fullName;
  idInput.value = pendingAccount.id;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passwordInput = document.getElementById("new-password");
    const confirmInput = document.getElementById("confirm-password");
    const password = passwordInput.value;
    const confirmation = confirmInput.value;
    const tooShort = password.length < 8;
    markInvalid(passwordInput, tooShort);
    markInvalid(confirmInput, password !== confirmation || !confirmation);

    if (tooShort) {
      showMessage(message, "Use a password with at least 8 characters.", false);
      passwordInput.focus();
      return;
    }
    if (password !== confirmation) {
      showMessage(message, "The passwords do not match.", false);
      confirmInput.focus();
      return;
    }

    try {
      if (activationToken) {
        await mongoRequest("/api/activate", "POST", { token: activationToken, password });
        window.location.href = "/?activated=1";
        return;
      }
      const accounts = readAccounts();
      const passwordHash = await hashPassword(password);
      const account = { ...pendingAccount, passwordHash };
      const existingIndex = accounts.findIndex((savedAccount) =>
        savedAccount.id.toLowerCase() === account.id.toLowerCase()
      );
      if (existingIndex >= 0) {
        accounts[existingIndex] = account;
      } else {
        accounts.push(account);
      }
      await writeAccounts(accounts);
      await clearPendingAccount();
      window.location.href = "/?activated=1";
    } catch (error) {
      showMessage(message, error.message, false);
    }
  });
}

async function initPasswordReset() {
  const form = document.getElementById("password-reset-form");
  const message = document.getElementById("password-reset-message");
  const accountId = document.getElementById("reset-account-id");
  const token = new URLSearchParams(window.location.search).get("token");
  const submitButton = form.querySelector("button[type='submit']");
  if (!token) {
    showMessage(message, "This password reset link is missing its token. Request a new link from the sign-in page.", false);
    submitButton.disabled = true;
    return;
  }

  try {
    const details = await mongoRequest(`/api/password-reset-details?token=${encodeURIComponent(token)}`);
    accountId.textContent = `Resetting password for administrator ID ${details.id}.`;
    accountId.classList.add("success");
  } catch (error) {
    showMessage(message, error.message, false);
    submitButton.disabled = true;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passwordInput = document.getElementById("reset-new-password");
    const confirmInput = document.getElementById("reset-confirm-password");
    const password = passwordInput.value;
    const confirmation = confirmInput.value;
    const tooShort = password.length < 8;
    markInvalid(passwordInput, tooShort);
    markInvalid(confirmInput, password !== confirmation || !confirmation);

    if (tooShort) {
      showMessage(message, "Use a password with at least 8 characters.", false);
      passwordInput.focus();
      return;
    }
    if (password !== confirmation) {
      showMessage(message, "The passwords do not match.", false);
      confirmInput.focus();
      return;
    }

    submitButton.disabled = true;
    try {
      await mongoRequest("/api/password-reset", "POST", { token, password });
      window.location.href = "/?passwordReset=1";
    } catch (error) {
      showMessage(message, error.message, false);
      submitButton.disabled = false;
    }
  });
}

function createDisplayServicePanel(queue, panelType, windowOrder, numberChangeState, onNumberChange) {
  const panel = document.createElement("section");
  const serviceClass = queue.service.toLowerCase() === "cashier" ? "service-cashier" : "service-registrar";
  panel.className = `display-service-panel ${panelType} ${serviceClass} window-order-${windowOrder}`;
  const serviceLabel = document.createElement("p");
  serviceLabel.className = "eyebrow display-service-label";
  serviceLabel.textContent = queue.service.toUpperCase();
  const windowList = document.createElement("div");
  windowList.className = "display-window-list";
  const card = document.createElement("article");
  card.className = "display-window-card";
  card.dataset.queueId = queue.id;
  const currentNumber = queue.nowServing || "Not started";
  let numberState = numberChangeState?.get(queue.id);
  if (numberChangeState && !numberState) {
    numberState = { lastNumber: currentNumber, timeoutId: null, currentCard: card };
    numberChangeState.set(queue.id, numberState);
  } else if (numberState && numberState.lastNumber !== currentNumber) {
    window.clearTimeout(numberState.timeoutId);
    numberState.lastNumber = currentNumber;
    if (onNumberChange) onNumberChange();
    numberState.timeoutId = window.setTimeout(() => {
      numberState.currentCard?.classList.remove("ticket-number-changed");
      numberState.timeoutId = null;
    }, 5000);
  }
  if (numberState) numberState.currentCard = card;
  if (numberState?.timeoutId) {
    card.classList.add("ticket-number-changed");
  }
  const ticketLabel = document.createElement("p");
  ticketLabel.className = "display-ticket-label";
  ticketLabel.textContent = "Ticket";
  const number = document.createElement("p");
  number.className = "display-number";
  number.textContent = currentNumber;
  const windowName = document.createElement("p");
  windowName.className = "display-window";
  windowName.textContent = queue.displayLabel || queue.window;
  card.append(ticketLabel, number, windowName, serviceLabel);
  windowList.append(card);
  panel.append(windowList);
  return panel;
}

function buildCustomerDisplay(data, queue, container, numberChangeState = null, onNumberChange = null) {
  const activeQueues = [queue, ...getDisplayMembers(data, queue)
    .filter((member) => member.displayEnabled)];
  const serviceCounts = activeQueues.reduce((counts, item) => {
    counts[item.service] = (counts[item.service] || 0) + 1;
    return counts;
  }, {});
  activeQueues.sort((left, right) =>
    serviceCounts[right.service] - serviceCounts[left.service] ||
    (left.service === right.service
      ? left.window.localeCompare(right.window, undefined, { numeric: true })
      : left.service === "Cashier" ? -1 : 1)
  );
  container.replaceChildren();
  container.classList.remove("window-count-1", "window-count-2", "window-count-3", "window-count-4");
  container.classList.add(`window-count-${Math.min(activeQueues.length, 4)}`);
  const displayTopBar = document.createElement("div");
  displayTopBar.className = "display-top-bar";
  const displayHeading = document.createElement("h1");
  displayHeading.className = "display-status-bar";
  displayHeading.textContent = "NOW SERVING";
  displayTopBar.append(displayHeading);
  container.append(displayTopBar);
  activeQueues.forEach((activeQueue, index) => {
    const windowOrder = activeQueues
      .filter((item) => item.service === activeQueue.service)
      .findIndex((item) => item.id === activeQueue.id) + 1;
    container.append(createDisplayServicePanel(
      activeQueue,
      `active-window-${index + 1}`,
      windowOrder,
      numberChangeState,
      onNumberChange
    ));
  });
  const sharedQr = document.createElement("div");
  sharedQr.className = "display-shared-qr";
  const qr = document.createElement("img");
  qr.alt = "QR code to select a service and join a queue";
  const customerUrl = new URL("/customer", window.location.origin);
  qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(customerUrl.href)}`;
  const customerLink = document.createElement("a");
  customerLink.className = "display-qr-link";
  customerLink.href = customerUrl.href;
  customerLink.target = "_blank";
  customerLink.rel = "noopener";
  customerLink.setAttribute("aria-label", "Open the customer ticket form in a new tab");
  customerLink.append(qr);
  const caption = document.createElement("p");
  caption.textContent = "Scan or click to select a service and check your ticket";
  sharedQr.append(customerLink, caption);
  container.append(sharedQr);
}

function buildDisplayPreview(data, queue, previewId = "display-preview") {
  const preview = document.getElementById(previewId);
  if (preview) buildCustomerDisplay(data, queue, preview);
}

function initDisplaySettings() {
  if (!getAdminId()) {
    window.location.href = "/";
    return;
  }
  initializeAuthenticatedShell();
  const message = document.getElementById("display-settings-message");
  const requestedQueueId = new URLSearchParams(window.location.search).get("queue");
  let data;
  let queue;
  try {
    data = ensureQueueData();
    const ownQueues = getOwnQueues(data);
    queue = ownQueues.find((item) => item.id === requestedQueueId) || ownQueues[0];
  } catch (error) {
    showMessage(message, error.message, false);
    return;
  }
  if (!queue) {
    showMessage(message, "You do not have an active queue. Start a queue before setting up its display.", false);
    document.getElementById("display-preview").hidden = true;
    return;
  }
  if (reconcileGroupAssignments(data, queue.groupId)) writeQueueData(data);
  const refreshDisplayPreview = () => {
    try {
      data = ensureQueueData();
      queue = getQueueById(data, queue.id);
      if (!queue) {
        showMessage(message, "This queue is no longer available.", false);
        return;
      }
      if (reconcileGroupAssignments(data, queue.groupId)) writeQueueData(data);
      buildDisplayPreview(data, queue);
    } catch (error) {
      showMessage(message, error.message, false);
    }
  };
  buildDisplayPreview(data, queue);
  window.addEventListener("storage", (event) => {
    if (event.key === QUEUE_DATA_KEY) refreshDisplayPreview();
  });
  window.setInterval(async () => {
    try {
      if (await refreshQueueDataFromMongo()) refreshDisplayPreview();
    } catch (error) {
      showMessage(message, `Could not refresh the shared queue: ${error.message}`, false);
    }
  }, 2500);
}

function initDisplay() {
  const params = new URLSearchParams(window.location.search);
  const queueId = params.get("queue");
  const message = document.getElementById("display-message");

  let displayOwnerId = "";
  let heartbeatId;
  let closeTimeoutId;
  let refreshIntervalId;
  let displayEnded = false;
  let soundEnabled = false;
  let soundUnlockInProgress = false;
  const callSound = new Audio("/QueueSound.mp3");
  callSound.preload = "auto";
  const volumeSlider = document.getElementById("display-volume-slider");
  const volumeValue = document.getElementById("display-volume-value");
  const volumeToggle = document.getElementById("display-volume-toggle");
  const volumePanel = document.getElementById("display-volume-panel");
  const savedVolume = Number(localStorage.getItem("schoolQueueTracker.displayVolume"));
  const initialVolume = Number.isFinite(savedVolume) ? Math.min(100, Math.max(0, savedVolume)) : 100;
  callSound.volume = initialVolume / 100;
  volumeSlider.value = String(initialVolume);
  volumeValue.value = `${initialVolume}%`;
  volumeToggle.addEventListener("click", () => {
    const expanded = volumeToggle.getAttribute("aria-expanded") === "true";
    volumeToggle.setAttribute("aria-expanded", String(!expanded));
    volumePanel.hidden = expanded;
    if (!expanded) unlockCallSound();
  });
  volumeSlider.addEventListener("input", () => {
    const volume = Number(volumeSlider.value);
    callSound.volume = volume / 100;
    volumeValue.value = `${volume}%`;
    localStorage.setItem("schoolQueueTracker.displayVolume", String(volume));
  });
  volumeSlider.addEventListener("pointerdown", unlockCallSound);
  volumeSlider.addEventListener("keydown", unlockCallSound);
  const numberChangeState = new Map();
  const displaySessionId = createId();
  const displaySessionKey = `${DISPLAY_SESSION_PREFIX}${displaySessionId}`;
  const unregisterDisplay = () => {
    window.clearInterval(heartbeatId);
    window.clearInterval(refreshIntervalId);
    window.clearTimeout(closeTimeoutId);
    numberChangeState.forEach((state) => window.clearTimeout(state.timeoutId));
    numberChangeState.clear();
    localStorage.removeItem(displaySessionKey);
  };
  const showClosedMessage = (reason) => {
    unregisterDisplay();
    document.body.replaceChildren();
    const message = document.createElement("main");
    message.className = "display-main";
    const heading = document.createElement("h1");
    heading.textContent = "Queue display closed";
    const description = document.createElement("p");
    description.className = "dashboard-subtitle";
    description.textContent = reason;
    message.append(heading, description);
    document.body.append(message);
  };
  const closeDisplay = (reason) => {
    if (displayEnded) return;
    displayEnded = true;
    unregisterDisplay();
    window.close();
    closeTimeoutId = window.setTimeout(() => {
      if (!window.closed) {
        showClosedMessage(reason);
        closeTimeoutId = window.setTimeout(() => {
          window.location.replace("/");
        }, 3000);
      }
    }, 150);
  };
  const registerDisplay = () => {
    if (!displayOwnerId) return;
    localStorage.setItem(displaySessionKey, JSON.stringify({
      ownerId: displayOwnerId,
      queueId,
      updatedAt: Date.now()
    }));
  };
  async function unlockCallSound() {
    if (soundEnabled || soundUnlockInProgress) return;
    soundUnlockInProgress = true;
    const previousMuted = callSound.muted;
    try {
      callSound.muted = true;
      await callSound.play();
      callSound.pause();
      callSound.currentTime = 0;
      callSound.muted = previousMuted;
      soundEnabled = true;
    } catch (error) {
      callSound.muted = previousMuted;
      if (error.name !== "NotAllowedError") {
        console.error(`Could not enable the customer display call sound: ${error.message}`);
      }
    } finally {
      soundUnlockInProgress = false;
    }
  }
  const playCallSound = async () => {
    if (!soundEnabled) return;
    try {
      callSound.currentTime = 0;
      await callSound.play();
    } catch (error) {
      if (error.name !== "NotAllowedError") {
        console.error(`Could not play the customer display call sound: ${error.message}`);
      }
    }
  };
  const handleCloseRequest = (event) => {
    if (event.key !== DISPLAY_CLOSE_KEY || !event.newValue) return;
    try {
      const request = JSON.parse(event.newValue);
      if (request.ownerId !== displayOwnerId) return;
      closeDisplay("The administrator closed the queue display.");
    } catch (error) {
      showMessage(message, "The display could not process the close request. Close this tab manually.", false);
    }
  };
  const refresh = () => {
    try {
      const data = ensureQueueData();
      const queue = getQueueById(data, queueId);
      if (!queue) {
        closeDisplay("The queue has ended. This display will now close.");
        return;
      }
      if (reconcileGroupAssignments(data, queue.groupId)) writeQueueData(data);
      displayOwnerId = queue.ownerId;
      registerDisplay();
      buildCustomerDisplay(
        data,
        queue,
        document.getElementById("display-service-panels"),
        numberChangeState,
        playCallSound
      );
      document.title = `${queue.window} | Queue display`;
    } catch (error) {
      showMessage(message, error.message, false);
    }
  };
  refresh();
  if (displayEnded) return;
  heartbeatId = window.setInterval(registerDisplay, 2000);
  window.addEventListener("pagehide", unregisterDisplay, { once: true });
  window.addEventListener("storage", (event) => {
    if (event.key === QUEUE_DATA_KEY) refresh();
    handleCloseRequest(event);
  });
  refreshIntervalId = window.setInterval(async () => {
    if (displayEnded) return;
    try {
      await refreshQueueDataFromMongo();
      refresh();
    } catch (error) {
      showMessage(message, `Could not refresh the shared queue: ${error.message}`, false);
    }
  }, 2500);
}

function normalizeCustomerTicket(input) {
  const value = input.trim().toUpperCase();
  const match = value.match(/^(?:#|[A-Z]-?)?(\d+)$/);
  return match ? ticketNumber(Number(match[1])) : value;
}

function initCustomer() {
  const form = document.getElementById("customer-form");
  const message = document.getElementById("customer-message");
  const queueId = new URLSearchParams(window.location.search).get("queue");
  if (queueId) {
    try {
      const queue = getQueueById(ensureQueueData(), queueId);
      if (queue) {
        document.getElementById("customer-service").value = queue.service;
      }
    } catch (error) {
      showMessage(message, error.message, false);
    }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const service = document.getElementById("customer-service").value;
    const ticket = normalizeCustomerTicket(document.getElementById("customer-number").value);
    if (!ticket) {
      showMessage(message, "Enter your ticket number.", false);
      return;
    }
    try {
      await refreshQueueDataFromMongo(true);
      const data = ensureQueueData();
      let queue = queueId ? getQueueById(data, queueId) : null;
      if (!queue || queue.service !== service) {
        queue = data.activeQueues.find((candidate) => candidate.service === service);
      }
      if (!queue) {
        showMessage(message, `There is no active ${service} queue right now.`, false);
        return;
      }
      const group = getQueueGroup(data, queue);
      const alreadyServing = data.activeQueues.some((member) =>
        member.groupId === queue.groupId &&
        String(member.nowServing || "").toUpperCase() === ticket
      );
      const alreadyWaiting = group.tickets.some((item) => item.number.toUpperCase() === ticket);
      const alreadyCompleted = group.completedTickets.some((item) =>
        String(item.number || "").toUpperCase() === ticket
      );
      if (alreadyCompleted) {
        showMessage(message, "This ticket has already been completed in this queue.", false);
        return;
      }
      if (!alreadyServing && !alreadyWaiting) {
        group.tickets.push({ number: ticket, status: "waiting", joinedAt: new Date().toISOString() });
        group.nextNumber = Math.max(group.nextNumber, numericTicketPart(ticket) + 1);
        syncQueueGroup(data, queue.groupId);
        await writeQueueData(data);
      }
      const ticketUrl = new URL("/my-ticket", window.location.origin);
      ticketUrl.searchParams.set("queue", queue.id);
      ticketUrl.searchParams.set("number", ticket);
      window.location.href = ticketUrl.href;
    } catch (error) {
      showMessage(message, error.message, false);
    }
  });
}

function updateTicketStatus() {
  const params = new URLSearchParams(window.location.search);
  const queueId = params.get("queue");
  const number = (params.get("number") || "").toUpperCase();
  const message = document.getElementById("ticket-message");
  document.getElementById("ticket-number").textContent = number || "—";

  try {
    const data = ensureQueueData();
    const queue = getQueueById(data, queueId);
    if (!queue || !number) {
      showMessage(message, "Ticket details were not found. Please scan the queue QR code and try again.", false);
      return;
    }
    document.getElementById("ticket-service").textContent = `${queue.service} · ${queue.window}`;
    document.getElementById("ticket-window").textContent = `Serving window: ${queue.window}`;
    document.getElementById("ticket-now-serving").textContent = queue.nowServing || "Not started";
    document.getElementById("ticket-serving-window").textContent = queue.window;

    const group = getQueueGroup(data, queue);
    const servingQueue = data.activeQueues.find((member) =>
      member.groupId === queue.groupId &&
      String(member.nowServing || "").toUpperCase() === number
    );
    const waitingIndex = group.tickets.findIndex((ticket) => ticket.number.toUpperCase() === number);
    const completed = [...group.completedTickets].reverse()
      .find((ticket) => String(ticket.number || "").toUpperCase() === number);
    if (completed) {
      document.getElementById("ticket-wait-time").textContent = completed.status === "served" ? "Complete" : "No show";
      document.getElementById("ticket-ahead-count").textContent = completed.status === "served" ? "Your service is complete" : "Please contact the service desk";
    } else if (servingQueue) {
      document.getElementById("ticket-wait-time").textContent = "Now";
      document.getElementById("ticket-ahead-count").textContent = `You are being called at ${servingQueue.window}`;
    } else {
      const ahead = waitingIndex >= 0 ? waitingIndex : group.tickets.length;
      const estimatedMinutes = (ahead + 1) * 5;
      document.getElementById("ticket-wait-time").textContent = `${estimatedMinutes} min`;
      document.getElementById("ticket-ahead-count").textContent = `${ahead} ticket${ahead === 1 ? "" : "s"} ahead`;
    }
    document.title = `Ticket ${number} | School Queue Tracker`;
  } catch (error) {
    showMessage(message, error.message, false);
  }
}

function initPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      button.setAttribute("aria-pressed", String(visible));
      const label = input.id === "login-password"
        ? "password"
        : input.id === "new-password" ? "new password" : "confirm password";
      button.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${label}`);
      button.classList.toggle("is-visible", visible);
    });
  });
}

async function initializeApplication() {
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
  initPasswordToggles();
  localStorage.removeItem(REMEMBERED_ADMIN_KEY);
  const page = document.body.dataset.page;
  try {
    await hydrateMongoStorage();
  } catch (error) {
    console.error(error);
    const message = document.querySelector(".form-message");
    if (message) {
      showMessage(message, `Could not connect to MongoDB. Start the app with npm start and check MongoDB is running. ${error.message}`, false);
    }
    return;
  }

  if (page === "login") {
    initLogin();
    if (new URLSearchParams(window.location.search).has("activated")) {
      showMessage(document.getElementById("login-message"), "Your account is activated. Sign in with your new password.", true);
    } else if (new URLSearchParams(window.location.search).has("passwordReset")) {
      showMessage(document.getElementById("login-message"), "Your password has been reset. Sign in with your new password.", true);
    }
  } else if (page === "register") {
    initRegister();
  } else if (page === "activate") {
    initActivate();
  } else if (page === "reset-password") {
    await initPasswordReset();
  } else if (page === "dashboard") {
    initDashboard();
  } else if (page === "queue-setup") {
    initQueueSetup();
  } else if (page === "my-queue") {
    initMyQueue();
  } else if (page === "profile") {
    initProfile();
  } else if (page === "display-settings") {
    initDisplaySettings();
  } else if (page === "display") {
    initDisplay();
  } else if (page === "customer") {
    initCustomer();
  } else if (page === "my-ticket") {
    updateTicketStatus();
    window.addEventListener("storage", (event) => {
      if (event.key === QUEUE_DATA_KEY) updateTicketStatus();
    });
    window.setInterval(async () => {
      try {
        await refreshQueueDataFromMongo();
        updateTicketStatus();
      } catch (error) {
        console.error(`Could not refresh the shared queue: ${error.message}`);
      }
    }, 2500);
  }
}

export { initializeApplication };
