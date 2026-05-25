/* ログイン後の役割選択（Host / Participant） — load order matters */
import {
  appState,
  roleSelectSection,
  roleSelectStatusLine,
  roleSelectHostButton,
  roleSelectParticipantButton,
} from "./01-config-state-dom.js";
const LAST_SELECTED_ROLE_KEY = "last_selected_role";

function showRoleSelectUI() {
  const u =
    typeof isFirebaseAppReady === "function" && isFirebaseAppReady()
      ? firebase.auth().currentUser
      : null;
  if (
    u &&
    typeof isUserProfileComplete === "function" &&
    !isUserProfileComplete(u)
  ) {
    if (typeof openUserProfilePanel === "function") {
      openUserProfilePanel({ mode: "initial" });
    }
    if (typeof showView === "function") {
      showView("profile-setup");
    }
    updateAppNavigation();
    return;
  }
  try {
    localStorage.removeItem(LAST_SELECTED_ROLE_KEY);
  } catch (e) {
    /* ignore */
  }
  appState.currentRole = null;
  appState.appShellEntered = false;
  appState.authSessionRoute = "role_select";
  if (typeof showView === "function") {
    showView("role-selection");
  }
  if (typeof updateRoleSelectPendingInvitePanel === "function") {
    updateRoleSelectPendingInvitePanel();
  }
  if (typeof teardownWaitingRoom === "function") {
    teardownWaitingRoom();
  }
  if (typeof hideJoinByPasscodeFlow === "function") {
    hideJoinByPasscodeFlow();
  }
  if (roleSelectStatusLine) {
    roleSelectStatusLine.textContent = "";
  }
  updateAppNavigation();
}

function hideRoleSelectUI() {
  if (roleSelectSection) {
    roleSelectSection.hidden = true;
  }
}

let accountAvatarDropdownOpen = false;

function closeAccountAvatarMenu() {
  const drop = document.getElementById("accountAvatarDropdown");
  const btn = document.getElementById("accountAvatarMenuButton");
  if (drop) {
    drop.hidden = true;
  }
  if (btn) {
    btn.setAttribute("aria-expanded", "false");
  }
  accountAvatarDropdownOpen = false;
}

function setupAccountAvatarMenu() {
  const root = document.querySelector(".account-avatar-menu-root");
  const trigger = document.getElementById("accountAvatarMenuButton");
  const drop = document.getElementById("accountAvatarDropdown");
  const logoutBtn = document.getElementById("accountMenuLogoutButton");
  const changeLoginBtn = document.getElementById("accountMenuChangeLoginButton");
  const settingsBtn = document.getElementById("accountMenuSettingsButton");
  if (!root || !trigger || !drop || trigger.dataset.avatarMenuBound) {
    return;
  }
  trigger.dataset.avatarMenuBound = "1";
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = drop.hidden;
    drop.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    accountAvatarDropdownOpen = willOpen;
    if (willOpen && typeof updateNotificationButtonUI === "function") {
      updateNotificationButtonUI();
    }
  });
  const bindLogoutMenuItem = (btn) => {
    if (!btn) {
      return;
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const ok = window.confirm("ログアウトしますか？");
      if (!ok) {
        return;
      }
      closeAccountAvatarMenu();
      void handleLogoutAndReturnToLogin();
    });
  };
  bindLogoutMenuItem(logoutBtn);
  bindLogoutMenuItem(changeLoginBtn);
  if (settingsBtn && !settingsBtn.dataset.settingsBound) {
    settingsBtn.dataset.settingsBound = "1";
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAccountAvatarMenu();
      if (typeof openAccountSettingsFromMenu === "function") {
        openAccountSettingsFromMenu();
      }
    });
  }
  if (!document.documentElement.dataset.accountAvatarDocBound) {
    document.documentElement.dataset.accountAvatarDocBound = "1";
    document.addEventListener("click", (e) => {
      if (!accountAvatarDropdownOpen) {
        return;
      }
      const r = document.querySelector(".account-avatar-menu-root");
      if (e.target instanceof Node && r && r.contains(e.target)) {
        return;
      }
      closeAccountAvatarMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && accountAvatarDropdownOpen) {
        closeAccountAvatarMenu();
      }
    });
  }
}

