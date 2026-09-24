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
  App?.addListener('backButton', ({ canGoBack }) => {
    const openModal = document.querySelector('.modal:not(.hidden)');
    if (openModal) {
      // Close the topmost modal
      if (typeof closeModal === 'function') closeModal(openModal);
      return;
    }
    // No modal open — let the OS decide (exit if at root)
    if (!canGoBack) {
      App.exitApp();
    }
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
