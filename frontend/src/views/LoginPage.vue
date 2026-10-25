<template>
<main class="page-shell">
    <section class="welcome-panel" aria-label="School Queue Tracker">
      <a class="brand" href="/" aria-label="School Queue Tracker home">
        <img class="brand-logo" src="/Logo.png" alt="">
        <span>School Queue Tracker</span>
      </a>
      <div class="welcome-copy">
        <p class="eyebrow">ADMINISTRATOR PORTAL</p>
        <h1>Keep every<br>queue moving.</h1>
        <p class="welcome-description">A simpler way for school teams to manage service queues and keep daily operations on track.</p>
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
          <p class="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your account</h2>
          <p>Enter your administrator ID and password to continue.</p>
        </div>
        <form id="login-form" class="auth-form" novalidate>
          <label for="login-id">Administrator ID</label>
          <input id="login-id" name="id" type="text" autocomplete="username" placeholder="Enter your ID" required>

          <div class="label-row">
            <label for="login-password">Password</label>
          </div>
          <div class="password-input-wrap">
            <input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required>
            <button class="password-toggle" type="button" data-password-toggle="login-password" aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle><path class="eye-slash" d="M4 4l16 16"></path></svg></button>
          </div>

          <p class="form-message" id="login-message" role="status" aria-live="polite"></p>
          <button class="button button-primary" type="submit">Sign in <span aria-hidden="true">→</span></button>
        </form>
        <button id="show-forgot-password" class="forgot-password-link" type="button">Forgot password?</button>
        <form id="forgot-password-form" class="auth-form forgot-password-form" novalidate hidden>
          <div class="form-heading forgot-password-heading">
            <h2>Reset your password</h2>
            <p>Enter your administrator ID and account email. If they match, we’ll email you a reset link.</p>
          </div>
          <label for="reset-request-id">Administrator ID</label>
          <input id="reset-request-id" name="id" type="text" autocomplete="username" placeholder="Enter your ID" maxlength="128" required>
          <label for="reset-request-email">Email address</label>
          <input id="reset-request-email" name="email" type="email" autocomplete="email" placeholder="name@school.edu" required>
          <p class="form-message" id="reset-request-message" role="status" aria-live="polite"></p>
          <button id="reset-request-submit" class="button button-primary" type="submit">Reset Password</button>
          <button id="back-to-login" class="forgot-password-link" type="button">Back to sign in</button>
        </form>
        <p class="form-switch">Need an admin account? <a href="/register">Register here</a></p>
      </div>
      <footer class="form-footer">© <span data-current-year></span> School Queue Tracker System</footer>
    </section>
  </main>
</template>
