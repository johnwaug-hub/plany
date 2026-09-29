/**
 * Plany — Capacitor Native Bridge
 * Loaded only when running inside a native Capacitor container.
 * Handles native-specific behaviors: back button, status bar,
 * splash screen dismissal, and keyboard avoidance.
 */

(async function () {
  // Only run inside Capacitor
  if (!window.Capacitor) return;

  const { App }         = window.Capacitor.Plugins;
  const { SplashScreen} = window.Capacitor.Plugins;
  const { StatusBar }   = window.Capacitor.Plugins;
  const { Keyboard }    = window.Capacitor.Plugins;

  // ── Splash Screen ─────────────────────────────────────────────────────────
  // Hide after Firebase auth resolves (auth observer fires in app.js)
  // We listen for a custom event dispatched by app.js
  document.addEventListener('plany:auth-resolved', async () => {
    try { await SplashScreen?.hide({ fadeOutDuration: 300 }); } catch (_) {}
  });

  // Fallback: hide after 4 seconds regardless
  setTimeout(async () => {
    try { await SplashScreen?.hide(); } catch (_) {}
  }, 4000);

  // ── Status Bar ────────────────────────────────────────────────────────────
  try {
    await StatusBar?.setStyle({ style: 'DARK' });
    await StatusBar?.setBackgroundColor({ color: '#0F0F23' });
  } catch (_) {}

  // ── Android Back Button ───────────────────────────────────────────────────
  // Close open modals instead of exiting the app
  // v6.5.0: Back steps out one layer at a time -- confirm box, top popup,
  // More menu, Help panel, then back to the Month view -- and only exits
  // from Month. (It used to exit the app from any screen.)
  App?.addListener('backButton', () => {
    const dialog = document.querySelector('.plany-dialog');
    if (dialog) { dialog.querySelector('.plany-dialog-cancel, .plany-dialog-ok')?.click(); return; }
    const top = (typeof topOpenModal === 'function') ? topOpenModal() : document.querySelector('.modal:not(.hidden)');
    if (top) {
      if (typeof dismissModal === 'function') dismissModal(top);
      else if (typeof closeModal === 'function') closeModal(top);
      return;
    }
    const more = document.querySelector('.nav-more-menu:not(.hidden)');
    if (more) { more.classList.add('hidden'); return; }
    const help = document.getElementById('help-panel');
    if (help && help.classList.contains('open')) { if (typeof closeHelp === 'function') closeHelp(); return; }
    const active = document.querySelector('.view.active')?.id;
    if (active && active !== 'calendar-view') { document.querySelector('.nav-item[data-view="calendar"]')?.click(); return; }
    App.exitApp();
  });

  // ── Keyboard Avoidance ────────────────────────────────────────────────────
  Keyboard?.addListener('keyboardWillShow', (info) => {
    document.body.style.setProperty('--keyboard-height', info.keyboardHeight + 'px');
    document.body.classList.add('keyboard-open');
  });
  Keyboard?.addListener('keyboardWillHide', () => {
    document.body.style.setProperty('--keyboard-height', '0px');
    document.body.classList.remove('keyboard-open');
  });

  // ── App State (pause/resume) ──────────────────────────────────────────────
  App?.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      // Resumed — force SW update check
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.ready.then(reg => reg.update());
      }
    }
  });

  console.log('[Plany] Capacitor bridge initialized on', window.Capacitor.getPlatform());
})();
