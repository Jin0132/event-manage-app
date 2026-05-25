import {
  appState,
  DEFAULT_AVATAR_URL,
  globalToast,
  globalToastText,
  qrModal,
  qrModalCode,
  appHeader,
  appFooter,
  appFooterTabHome,
  appFooterTabChat,
  appFooterTabSettings,
  navBackButton,
  navRoleSelect,
  accountAvatarWrap,
} from "./01-config-state-dom.js";
import { closeAccountAvatarMenu } from "./01-auth.js";
const LAST_SELECTED_ROLE_KEY = "last_selected_role";
const FOOTER_CHAT_TOAST_DEBOUNCE_MS = 1200;
let lastFooterChatToastAt = 0;

function isPremiumFeaturesEnabled() {
  return window.ENABLE_PREMIUM_FEATURES === true;
}

function getEventInviteUrl(eventId) {
  const origin = window.location.origin || "";
  return `${origin}/?eventId=${encodeURIComponent(eventId)}`;
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function showToast(message) {
  if (!globalToast || !globalToastText) {
    return;
  }
  globalToastText.textContent = message;
  globalToast.classList.add("toast-visible");
  if (window.globalToastTimerId) {
    window.clearTimeout(window.globalToastTimerId);
  }
  window.globalToastTimerId = window.setTimeout(() => {
    globalToast.classList.remove("toast-visible");
  }, 2500);
}

function openQrModalForEvent(eventId) {
  if (!qrModal || !qrModalCode || typeof QRCode === "undefined") {
    alert("QRコード表示に必要なスクリプトが読み込まれていません。");
    return;
  }
  const url = getEventInviteUrl(eventId);
  qrModalCode.innerHTML = "";
  window.qrCodeInstance = new QRCode(qrModalCode, {
    text: url,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M,
  });
  qrModal.hidden = false;
}

function closeQrModal() {
  if (!qrModal) {
    return;
  }
  qrModal.hidden = true;
  if (window.qrCodeInstance && typeof window.qrCodeInstance.clear === "function") {
    window.qrCodeInstance.clear();
  }
  if (qrModalCode) {
    qrModalCode.innerHTML = "";
  }
}

function updateAppNavigation() {
  if (
    !appHeader ||
    typeof firebase === "undefined" ||
    !firebase.auth ||
    typeof isFirebaseAppReady !== "function" ||
    !isFirebaseAppReady()
  ) {
    return;
  }
  const user = firebase.auth().currentUser;
  const loggedIn = !!user;
  const avatarImg = document.getElementById("account-avatar");
  if (avatarImg) {
    const photoUrl = String(user?.photoURL || "").trim();
    if (photoUrl) {
      avatarImg.src = photoUrl;
      avatarImg.onerror = () => {
        avatarImg.src = DEFAULT_AVATAR_URL || "";
      };
    } else if (!loggedIn) {
      avatarImg.src = DEFAULT_AVATAR_URL || "";
      avatarImg.onerror = null;
    }
  }
  const currentView = String(appState.visibleAppView || "");
  if (accountAvatarWrap) {
    if (!loggedIn || currentView === "login-screen") {
      accountAvatarWrap.hidden = true;
      if (currentView === "login-screen") {
        closeAccountAvatarMenu();
      }
    } else {
      accountAvatarWrap.hidden = false;
    }
  }
  const showAppChrome = loggedIn && currentView !== "login-screen";
  if (!showAppChrome) {
    appHeader.hidden = true;
    if (appFooter) {
      appFooter.hidden = true;
    }
    document.body.classList.remove("app-shell", "app-nav-visible");
    if (navRoleSelect) {
      navRoleSelect.hidden = true;
    }
    appFooterTabHome?.classList.remove("active");
    appFooterTabChat?.classList.remove("active");
    appFooterTabSettings?.classList.remove("active");
    return;
  }
  appHeader.hidden = false;
  if (appFooter) {
    appFooter.hidden = false;
  }
  document.body.classList.add("app-shell");
  document.body.classList.remove("app-nav-visible");
  const showHeaderBack =
    currentView === "event-details" ||
    currentView === "join-gate" ||
    currentView === "passcode-confirm" ||
    currentView === "waiting-room" ||
    currentView === "account-profile-edit" ||
    currentView === "accounting-view" ||
    currentView === "host-dashboard" ||
    currentView === "participant-dashboard";
  if (navBackButton) {
    navBackButton.style.display = showHeaderBack ? "inline-flex" : "none";
  }
  if (navRoleSelect) {
    const role = String(appState.currentRole || "");
    if (role === "host" || role === "participant") {
      navRoleSelect.hidden = false;
      navRoleSelect.value = role;
    } else {
      navRoleSelect.hidden = true;
    }
  }
  if (appFooterTabHome && appFooterTabSettings) {
    const settingsActive =
      currentView === "account-settings" || currentView === "account-profile-edit";
    appFooterTabHome.classList.toggle("active", !settingsActive);
    appFooterTabChat?.classList.remove("active");
    appFooterTabSettings.classList.toggle("active", settingsActive);
  }
}

function setupFooterTabHandlers() {
  if (document.documentElement.dataset.appFooterTabsBound === "1") {
    return;
  }
  document.documentElement.dataset.appFooterTabsBound = "1";
  if (appFooterTabHome) {
    appFooterTabHome.addEventListener("click", () => {
      const currentView = String(appState.visibleAppView || "");
      if (currentView === "host-dashboard" || currentView === "participant-dashboard") {
        return;
      }
      const role = appState.currentRole;
      if (role === "host") {
        if (typeof window.showView === "function") {
          window.showView("host-dashboard");
        }
        if (typeof window.loadMyEvents === "function") {
          void window.loadMyEvents();
        }
      } else if (role === "participant") {
        if (typeof window.showView === "function") {
          window.showView("participant-dashboard");
        }
        if (typeof window.loadParticipantJoinedEvents === "function") {
          void window.loadParticipantJoinedEvents();
        }
      } else if (typeof window.showRoleSelectUI === "function") {
        window.showRoleSelectUI();
      } else if (typeof window.showView === "function") {
        window.showView("role-selection");
      }
      if (typeof updateAppNavigation === "function") {
        updateAppNavigation();
      }
    });
  }
  if (appFooterTabSettings) {
    appFooterTabSettings.addEventListener("click", () => {
      const currentView = String(appState.visibleAppView || "");
      if (currentView === "account-settings") {
        return;
      }
      if (typeof window.openAccountSettingsFromMenu === "function") {
        window.openAccountSettingsFromMenu();
      } else if (typeof window.showView === "function") {
        window.showView("account-settings");
      }
      if (typeof updateAppNavigation === "function") {
        updateAppNavigation();
      }
    });
  }
  if (appFooterTabChat) {
    appFooterTabChat.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastFooterChatToastAt < FOOTER_CHAT_TOAST_DEBOUNCE_MS) {
        return;
      }
      lastFooterChatToastAt = now;
      if (typeof showToast === "function") {
        showToast("ダイレクトメッセージ一覧機能は準備中です！");
      } else {
        alert("ダイレクトメッセージ一覧機能は準備中です！");
      }
    });
  }
}

