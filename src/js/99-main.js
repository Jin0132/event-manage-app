async function bootLegacyStack() {
  await import("/src/js/00-firebase-init-first.js");
  await import("/src/js/i18n-dictionary.js");
  await import("/src/js/i18n.js");
  await import("/src/js/01-config-state-dom.js");
  await import("/src/js/02-ui-common.js");
  await import("/src/js/02-invite-nav-auth-ui.js");
  await import("/src/js/01-auth.js");
  await import("/src/js/03-utils-render-access.js");
  await import("/src/js/04-firebase-data.js");
  await import("/src/js/04-event-details.js");
  await import("/src/js/06-host-dash.js");
  await import("/src/js/05-join-event.js");
  await import("/src/js/04-create-event.js");
  await import("/src/js/07-login-screen.js");
  await import("/src/js/08-waiting-room.js");
  await import("/src/js/09-app-session-routing.js");
  await import("/src/js/10-app-views.js");
  await import("/src/js/05-forms-features.js");
  await import("/src/js/11-user-profile.js");
  await import("/src/js/12-pwa-fcm.js");
  await import("/src/js/13-accounting.js");
  await import("/src/js/06-bootstrap.js");
}

if (!window.__WEBVIEW_BLOCKED__) {
  window.addEventListener("DOMContentLoaded", () => {
    if (typeof window.setupAppNavigation === "function") {
      window.setupAppNavigation();
    }
  }, { once: true });
  void bootLegacyStack();
}
