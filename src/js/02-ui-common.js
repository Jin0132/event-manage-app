/* 画面表示の司令塔 showView — load order: 01-config の直後（updateAppNavigation は後続で定義） */
import { appState } from "./01-config-state-dom.js";

const APP_MANAGED_SECTION_IDS = [
  "authSection",
  "roleSelectSection",
  "joinByPasscodeSection",
  "waitingRoomSection",
  "userProfileSection",
  "myEventsSection",
  "createEventSection",
  "eventDetailCard",
  "participantsSection",
  "photosSection",
  "chatSection",
  "accountingSection",
  "joinGateSection",
];

const APP_VIEW_GROUPS = {
  "login-screen": ["authSection"],
  "role-selection": ["roleSelectSection"],
  "participant-entry": ["joinByPasscodeSection"],
  "participant-dashboard": ["joinByPasscodeSection"],
  "passcode-confirm": ["joinByPasscodeSection"],
  "waiting-room": ["waitingRoomSection"],
  "profile-setup": ["userProfileSection"],
  "account-settings": ["userProfileSection"],
  "account-profile-edit": ["userProfileSection"],
  "host-dashboard": ["myEventsSection"],
  "host-create": ["createEventSection"],
  "event-details": ["eventDetailCard", "participantsSection", "photosSection", "chatSection"],
  "accounting-view": ["accountingSection"],
  "join-gate": ["joinGateSection"],
};

function setSectionVisibility(el, visible) {
  if (!el) {
    return;
  }
  el.hidden = !visible;
  el.style.display = visible ? "" : "none";
}

/**
 * クリック／タップの event.target を Element に正規化する（Text ノード対策・SVG 対策）。
 * iOS Safari 等でターゲットが Text になると HTMLElement 判定で落ち、委譲が無反応になることがある。
 */
function normalizePointerEventTarget(target) {
  if (!target) {
    return null;
  }
  if (target instanceof Element) {
    return target;
  }
  if (target.nodeType === Node.TEXT_NODE) {
    const parent = target.parentElement;
    return parent instanceof Element ? parent : null;
  }
  return null;
}

function refreshAuthEntranceStages() {
  document.querySelectorAll(".auth-entrance-stage").forEach((stage) => {
    const section = stage.querySelector("section.auth-card-glass");
    if (!section) {
      return;
    }
    stage.hidden = section.hidden;
  });
  document.querySelectorAll(".auth-entrance-stage").forEach((stage) => {
    const section = stage.querySelector("section.auth-card-glass");
    if (!section) {
      return;
    }
    const visible = !section.hidden;
    stage.classList.remove("auth-entrance-stage--entered");
    if (!visible) {
      return;
    }
    void stage.offsetWidth;
    window.requestAnimationFrame(() => {
      stage.classList.add("auth-entrance-stage--entered");
    });
  });
}

function syncUserProfileAccountSubviews(viewId) {
  const accountSettingsSection = document.getElementById("accountSettingsSection");
  const userProfileForm = document.getElementById("userProfileForm");
  if (!accountSettingsSection || !userProfileForm) {
    return;
  }
  if (viewId === "account-settings") {
    accountSettingsSection.hidden = false;
    userProfileForm.hidden = true;
    return;
  }
  if (viewId === "account-profile-edit") {
    accountSettingsSection.hidden = true;
    userProfileForm.hidden = false;
    return;
  }
  if (viewId === "profile-setup") {
    accountSettingsSection.hidden = true;
    userProfileForm.hidden = false;
  }
}

function showView(viewId) {
  const group = APP_VIEW_GROUPS[viewId];
  if (!group) {
    console.warn("showView: 未知の viewId", viewId);
    return;
  }
  const showSet = new Set(group);
  appState.visibleAppView = viewId;
  APP_MANAGED_SECTION_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    setSectionVisibility(el, showSet.has(id));
  });
  syncUserProfileAccountSubviews(viewId);
  if (viewId === "account-settings" && typeof window.applyAccountSettingsMenuChrome === "function") {
    window.applyAccountSettingsMenuChrome();
  }
  if (typeof updateAppNavigation === "function") {
    updateAppNavigation();
  }
  refreshAuthEntranceStages();
}

function stripInviteQueryFromUrlIfPresent() {
  try {
    if (!window.location.search) {
      return;
    }
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
  } catch (e) {
    console.warn("[navigateAppBack] stripInviteQueryFromUrlIfPresent:", e);
  }
}

