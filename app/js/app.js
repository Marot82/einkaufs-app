// Einstiegspunkt: Navigation zwischen den Bereichen + Service Worker.

import './shopping.js';
import './recipes.js';

// ---- Untere Navigation ----
const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');

for (const btn of navButtons) {
  btn.addEventListener('click', () => {
    for (const b of navButtons) b.classList.toggle('active', b === btn);
    for (const v of views) v.classList.toggle('active', v.id === btn.dataset.view);
    window.scrollTo(0, 0);
  });
}

// ---- Service Worker (macht die App offline-fähig und installierbar) ----
// Funktioniert nur über HTTPS oder localhost – beim Testen über die
// WLAN-Adresse des Computers wird er einfach übersprungen, das ist okay.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    /* Kein HTTPS → kein Offline-Modus, App läuft trotzdem */
  });
}
