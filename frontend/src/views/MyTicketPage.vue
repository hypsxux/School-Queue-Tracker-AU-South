<template>
<header class="customer-header"><a class="brand app-brand" href="/customer"><img class="brand-logo" src="/Logo.png" alt=""><span>School Queue Tracker</span></a></header>
  <main class="ticket-main">
    <p class="eyebrow">YOUR QUEUE TICKET</p>
    <h1>My Ticket</h1>
    <p id="ticket-service" class="ticket-service">—</p>
    <section class="ticket-number-card">
      <span>YOUR NUMBER</span>
      <strong id="ticket-number">—</strong>
      <small id="ticket-window">—</small>
    </section>
    <section class="ticket-status-grid">
      <article class="ticket-status-card"><span>Now serving</span><strong id="ticket-now-serving">—</strong><small id="ticket-serving-window">—</small></article>
      <article class="ticket-status-card"><span>Estimated wait</span><strong id="ticket-wait-time">—</strong><small id="ticket-ahead-count">—</small></article>
    </section>
    <p id="ticket-message" class="static-note" role="status" aria-live="polite"></p>
    <a class="button button-secondary ticket-back" href="/customer">Check another ticket</a>
  </main>
</template>
