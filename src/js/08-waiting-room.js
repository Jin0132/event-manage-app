import {
  waitingRoomSection,
  waitingRoomStatusLine,
  waitingRoomHostDisplay,
  joinPasscodeConfirmPanel,
} from "./01-config-state-dom.js";
import { updateAppNavigation } from "./02-invite-nav-auth-ui.js";
import { showView } from "./02-ui-common.js";
import { getCurrentFirebaseAuthUid, getParticipantDocRefForEvent } from "./04-firebase-data.js";

let waitingRoomUnsub = null;

function teardownWaitingRoom() {
  if (waitingRoomUnsub) {
    waitingRoomUnsub();
    waitingRoomUnsub = null;
  }
  if (waitingRoomSection) {
    waitingRoomSection.hidden = true;
  }
  if (waitingRoomStatusLine) {
    waitingRoomStatusLine.textContent = "";
  }
  updateAppNavigation();
}

function navigateToEventDetail(eventId, role = "participant") {
  appState.currentRole = role === "host" ? "host" : "participant";
  try {
    localStorage.setItem("last_selected_role", appState.currentRole);
  } catch (e) {
    /* ignore */
  }
  const path = window.location.pathname || "/";
  window.location.href = `${path}?eventId=${encodeURIComponent(eventId)}`;
}

/**
 * パスコード経由の参加申請後に表示。hostDisplayName は検索時に得た host_name。
 * 先に参加者ドキュメントを 1 回取得して承認済みなら即イベントへ遷移し、承認待ちの間は messages/photos 等を読まない。
 */
function showWaitingRoomForJoinRequest(eventId, hostDisplayName) {
  void showWaitingRoomForJoinRequestAsync(eventId, hostDisplayName);
}

async function showWaitingRoomForJoinRequestAsync(eventId, hostDisplayName) {
  teardownWaitingRoom();
  if (joinPasscodeConfirmPanel) {
    joinPasscodeConfirmPanel.hidden = true;
  }
  if (waitingRoomHostDisplay) {
    waitingRoomHostDisplay.textContent = hostDisplayName || "—";
  }
  if (typeof showView === "function") {
    showView("waiting-room");
  } else if (waitingRoomSection) {
    waitingRoomSection.hidden = false;
  }
  const staleBackBar = waitingRoomSection?.querySelector(".section-back-bar");
  if (staleBackBar instanceof HTMLElement) {
    staleBackBar.style.display = "none";
  }
  if (waitingRoomStatusLine) {
    waitingRoomStatusLine.textContent = "";
  }
  updateAppNavigation();

  const uid = getCurrentFirebaseAuthUid();
  if (!eventId || !uid || typeof getParticipantDocRefForEvent !== "function") {
    return;
  }
  const ref = getParticipantDocRefForEvent(eventId, uid);
  try {
    const initial = await ref.get();
    if (initial.exists) {
      const st = initial.data()?.status;
      if (st === "approved") {
        teardownWaitingRoom();
        navigateToEventDetail(eventId);
        return;
      }
    }
  } catch (e) {
    console.error("待合室: 承認状態の初回取得エラー:", e);
    if (waitingRoomStatusLine) {
      waitingRoomStatusLine.textContent = "状態の確認に失敗しました。しばらくしてから再読み込みしてください。";
    }
  }

  waitingRoomUnsub = ref.onSnapshot(
    (snap) => {
      if (!snap.exists) {
        if (waitingRoomSection && !waitingRoomSection.hidden && waitingRoomStatusLine) {
          waitingRoomStatusLine.textContent =
            "申請が見つかりません。主催者により拒否された可能性があります。";
        }
        return;
      }
      const st = snap.data()?.status;
      if (st === "approved") {
        teardownWaitingRoom();
        navigateToEventDetail(eventId);
      }
    },
    (err) => {
      console.error("待合室の監視エラー:", err);
      if (waitingRoomStatusLine) {
        waitingRoomStatusLine.textContent = "接続エラーが発生しました。ページを再読み込みしてください。";
      }
    }
  );
}

function setupWaitingRoomHandlers() {
  /* 戻る遷移は navigateAppBack に一元化 */
}

const WAITING_ROOM_EXPORTS = {
  teardownWaitingRoom,
  navigateToEventDetail,
  showWaitingRoomForJoinRequest,
  showWaitingRoomForJoinRequestAsync,
  setupWaitingRoomHandlers,
};

Object.assign(window, WAITING_ROOM_EXPORTS);

export {
  teardownWaitingRoom,
  navigateToEventDetail,
  showWaitingRoomForJoinRequest,
  showWaitingRoomForJoinRequestAsync,
  setupWaitingRoomHandlers,
};
