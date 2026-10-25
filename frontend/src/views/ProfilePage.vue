<template>
<div class="app-layout">
    <aside class="sidebar">
      <a class="brand app-brand" href="/dashboard" aria-label="School Queue Tracker dashboard">
        <img class="brand-logo" src="/Logo.png" alt="">
        <span>School Queue Tracker</span>
      </a>
      <nav class="side-nav" aria-label="Main navigation">
        <a class="side-link" href="/dashboard"><span aria-hidden="true">▦</span> Dashboard</a>
        <a class="side-link" href="/my-queue"><span aria-hidden="true">☷</span> My Queue</a>
        <a class="side-link active" href="/profile"><span aria-hidden="true">◉</span> Profile</a>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-user"><span class="avatar" aria-hidden="true">A</span><span><strong id="admin-name">Administrator</strong><small>Administrator</small></span></div>
        <button class="side-link logout-link" type="button" data-logout><span aria-hidden="true">↪</span> Logout</button>
      </div>
    </aside>
    <main class="app-content profile-main">
      <section class="dashboard-heading">
        <div><p class="eyebrow">ACCOUNT SETTINGS</p><h1>Profile</h1><p class="dashboard-subtitle">View and update your administrator details.</p></div>
      </section>
      <section class="setup-card profile-card">
        <div class="profile-avatar" aria-hidden="true">A</div>
        <form id="profile-form" class="setup-form" novalidate>
          <label for="profile-id">Administrator ID</label>
          <input id="profile-id" type="text" readonly>
          <label for="profile-first-name">First name</label>
          <input id="profile-first-name" name="firstName" required>
          <label for="profile-middle-name">Middle name <span class="optional">(optional)</span></label>
          <input id="profile-middle-name" name="middleName">
          <label for="profile-last-name">Last name</label>
          <input id="profile-last-name" name="lastName" required>
          <label for="profile-email">Email address</label>
          <input id="profile-email" name="email" type="email" required>
          <p id="profile-message" class="form-message" role="status" aria-live="polite"></p>
          <button class="button button-primary setup-submit" type="submit">Save changes</button>
        </form>
      </section>
    </main>
  </div>
</template>
