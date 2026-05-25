/* L1–L4 ナビ補助（showView は 02-ui-common.js） — load order matters */
import { appState, db } from "./01-config-state-dom.js";

async function openEventDetailsFromHostDashboard(eventId) {
  const id = String(eventId || "").trim();
  if (!id) {
    return;
  }
  appState.appShellEntered = false;
  appState.eventId = id;
  appState.pendingEventIdFromUrl = "";
  appState.authSessionRoute = "event_page";
  if (typeof window.enterEventMainUiFromInviteLink === "function") {
    await window.enterEventMainUiFromInviteLink();
    return;
  }
  if (typeof window.showView === "function") {
    window.showView("event-details");
  }
}

/** L4 から L3 へ（主催: マイイベント / 参加: パスコード）— URL クエリ除去とリスナー停止の単一入口 */
async function exitEventDetailsToLevel3() {
  try {
    if (typeof window.teardownEventPageLiveListeners === "function") {
      window.teardownEventPageLiveListeners();
    }
  } catch (e) {
    console.warn("[exitEventDetailsToLevel3] teardown:", e);
  }
  const cleanUrl = window.location.origin + window.location.pathname;
  try {
    window.history.replaceState({}, "", cleanUrl);
  } catch (e) {
    console.warn("[exitEventDetailsToLevel3] replaceState:", e);
  }
  appState.eventId = "";
  appState.pendingEventIdFromUrl = "";
  appState.appShellEntered = false;
  if (appState.currentRole === "host") {
    appState.authSessionRoute = "host_workspace";
    appState.appShellEntered = true;
    if (typeof window.setCreateModeUI === "function") {
      window.setCreateModeUI();
    } else if (typeof window.showView === "function") {
      window.showView("host-dashboard");
      if (typeof window.loadMyEvents === "function") {
        void window.loadMyEvents();
      }
    }
  } else {
    appState.authSessionRoute = "participant_join";
    if (typeof window.showJoinByPasscodeFlow === "function") {
      window.showJoinByPasscodeFlow();
    } else if (typeof window.showView === "function") {
      window.showView("participant-dashboard");
      if (typeof window.loadParticipantJoinedEvents === "function") {
        void window.loadParticipantJoinedEvents();
      }
    }
  }
  if (typeof window.updateAppNavigation === "function") {
    window.updateAppNavigation();
  }
}

/** 招待 URL の eventId でイベントを開く（役割選択の CTA 用） */
async function openPendingEventFromInviteUrl() {
  const id = String(appState.pendingEventIdFromUrl || "").trim();
  if (!id) {
    return;
  }
  if (!appState.currentRole) {
    appState.currentRole = "participant";
  }
  appState.eventId = id;
  appState.pendingEventIdFromUrl = "";
  appState.appShellEntered = false;
  appState.authSessionRoute = "event_page";
  const path = window.location.pathname || "/";
  window.history.replaceState({}, "", `${path}?eventId=${encodeURIComponent(id)}`);
  if (typeof window.enterEventMainUiFromInviteLink === "function") {
    await window.enterEventMainUiFromInviteLink();
  }
}

function updateRoleSelectPendingInvitePanel() {
  const panel = document.getElementById("roleSelectPendingInvitePanel");
  const has = !!(appState.pendingEventIdFromUrl && String(appState.pendingEventIdFromUrl).trim());
  if (panel) {
    panel.hidden = !has;
  }
}

/**
 * 役割選択「参加者」: 招待URLに eventId があり、イベントにパスコードが無い場合はパスコード画面を挟まずイベントへ。
 */
async function enterParticipantFlowFromRoleSelect() {
  try {
    if (typeof assertProfileCompleteForMainFlow === "function") {
      await assertProfileCompleteForMainFlow();
    }
  } catch (e) {
    if (String(e && e.message) === "profile_incomplete") {
      return;
    }
    console.error(e);
    return;
  }
  appState.currentRole = "participant";
  const pending = String(appState.pendingEventIdFromUrl || "").trim();
  if (pending && typeof isFirebaseAppReady === "function" && isFirebaseAppReady()) {
    try {
      await window.initializeFirebaseAuthReady();
      const snap = await db.collection("events").doc(pending).get();
      if (snap.exists) {
        const d = snap.data() || {};
        const pc = d.passcode != null ? String(d.passcode).trim() : "";
        if (!pc) {
          await openPendingEventFromInviteUrl();
          if (typeof window.updateAppNavigation === "function") {
            window.updateAppNavigation();
          }
          return;
        }
      }
    } catch (e) {
      console.error("招待イベント確認:", e);
    }
  }
  if (typeof window.showJoinByPasscodeFlow === "function") {
    window.showJoinByPasscodeFlow();
  }
  if (typeof window.updateAppNavigation === "function") {
    window.updateAppNavigation();
  }
}

const APP_VIEWS_EXPORTS = {
  openEventDetailsFromHostDashboard,
  exitEventDetailsToLevel3,
  openPendingEventFromInviteUrl,
  updateRoleSelectPendingInvitePanel,
  enterParticipantFlowFromRoleSelect,
};

Object.assign(window, APP_VIEWS_EXPORTS);

export {
  openEventDetailsFromHostDashboard,
  exitEventDetailsToLevel3,
  openPendingEventFromInviteUrl,
  updateRoleSelectPendingInvitePanel,
  enterParticipantFlowFromRoleSelect,
};
