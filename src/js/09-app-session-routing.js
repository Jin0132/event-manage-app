import { appState } from "./01-config-state-dom.js";
const LAST_SELECTED_ROLE_KEY = "last_selected_role";

function getLastSelectedRole() {
  try {
    const role = localStorage.getItem(LAST_SELECTED_ROLE_KEY);
    return role === "host" || role === "participant" ? role : "";
  } catch (e) {
    return "";
  }
}

async function routeToRememberedRoleIfAny() {
  const remembered = getLastSelectedRole();
  if (!remembered) {
    return false;
  }
  appState.currentRole = remembered;
  if (remembered === "host") {
    appState.authSessionRoute = "host_workspace";
    if (typeof window.startHostDashboard === "function") {
      await window.startHostDashboard();
    } else if (typeof window.showView === "function") {
      window.showView("host-dashboard");
      if (typeof window.loadMyEvents === "function") {
        await window.loadMyEvents();
      }
    }
    if (typeof window.updateAppNavigation === "function") {
      window.updateAppNavigation();
    }
    return true;
  }
  appState.authSessionRoute = "participant_join";
  if (typeof window.showJoinByPasscodeFlow === "function") {
    window.showJoinByPasscodeFlow();
  } else if (typeof window.enterParticipantFlowFromRoleSelect === "function") {
    await window.enterParticipantFlowFromRoleSelect();
  }
  if (typeof window.updateAppNavigation === "function") {
    window.updateAppNavigation();
  }
  return true;
}

async function routeDirectlyToPendingEvent() {
  const pendingId = String(appState.pendingEventIdFromUrl || "").trim();
  if (!pendingId) {
    return false;
  }
  appState.currentRole = "participant";
  appState.eventId = pendingId;
  appState.pendingEventIdFromUrl = "";
  appState.authSessionRoute = "event_page";
  appState.appShellEntered = false;
  if (typeof window.showView === "function") {
    window.showView("event-details");
  }
  if (typeof window.enterEventMainUiFromInviteLink === "function") {
    await window.enterEventMainUiFromInviteLink();
  }
  if (typeof window.updateAppNavigation === "function") {
    window.updateAppNavigation();
  }
  return true;
}

async function applyAuthSessionRouteFromUser(user) {
  if (typeof isFirebaseAppReady !== "function" || !isFirebaseAppReady()) {
    return;
  }
  if (!appState.bootstrapAuthRoutingReady) {
    if (typeof window.updateAppNavigation === "function") {
      window.updateAppNavigation();
    }
    return;
  }
  if (!user) {
    if (appState.pendingEventIdFromUrl && typeof window.enterEventMainUiFromInviteLink === "function") {
      appState.currentRole = "participant";
      appState.eventId = String(appState.pendingEventIdFromUrl || "").trim();
      appState.pendingEventIdFromUrl = "";
      appState.authSessionRoute = "event_page";
      appState.appShellEntered = false;
      await window.enterEventMainUiFromInviteLink();
      if (typeof window.updateAppNavigation === "function") {
        window.updateAppNavigation();
      }
      return;
    }
    appState.authSessionRoute = "login";
    appState.appShellEntered = false;
    if (typeof window.showAuthSelectionUI === "function") {
      window.showAuthSelectionUI();
    }
    if (typeof window.updateAppNavigation === "function") {
      window.updateAppNavigation();
    }
    return;
  }
  if (appState.appShellEntered) {
    return;
  }
  /* パスコード・待合室中は onAuth の再発火で上書きしない */
  if (
    appState.authSessionRoute === "participant_join" ||
    appState.visibleAppView === "waiting-room" ||
    appState.visibleAppView === "participant-entry"
  ) {
    return;
  }
  if (appState.visibleAppView === "account-settings" || appState.visibleAppView === "profile-setup") {
    if (typeof window.updateAppNavigation === "function") {
      window.updateAppNavigation();
    }
    return;
  }
  if (typeof window.applyUserProfileGate === "function") {
    const blocked = await window.applyUserProfileGate(user);
    if (blocked) {
      return;
    }
  }
  if (await routeDirectlyToPendingEvent()) {
    return;
  }
  if (await routeToRememberedRoleIfAny()) {
    return;
  }
  appState.authSessionRoute = "role_select";
  if (typeof window.hideAuthSelectionUI === "function") {
    window.hideAuthSelectionUI();
  }
  if (typeof window.showRoleSelectUI === "function") {
    window.showRoleSelectUI();
  }
  if (typeof window.updateAppNavigation === "function") {
    window.updateAppNavigation();
  }
}

/**
 * ログイン確定後（メール・お試し・Google ポップアップ・リダイレクト復帰・起動時の既存セッション）の統一入口。
 * 必ず役割選択（Lv2）へ誘導する。アプリシェル未入室に戻してから showRoleSelectUI する。
 */
async function startMainUIIfLoggedIn() {
  if (typeof isFirebaseAppReady !== "function" || !isFirebaseAppReady()) {
    return;
  }
  const u = firebase.auth().currentUser;
  if (!u) {
    return;
  }
  if (appState.visibleAppView === "account-settings" || appState.visibleAppView === "profile-setup") {
    return;
  }
  if (typeof window.applyUserProfileGate === "function") {
    const blocked = await window.applyUserProfileGate(u);
    if (blocked) {
      return;
    }
  }
  if (await routeDirectlyToPendingEvent()) {
    return;
  }
  if (await routeToRememberedRoleIfAny()) {
    return;
  }
  appState.appShellEntered = false;
  appState.authSessionRoute = "role_select";
  if (typeof window.hideAuthSelectionUI === "function") {
    window.hideAuthSelectionUI();
  }
  if (typeof window.showRoleSelectUI === "function") {
    window.showRoleSelectUI();
  } else if (typeof window.showView === "function") {
    window.showView("role-selection");
    if (typeof window.updateRoleSelectPendingInvitePanel === "function") {
      window.updateRoleSelectPendingInvitePanel();
    }
    if (typeof window.updateAppNavigation === "function") {
      window.updateAppNavigation();
    }
  }
}

const ROUTING_EXPORTS = {
  applyAuthSessionRouteFromUser,
  startMainUIIfLoggedIn,
};

Object.assign(window, ROUTING_EXPORTS);

export { applyAuthSessionRouteFromUser, startMainUIIfLoggedIn };
