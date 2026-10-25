<template>
  <main class="page-shell">
    <section class="welcome-panel" aria-label="School Queue Tracker">
      <a class="brand" href="/" aria-label="School Queue Tracker home">
        <img class="brand-logo" src="/Logo.png" alt="">
        <span>School Queue Tracker</span>
      </a>
      <div class="welcome-copy">
        <p class="eyebrow">ADMINISTRATOR PORTAL</p>
        <h1>Back to<br>keeping queues moving.</h1>
        <p class="welcome-description">Choose a new password to securely regain access to your administrator account.</p>
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
          <p class="eyebrow">PASSWORD RESET</p>
          <h2>Choose a new password</h2>
          <p id="reset-account-description">Reset links expire after 30 minutes and can only be used once.</p>
        </div>
        <p class="form-message" id="reset-account-id" aria-live="polite"></p>
        <form id="password-reset-form" class="auth-form" novalidate>
          <label for="reset-new-password">New password</label>
          <div class="password-input-wrap">
            <input id="reset-new-password" name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" minlength="8" required>
            <button class="password-toggle" type="button" data-password-toggle="reset-new-password" aria-label="Show new password" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle><path class="eye-slash" d="M4 4l16 16"></path></svg></button>
          </div>

          <label for="reset-confirm-password">Confirm password</label>
          <div class="password-input-wrap">
            <input id="reset-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" placeholder="Enter your password again" minlength="8" required>
            <button class="password-toggle" type="button" data-password-toggle="reset-confirm-password" aria-label="Show confirm password" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle><path class="eye-slash" d="M4 4l16 16"></path></svg></button>
          </div>

          <p class="form-message" id="password-reset-message" role="status" aria-live="polite"></p>
          <button class="button button-primary" type="submit">Save new password <span aria-hidden="true">→</span></button>
        </form>
        <p class="form-switch"><a href="/">Back to sign in</a></p>
      </div>
      <footer class="form-footer">© <span data-current-year></span> School Queue Tracker System</footer>
    </section>
  </main>
</template>
