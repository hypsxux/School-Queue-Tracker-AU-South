<template>
<main class="display-main">
  <section id="display-service-panels" class="display-service-panels" aria-label="Queue display"></section>
  <p id="display-message" class="form-message"></p>
  <div id="display-volume-control" class="display-volume-control">
    <button id="display-volume-toggle" class="display-volume-toggle" type="button" aria-label="Adjust display volume" aria-expanded="false">
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zm-2.5-9v2.06a7.5 7.5 0 0 1 0 13.88V21a9.5 9.5 0 0 0 0-18z" />
    </svg>
  </button>
    <div id="display-volume-panel" class="display-volume-panel" hidden>
      <label class="visually-hidden" for="display-volume-slider">Display volume</label>
      <input id="display-volume-slider" type="range" min="0" max="100" value="100" aria-label="Display volume">
      <output id="display-volume-value" for="display-volume-slider">100%</output>
    </div>
  </div>
</main>
</template>