async function handleLogoutAndReturnToLogin() {
  try {
    try {
      localStorage.removeItem(LAST_SELECTED_ROLE_KEY);
    } catch (e) {
      /* ignore */
    }
    if (typeof isFirebaseAppReady === "function" && isFirebaseAppReady()) {
      const currentUser = firebase.auth().currentUser;
      if (currentUser?.isAnonymous) {
        const uid = String(currentUser.uid || "").trim();
        const candidateEventIds = Array.from(
          new Set(
            [
              String(appState.eventId || "").trim(),
              String(appState.pendingEventIdFromUrl || "").trim(),
              String(new URLSearchParams(window.location.search).get("eventId") || "").trim(),
            ].filter(Boolean)
          )
        );
        if (uid && candidateEventIds.length > 0) {
          for (const eid of candidateEventIds) {
            try {
              await firebase
                .firestore()
                .collection("events")
                .doc(eid)
                .collection("participants")
                .doc(uid)
                .delete();
            } catch (deleteErr) {
              console.warn("匿名ユーザー参加ドキュメント削除失敗:", eid, deleteErr);
            }
          }
        }
        try {
          await currentUser.delete();
        } catch (deleteUserErr) {
          console.warn("匿名ユーザー削除失敗:", deleteUserErr);
          await firebase.auth().signOut();
        }
      } else {
        await firebase.auth().signOut();
      }
    }
  } catch (e) {
    console.warn(e);
    return;
  }
  closeAccountAvatarMenu();
  if (typeof teardownEventPageLiveListeners === "function") {
    teardownEventPageLiveListeners();
  }
  if (typeof teardownWaitingRoom === "function") {
    teardownWaitingRoom();
  }
  if (typeof hideJoinByPasscodeFlow === "function") {
    hideJoinByPasscodeFlow();
  }
  if (typeof resetAppState === "function") {
    resetAppState();
  }
  if (typeof getEventIdFromQuery === "function") {
    appState.pendingEventIdFromUrl = getEventIdFromQuery() || "";
  }
  if (typeof closeFullscreenModalsSafely === "function") {
    closeFullscreenModalsSafely();
  }
  if (typeof showAuthSelectionUI === "function") {
    showAuthSelectionUI();
  } else if (typeof showView === "function") {
    showView("login-screen");
  }
  if (typeof setAuthStatusLine === "function") {
    setAuthStatusLine("ログイン方法を選んでください。");
  }
  if (typeof updateJoinButtonUI === "function") {
    updateJoinButtonUI();
  }
  if (typeof updateAppNavigation === "function") {
    updateAppNavigation();
  }
}

const appAuth = {
  async logout() {
    await handleLogoutAndReturnToLogin();
  },
};

function setupRoleSelectHandlers() {
  if (roleSelectHostButton && !roleSelectHostButton.dataset.bound) {
    roleSelectHostButton.dataset.bound = "1";
    roleSelectHostButton.addEventListener("click", () => {
      void (async () => {
        try {
          try {
            localStorage.setItem(LAST_SELECTED_ROLE_KEY, "host");
          } catch (e) {
            /* ignore */
          }
          if (roleSelectStatusLine) {
            roleSelectStatusLine.textContent = "";
          }
          appState.appShellEntered = false;
          await initializeFirebaseAuthReady();
          if (typeof startHostDashboard === "function") {
            await startHostDashboard();
          }
        } catch (e) {
          if (String(e && e.message) === "profile_incomplete") {
            return;
          }
          console.error(e);
          if (roleSelectStatusLine) {
            roleSelectStatusLine.textContent = "主催者画面を開けませんでした。";
          }
        }
      })();
    });
  }
  if (roleSelectParticipantButton && !roleSelectParticipantButton.dataset.bound) {
    roleSelectParticipantButton.dataset.bound = "1";
    roleSelectParticipantButton.addEventListener("click", () => {
      void (async () => {
        try {
          try {
            localStorage.setItem(LAST_SELECTED_ROLE_KEY, "participant");
          } catch (e) {
            /* ignore */
          }
          if (roleSelectStatusLine) {
            roleSelectStatusLine.textContent = "";
          }
          await initializeFirebaseAuthReady();
          if (typeof enterParticipantFlowFromRoleSelect === "function") {
            await enterParticipantFlowFromRoleSelect();
          }
        } catch (e) {
          if (String(e && e.message) === "profile_incomplete") {
            return;
          }
          console.error(e);
          if (roleSelectStatusLine) {
            roleSelectStatusLine.textContent = "参加者フローを開けませんでした。";
          }
        }
      })();
    });
  }
  const pendBtn = document.getElementById("roleSelectOpenPendingEventButton");
  if (pendBtn && !pendBtn.dataset.bound) {
    pendBtn.dataset.bound = "1";
    pendBtn.addEventListener("click", () => {
      void openPendingEventFromInviteUrl();
    });
  }
  const relogin = document.getElementById("roleSelectReloginLink");
  if (relogin && !relogin.dataset.reloginBound) {
    relogin.dataset.reloginBound = "1";
    relogin.addEventListener("click", () => {
      const ok = window.confirm("ログアウトして、ログイン方法を選び直しますか？");
      if (!ok) {
        return;
      }
      void handleLogoutAndReturnToLogin();
    });
  }
}

const AUTH_EXPORTS = {
  showRoleSelectUI,
  hideRoleSelectUI,
  closeAccountAvatarMenu,
  setupAccountAvatarMenu,
  handleLogoutAndReturnToLogin,
  setupRoleSelectHandlers,
  appAuth,
};

Object.assign(window, AUTH_EXPORTS);

export {
  showRoleSelectUI,
  hideRoleSelectUI,
  closeAccountAvatarMenu,
  setupAccountAvatarMenu,
  handleLogoutAndReturnToLogin,
  setupRoleSelectHandlers,
  appAuth,
};
