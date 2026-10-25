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

    <main class="app-content setup-main">
    <a class="back-link" href="/dashboard">← Dashboard</a>
    <section class="setup-card">
      <div class="setup-heading">
        <span class="setup-step">QUEUE SETUP</span>
        <h1 id="queue-setup-title">Start a queue</h1>
        <p id="queue-setup-description">Choose a service and its assigned window for a fresh queue.</p>
      </div>
      <form id="join-code-form" class="join-code-form" novalidate>
        <label for="join-queue-code">Input Code to Join Queue</label>
        <div class="join-code-row">
          <input id="join-queue-code" name="joinCode" type="text" autocomplete="off" autocapitalize="characters" maxlength="16" placeholder="Enter join code" required>
          <button class="button button-secondary" type="submit">Join</button>
        </div>
        <p id="join-code-message" class="field-hint" role="status" aria-live="polite"></p>
      </form>
      <form id="queue-form" class="setup-form" novalidate>
        <label for="service-type">Service type</label>
        <select id="service-type" name="service" required>
          <option value="" selected disabled>Select a service</option>
          <option value="Cashier">Cashier</option>
          <option value="Registrar">Registrar</option>
        </select>

        <label for="service-window">Service window</label>
        <select id="service-window" name="window" required>
          <option value="" selected disabled>Select a service first</option>
        </select>
        <p id="queue-setup-hint" class="field-hint">Cashier uses Windows 1–2. Registrar uses Windows 3–4.</p>

        <p id="queue-message" class="form-message" role="status" aria-live="polite"></p>
        <button id="queue-submit-button" class="button button-primary setup-submit" type="submit">Start queue <span aria-hidden="true">→</span></button>
      </form>
      <p class="static-note">To join a shared queue, enter the Join Code provided by its owner.</p>
    </section>
    </main>
  </div>
</template>
