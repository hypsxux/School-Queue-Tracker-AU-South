<template>
<header class="customer-header"><a class="brand app-brand" href="/customer"><img class="brand-logo" src="/Logo.png" alt=""><span>School Queue Tracker</span></a></header>
  <main class="customer-main">
    <section class="setup-card">
      <p class="eyebrow">CUSTOMER QUEUE CHECK</p>
      <h1>Check your ticket</h1>
      <p class="customer-intro">Choose the service printed on your ticket, then enter the ticket number you are holding.</p>
      <form id="customer-form" class="setup-form" novalidate>
        <label for="customer-service">Service type</label>
        <select id="customer-service" required>
          <option value="" selected disabled>Select Cashier or Registrar</option>
          <option value="Cashier">Cashier</option>
          <option value="Registrar">Registrar</option>
        </select>
        <label for="customer-number">Ticket number</label>
        <input id="customer-number" type="text" required placeholder="Enter the number printed on your ticket" autocomplete="off">
        <p id="customer-message" class="form-message" role="status" aria-live="polite"></p>
        <button class="button button-primary setup-submit" type="submit">Confirm <span aria-hidden="true">→</span></button>
      </form>
      <p class="static-note">Your ticket status and place in line will appear after you confirm.</p>
    </section>
  </main>
</template>
