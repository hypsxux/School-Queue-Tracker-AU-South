<template>
<div class="app-layout">
    <aside class="sidebar">
      <a class="brand app-brand" href="/dashboard" aria-label="School Queue Tracker dashboard">
        <img class="brand-logo" src="/Logo.png" alt="">
        <span>School Queue Tracker</span>
      </a>
      <nav class="side-nav" aria-label="Main navigation">
        <a class="side-link active" href="/dashboard"><span aria-hidden="true">▦</span> Dashboard</a>
        <a class="side-link" href="/my-queue"><span aria-hidden="true">☷</span> My Queue</a>
        <a class="side-link" href="/profile"><span aria-hidden="true">◉</span> Profile</a>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-user"><span class="avatar" aria-hidden="true">A</span><span><strong id="admin-name">Administrator</strong><small>Administrator</small></span></div>
        <button id="logout-button" class="side-link logout-link" type="button"><span aria-hidden="true">↪</span> Logout</button>
      </div>
    </aside>

    <main class="app-content dashboard-main">
    <section class="dashboard-heading">
      <div>
        <p class="eyebrow">ADMIN OVERVIEW</p>
        <h1>Dashboard</h1>
        <p id="dashboard-date" class="dashboard-subtitle"></p>
      </div>
      <button id="open-start-queue-modal" class="button button-primary start-button" type="button"><span aria-hidden="true">＋</span> Start Queue</button>
    </section>

    <p id="dashboard-message" class="form-message dashboard-message" role="status" aria-live="polite"></p>

    <section class="metric-grid" aria-label="Queue overview">
      <article class="metric-card served-card">
        <div class="served-card-top">
          <div class="metric-icon purple-icon" aria-hidden="true">✓</div>
          <label class="period-label" for="served-period">Total served</label>
        </div>
        <strong id="served-total" class="served-total">0</strong>
        <span id="served-caption" class="metric-caption">Customers served today</span>
        <div class="period-controls">
          <select id="served-period" aria-label="Served count period">
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="range">Date range</option>
          </select>
          <div id="period-day-fields" class="range-fields">
            <label class="visually-hidden" for="period-day">Select date</label>
            <input id="period-day" type="date">
          </div>
          <div id="period-week-fields" class="range-fields" hidden>
            <label class="visually-hidden" for="period-week">Select a date in the week</label>
            <input id="period-week" type="date">
          </div>
          <div id="period-month-fields" class="range-fields" hidden>
            <label class="visually-hidden" for="period-month">Select month</label>
            <input id="period-month" type="month">
          </div>
          <div id="period-year-fields" class="range-fields" hidden>
            <label class="visually-hidden" for="period-year">Select year</label>
            <input id="period-year" type="number" min="2000" max="9999" step="1">
          </div>
          <div id="range-fields" class="range-fields" hidden>
            <label class="visually-hidden" for="range-start">Start date</label>
            <input id="range-start" type="date">
            <span>to</span>
            <label class="visually-hidden" for="range-end">End date</label>
            <input id="range-end" type="date">
          </div>
        </div>
      </article>
    </section>

    <section class="dashboard-panel service-chart-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">COMPLETED SERVICES</p>
          <h2>Service volume</h2>
        </div>
        <div class="service-chart-legend" aria-label="Chart legend">
          <span><i class="chart-legend-cashier" aria-hidden="true"></i>Cashier</span>
          <span><i class="chart-legend-registrar" aria-hidden="true"></i>Registrar</span>
          <span><i class="chart-legend-cashier-no-show" aria-hidden="true"></i>Cashier No Show</span>
          <span><i class="chart-legend-registrar-no-show" aria-hidden="true"></i>Registrar No Show</span>
          <label class="visually-hidden" for="chart-service-filter">Filter graph by service</label>
          <select id="chart-service-filter" class="chart-service-filter" aria-label="Graph service">
            <option value="all">All services</option>
            <option value="Cashier">Cashier only</option>
            <option value="Registrar">Registrar only</option>
          </select>
        </div>
      </div>
      <p id="service-chart-caption" class="chart-caption">Completed services for this period</p>
      <div class="service-chart-navigation">
        <button id="service-chart-older" class="button button-secondary" type="button" aria-label="Show earlier dates">← Older</button>
        <span>Scroll horizontally to view dates</span>
        <button id="service-chart-newer" class="button button-secondary" type="button" aria-label="Show later dates">Newer →</button>
      </div>
      <div class="service-chart-scroll">
        <div id="service-chart" class="service-chart" role="img" aria-label="Completed services chart"></div>
      </div>
    </section>

    <p class="static-note">Static demo dashboard. Queue counts and served totals are sample data stored in this browser, not live school records.</p>
    </main>
  </div>

  <dialog id="start-queue-dialog" class="outcome-dialog queue-action-dialog">
    <form method="dialog"><button class="dialog-close" aria-label="Close" value="cancel">×</button></form>
    <p class="eyebrow">QUEUE SETUP</p>
    <h2>Start a new queue</h2>
    <p class="queue-action-copy">Enter a Join Code to join the shared queue; an available service window is assigned automatically. Leave it blank to start a new queue.</p>
    <form id="dashboard-queue-form" class="setup-form" novalidate>
      <label for="dashboard-join-code">Join Code (optional)</label>
      <input id="dashboard-join-code" name="joinCode" type="text" autocomplete="off" autocapitalize="characters" maxlength="16" placeholder="Enter code to join an existing queue">
      <label for="dashboard-service">Service type</label>
      <select id="dashboard-service" required>
        <option value="" selected disabled>Select a service</option>
        <option value="Cashier">Cashier</option>
        <option value="Registrar">Registrar</option>
      </select>
      <label for="dashboard-window">Service window</label>
      <select id="dashboard-window" required>
        <option value="" selected disabled>Select a service first</option>
      </select>
      <p id="dashboard-queue-message" class="form-message" role="status" aria-live="polite"></p>
      <button id="dashboard-queue-submit" class="button button-primary setup-submit" type="submit">Continue</button>
    </form>
  </dialog>
</template>
