<template>
<main class="page-shell">
    <section class="welcome-panel" aria-label="School Queue Tracker">
      <a class="brand" href="/" aria-label="School Queue Tracker home">
        <img class="brand-logo" src="/Logo.png" alt="">
        <span>School Queue Tracker</span>
      </a>
      <div class="welcome-copy">
        <p class="eyebrow">ADMINISTRATOR PORTAL</p>
        <h1>Your account.<br>Ready to go.</h1>
        <p class="welcome-description">Set a strong password to finish setting up your administrator account.</p>
      </div>
      <div class="welcome-footer">
        <span class="status-dot" aria-hidden="true"></span>
        For authorized school staff
      </div>
      <div class="decorative-orbit orbit-one" aria-hidden="true"></div>
      <div class="decorative-orbit orbit-two" aria-hidden="true"></div>
    </section>

    <section class="form-panel">
      <div class="form-wrap">
        <div class="mobile-brand brand">
          <img class="brand-logo" src="/Logo.png" alt="">
          <span>School Queue Tracker</span>
        </div>
        <div class="form-heading">
          <p class="eyebrow">ACCOUNT ACTIVATION</p>
          <h2>Set your password</h2>
          <p>Review your account details and choose a new password.</p>
        </div>
        <div class="account-summary" aria-label="Account details">
          <div class="summary-item">
            <span class="summary-label">ADMINISTRATOR ID</span>
            <strong id="account-id">—</strong>
          </div>
          <div class="summary-item">
            <span class="summary-label">ACCOUNT NAME</span>
            <strong id="account-name">—</strong>
          </div>
        </div>
        <form id="activate-form" class="auth-form" novalidate>
          <input id="activate-id" name="id" type="hidden">
          <label for="new-password">New password</label>
          <div class="password-input-wrap">
            <input id="new-password" name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" minlength="8" required>
            <button class="password-toggle" type="button" data-password-toggle="new-password" aria-label="Show new password" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle><path class="eye-slash" d="M4 4l16 16"></path></svg></button>
          </div>

          <label for="confirm-password">Confirm password</label>
          <div class="password-input-wrap">
            <input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" placeholder="Enter your password again" minlength="8" required>
            <button class="password-toggle" type="button" data-password-toggle="confirm-password" aria-label="Show confirm password" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle><path class="eye-slash" d="M4 4l16 16"></path></svg></button>
          </div>

          <p class="form-message" id="activate-message" role="status" aria-live="polite"></p>
          <button class="button button-primary" type="submit">Activate account <span aria-hidden="true">→</span></button>
        </form>
        <p class="form-switch">Already activated? <a href="/">Sign in</a></p>
        <p class="demo-notice">Activation links expire after 24 hours and can only be used once.</p>
      </div>
      <footer class="form-footer">© <span data-current-year></span> School Queue Tracker System</footer>
    </section>
  </main>
</template>