function setupAppNavigation() {
  setupFooterTabHandlers();
  if (document.documentElement.dataset.appBackBound === "1") {
    return;
  }
  document.documentElement.dataset.appBackBound = "1";
  document.body.addEventListener("click", (event) => {
    const t = event.target;
    if (!(t instanceof Element)) {
      return;
    }
    const btn = t.closest("[data-app-back], #appHeaderBackButton");
    if (!btn) {
      return;
    }
    event.preventDefault();
    if (typeof window.navigateAppBack === "function") {
      void window.navigateAppBack();
    }
  });
  const headerBack = document.getElementById("appHeaderBackButton");
  if (headerBack && !headerBack.dataset.bound) {
    headerBack.dataset.bound = "1";
    headerBack.addEventListener("click", (event) => {
      event.preventDefault();
      if (typeof window.navigateAppBack === "function") {
        void window.navigateAppBack();
      }
    });
  }
  if (navRoleSelect && !navRoleSelect.dataset.bound) {
    navRoleSelect.dataset.bound = "1";
    navRoleSelect.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }
      const nextRole = target.value === "host" ? "host" : "participant";
      try {
        localStorage.setItem(LAST_SELECTED_ROLE_KEY, nextRole);
      } catch (e) {
        /* ignore */
      }
      appState.currentRole = nextRole;
      if (nextRole === "host") {
        appState.authSessionRoute = "host_workspace";
        appState.appShellEntered = true;
        if (typeof window.showView === "function") {
          window.showView("host-dashboard");
        }
        if (typeof window.bindHostDashboardInteractions === "function") {
          window.bindHostDashboardInteractions();
        }
        if (typeof window.loadMyEvents === "function") {
          await window.loadMyEvents();
        }
      } else {
        appState.authSessionRoute = "participant_join";
        appState.appShellEntered = false;
        if (typeof window.showView === "function") {
          window.showView("participant-dashboard");
        }
        if (typeof window.loadParticipantJoinedEvents === "function") {
          await window.loadParticipantJoinedEvents();
        }
      }
      updateAppNavigation();
    });
  }
}

const INVITE_NAV_AUTH_UI_EXPORTS = {
  isPremiumFeaturesEnabled,
  getEventInviteUrl,
  copyToClipboard,
  showToast,
  openQrModalForEvent,
  closeQrModal,
  updateAppNavigation,
  setupAppNavigation,
};

Object.assign(window, INVITE_NAV_AUTH_UI_EXPORTS);

export {
  isPremiumFeaturesEnabled,
  getEventInviteUrl,
  copyToClipboard,
  showToast,
  openQrModalForEvent,
  closeQrModal,
  updateAppNavigation,
  setupAppNavigation,
};
