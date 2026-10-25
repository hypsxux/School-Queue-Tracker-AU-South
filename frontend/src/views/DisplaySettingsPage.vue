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

    <main class="app-content display-settings-main">
      <a class="back-link" href="/my-queue">← My Queue</a>
      <section class="dashboard-heading">
        <div>
          <p class="eyebrow">MY QUEUE · DISPLAY</p>
          <h1>Customer display preview</h1>
          <p class="dashboard-subtitle">Preview only. Share your queue to manage its invitation link.</p>
        </div>
      </section>
      <p id="display-settings-message" class="form-message" role="status" aria-live="polite"></p>

      <section class="display-preview-section">
        <div class="panel-heading">
          <div><p class="eyebrow">PREVIEW ONLY</p><h2>Customer display</h2></div>
          <span class="live-pill">Preview</span>
        </div>
        <div id="display-preview" class="display-preview customer-display-preview"></div>
      </section>
    </main>
  </div>
</template>