function navigateAppBack() {
  const currentView = String(appState.visibleAppView || "");
  const roleFromStorage = (() => {
    try {
      return localStorage.getItem("last_selected_role");
    } catch (e) {
      return "";
    }
  })();
  const role = appState.currentRole || roleFromStorage;

  if (currentView === "account-profile-edit") {
    showView("account-settings");
    return;
  }

  if (currentView === "accounting-view") {
    showView("event-details");
    if (typeof window.updateAppNavigation === "function") {
      window.updateAppNavigation();
    }
    return;
  }

  if (currentView === "host-dashboard" || currentView === "participant-dashboard") {
    const ok = window.confirm("ログアウトして最初の画面に戻りますか？");
    if (!ok) {
      return;
    }
    if (typeof window.handleLogoutAndReturnToLogin === "function") {
      void window.handleLogoutAndReturnToLogin();
    } else if (typeof showView === "function") {
      showView("login-screen");
    }
    return;
  }

  const isEventRelatedView =
    currentView === "event-details" ||
    currentView === "join-gate" ||
    currentView === "passcode-confirm" ||
    currentView === "waiting-room";

  if (isEventRelatedView) {
    if (!appState.currentRole && (role === "host" || role === "participant")) {
      appState.currentRole = role;
    }
    void (async () => {
      if (typeof window.exitEventDetailsToLevel3 === "function") {
        await window.exitEventDetailsToLevel3();
        return;
      }
      console.error("🔥 [Error] window.exitEventDetailsToLevel3 が未定義です。フォールバックでダッシュボードへ遷移します。");
      stripInviteQueryFromUrlIfPresent();
      if (typeof appState !== "undefined") {
        appState.eventId = "";
        appState.pendingEventIdFromUrl = "";
      }
      try {
        if (typeof window.teardownEventPageLiveListeners === "function") {
          window.teardownEventPageLiveListeners();
        }
      } catch (e) {
        console.warn("[navigateAppBack] fallback teardown:", e);
      }
      if (role === "host") {
        appState.currentRole = "host";
        appState.authSessionRoute = "host_workspace";
        showView("host-dashboard");
        if (typeof window.loadMyEvents === "function") {
          window.loadMyEvents().catch((e) => console.error("🔥 [Error] loadMyEvents 失敗:", e));
        }
      } else {
        appState.currentRole = "participant";
        appState.authSessionRoute = "participant_join";
        showView("participant-dashboard");
        if (typeof window.showPasscodeInputPanelOnly === "function") {
          window.showPasscodeInputPanelOnly();
        }
        if (typeof window.loadParticipantJoinedEvents === "function") {
          window.loadParticipantJoinedEvents().catch((e) =>
            console.error("🔥 [Error] loadParticipantJoinedEvents 失敗:", e)
          );
        }
      }
      if (typeof window.updateAppNavigation === "function") {
        window.updateAppNavigation();
      }
    })();
    return;
  }

  const goHostDashboard = async () => {
    stripInviteQueryFromUrlIfPresent();
    appState.currentRole = "host";
    appState.authSessionRoute = "host_workspace";
    showView("host-dashboard");
    if (typeof window.loadMyEvents === "function") {
      window.loadMyEvents().catch((e) => {
        console.error("🔥 [Error] loadMyEvents 失敗:", e);
      });
    } else {
      console.error("🔥 [Error] window.loadMyEvents が未定義です！");
    }
  };
  const goParticipantDashboard = async () => {
    stripInviteQueryFromUrlIfPresent();
    appState.currentRole = "participant";
    appState.authSessionRoute = "participant_join";
    showView("participant-dashboard");
    if (typeof window.showPasscodeInputPanelOnly === "function") {
      window.showPasscodeInputPanelOnly();
    }
    if (typeof window.loadParticipantJoinedEvents === "function") {
      window.loadParticipantJoinedEvents().catch((e) => {
        console.error("🔥 [Error] loadParticipantJoinedEvents 失敗:", e);
      });
    } else {
      console.error("🔥 [Error] window.loadParticipantJoinedEvents が未定義です！");
    }
  };

  if (role === "host") {
    void goHostDashboard();
    return;
  }
  if (role === "participant") {
    void goParticipantDashboard();
    return;
  }
  showView("login-screen");
}

window.navigateAppBack = navigateAppBack;

const UI_COMMON_EXPORTS = {
  APP_MANAGED_SECTION_IDS,
  APP_VIEW_GROUPS,
  setSectionVisibility,
  refreshAuthEntranceStages,
  showView,
  navigateAppBack,
  normalizePointerEventTarget,
};

Object.assign(window, UI_COMMON_EXPORTS);

export {
  APP_MANAGED_SECTION_IDS,
  APP_VIEW_GROUPS,
  setSectionVisibility,
  refreshAuthEntranceStages,
  showView,
  navigateAppBack,
  normalizePointerEventTarget,
};
