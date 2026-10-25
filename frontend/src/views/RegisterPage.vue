<template>
<main class="page-shell">
    <section class="welcome-panel" aria-label="School Queue Tracker">
      <a class="brand" href="/" aria-label="School Queue Tracker home">
        <img class="brand-logo" src="/Logo.png" alt="">
        <span>School Queue Tracker</span>
      </a>
      <div class="welcome-copy">
        <p class="eyebrow">ADMINISTRATOR PORTAL</p>
        <h1>One team.<br>One smoother queue.</h1>
        <p class="welcome-description">Create an administrator profile and we’ll email you a link to set your password.</p>
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
          <p class="eyebrow">NEW ADMIN PROFILE</p>
          <h2>Create your account</h2>
          <p>Enter your administrator details and school email address.</p>
        </div>
        <form id="register-form" class="auth-form" novalidate>
          <label for="register-id">Administrator ID</label>
          <input id="register-id" name="id" type="text" autocomplete="off" placeholder="Enter your assigned ID" required>

          <div class="field-grid">
            <div>
              <label for="first-name">First name</label>
              <input id="first-name" name="firstName" type="text" autocomplete="given-name" placeholder="First name" required>
            </div>
            <div>
              <label for="middle-name">Middle name <span class="optional">(optional)</span></label>
              <input id="middle-name" name="middleName" type="text" autocomplete="additional-name" placeholder="Middle name">
            </div>
          </div>

          <label for="last-name">Last name</label>
          <input id="last-name" name="lastName" type="text" autocomplete="family-name" placeholder="Last name" required>

          <label for="register-email">Email address</label>
          <input id="register-email" name="email" type="email" autocomplete="email" placeholder="name@school.edu" required>

          <p class="form-message" id="register-message" role="status" aria-live="polite"></p>
          <button class="button button-primary" type="submit">Send activation email <span aria-hidden="true">→</span></button>
        </form>
        <p class="form-switch">Already have an account? <a href="/">Sign in</a></p>
        <p class="demo-notice">An activation link will be sent to the email address above. The link expires after 24 hours.</p>
      </div>
      <footer class="form-footer">© <span data-current-year></span> School Queue Tracker System</footer>
    </section>
  </main>
</template>
