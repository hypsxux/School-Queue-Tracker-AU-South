<template>
<div class="app-layout">
    <aside class="sidebar">
      <a class="brand app-brand" href="/dashboard" aria-label="School Queue Tracker dashboard">
        <img class="brand-logo" src="/Logo.png" alt="">
        <span>School Queue Tracker</span>
      </a>
      <nav class="side-nav" aria-label="Main navigation">
        <a class="side-link" href="/dashboard"><span aria-hidden="true">▦</span> Dashboard</a>
        <a class="side-link active" href="/my-queue"><span aria-hidden="true">☷</span> My Queue</a>
        <a class="side-link" href="/profile"><span aria-hidden="true">◉</span> Profile</a>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-user"><span class="avatar" aria-hidden="true">A</span><span><strong id="admin-name">Administrator</strong><small>Administrator</small></span></div>
        <button class="side-link logout-link" type="button" data-logout><span aria-hidden="true">↪</span> Logout</button>
      </div>
    </aside>

    <main class="app-content my-queue-main">
      <section class="dashboard-heading">
        <div>
          <p class="eyebrow">QUEUE MANAGEMENT</p>
          <h1>My Queue</h1>
          <p class="dashboard-subtitle">Manage your service window and call the next customer.</p>
        </div>
        <div class="queue-heading-actions">
          <button id="open-share-modal" class="button button-primary start-button" type="button">Share</button>
        </div>
      </section>
      <p id="queue-page-message" class="form-message" role="status" aria-live="polite"></p>

      <section class="current-serving-card">
        <div>
          <span class="serving-window-label">NOW SERVING</span>
          <h2 id="current-serving-number">—</h2>
          <p><span id="current-service-name">—</span><span class="serving-separator">·</span><span id="current-window-name">—</span></p>
        </div>
        <div class="serving-actions">
          <div id="serving-outcome-buttons" class="serving-outcome-buttons">
            <button id="mark-served-button" class="button button-primary" type="button">Served</button>
            <button id="mark-no-show-button" class="button button-secondary" type="button">No Show</button>
          </div>
          <button id="start-queue-button" class="button button-primary start-queue-button" type="button" hidden>Start the Queue</button>
          <div class="queue-management-actions">
            <button id="open-jump-queue-modal" class="button button-secondary restart-queue-button" type="button">Jump to number</button>
            <button id="open-restart-modal" class="button button-secondary restart-queue-button" type="button">Restart queue</button>
          </div>
        </div>
      </section>

      <section class="queue-stats-grid" aria-label="Queue statistics">
        <article class="queue-stat-card"><span class="queue-stat-symbol waiting-symbol" aria-hidden="true">◷</span><div><span>Waiting</span><strong id="queue-waiting-count">0</strong></div></article>
        <article class="queue-stat-card"><span class="queue-stat-symbol served-symbol" aria-hidden="true">✓</span><div><span>Served</span><strong id="queue-served-count">0</strong></div></article>
        <article class="queue-stat-card"><span class="queue-stat-symbol noshow-symbol" aria-hidden="true">–</span><div><span>No show</span><strong id="queue-noshow-count">0</strong></div></article>
      </section>

      <section class="dashboard-panel history-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">COMPLETED TICKETS</p><h2>Queue history</h2></div>
        </div>
        <div class="history-table-wrap">
          <table class="history-table">
            <thead><tr><th>Ticket number</th><th>Status</th><th>Date</th><th>Time</th></tr></thead>
            <tbody id="queue-history-body"></tbody>
          </table>
          <p id="empty-history-message" class="empty-state">No completed tickets yet.</p>
        </div>
        <nav id="queue-history-pagination" class="history-pagination" aria-label="Queue history pages" hidden>
          <button id="queue-history-previous" class="button button-secondary" type="button">Previous</button>
          <span id="queue-history-page-label" aria-live="polite"></span>
          <button id="queue-history-next" class="button button-secondary" type="button">Next page</button>
        </nav>
      </section>
      <p class="static-note">Static demo: queue actions are saved in this browser. Live multi-device updates require a server connection.</p>
    </main>
  </div>

  <dialog id="share-queue-dialog" class="outcome-dialog queue-action-dialog share-queue-dialog">
    <form method="dialog"><button class="dialog-close" aria-label="Close" value="cancel">×</button></form>
    <div class="share-dialog-intro">
      <p class="eyebrow">QUEUE SHARING</p>
      <h2>Share your queue</h2>
      <p class="queue-action-copy">Give this code to another administrator. They can enter it in Queue Setup to join the shared ticket line.</p>
    </div>
    <section class="share-display-preview-section" aria-label="Customer display preview">
      <div class="panel-heading">
        <div><p class="eyebrow">PREVIEW ONLY</p><h3>Customer display</h3></div>
        <span class="live-pill">Preview</span>
      </div>
      <div id="share-display-preview" class="display-preview customer-display-preview"></div>
      <a id="open-customer-display-preview" class="button button-secondary customer-display-open-button" target="_blank" rel="noopener" href="/display">Open Customer Display in new tab</a>
    </section>
    <div class="share-dialog-details">
      <div id="share-link-panel" class="share-link-panel">
        <label for="join-code-output">Join Code</label>
        <div class="share-link-row"><input id="join-code-output" readonly><button id="copy-join-code" class="button button-outline" type="button">Copy</button></div>
        <button id="generate-join-code" class="button button-secondary generate-join-code-button" type="button">Generate new code</button>
        <p id="share-copy-message" class="field-hint" role="status" aria-live="polite"></p>
      </div>
      <div class="share-members-table-wrap">
        <h3>Administrators using this code</h3>
        <table class="history-table share-members-table">
          <thead><tr><th>Administrator ID</th><th>Service</th><th>Window</th><th>Action</th></tr></thead>
          <tbody id="share-members-body"></tbody>
        </table>
        <p id="share-members-empty" class="empty-state">No other windows have joined this queue.</p>
      </div>
    </div>
  </dialog>
  <p id="share-copy-toast" class="share-copy-toast" role="status" aria-live="polite" hidden></p>

  <dialog id="restart-queue-dialog" class="outcome-dialog queue-action-dialog">
    <form method="dialog"><button class="dialog-close" aria-label="Close" value="cancel">×</button></form>
    <p class="eyebrow">RESTART QUEUE</p>
    <h2>Restart this queue?</h2>
    <p class="queue-action-copy">This clears the current ticket line and resets the serving number to #1. The completed-ticket history below will be kept.</p>
    <div class="outcome-buttons">
      <button id="confirm-restart-queue" class="button button-primary" type="button">Yes, restart queue</button>
      <button id="cancel-restart-queue" class="button button-secondary" type="button">Cancel</button>
    </div>
  </dialog>
  <dialog id="jump-queue-dialog" class="outcome-dialog queue-action-dialog">
    <form method="dialog"><button class="dialog-close" aria-label="Close" value="cancel">×</button></form>
    <p class="eyebrow">JUMP QUEUE</p>
    <h2>Jump to queue number</h2>
    <p class="queue-action-copy">Enter any whole ticket number to call next, including one already completed in this queue. After this call is completed, the queue continues with the next number in sequence. Existing waiting tickets do not interrupt this sequence; numbers already being served at another window are skipped.</p>
    <form id="jump-queue-form" class="setup-form" novalidate>
      <label for="jump-queue-number">Ticket number</label>
      <input id="jump-queue-number" type="number" min="1" step="1" inputmode="numeric" required placeholder="For example, 25">
      <p id="jump-queue-message" class="form-message" role="status" aria-live="polite"></p>
      <div class="outcome-buttons">
        <button id="confirm-jump-queue" class="button button-primary" type="submit">Jump to number</button>
        <button id="cancel-jump-queue" class="button button-secondary" type="button">Cancel</button>
      </div>
    </form>
  </dialog>
</template>
