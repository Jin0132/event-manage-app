import {
  appState,
  eventEditOverlay,
  eventEditForm,
  eventTitle,
  eventLocation,
  eventEditNameInput,
  eventEditDateInput,
  eventEditTimeInput,
  eventEditLocationInput,
  eventEditCancelButton,
  eventEditCloseButton,
  organizerPendingParticipantsBlock,
  organizerPendingParticipantsList,
  organizerPendingEmptyHint,
  organizerPasscodePanel,
  organizerPasscodeValue,
  organizerPasscodeCopyButton,
  eventEditButton,
  eventShareButton,
  joinStatusText,
} from "./01-config-state-dom.js";
import { isCurrentUserOrganizer, escapeHtml, escapeAttr } from "./03-utils-render-access.js";
import {
  ensureReadyForFirestoreWrite,
  getEventDocRef,
  getParticipantsCollectionRef,
  loadMyEvents,
  subscribeEventInfo,
  syncEventSocialFirestoreListeners,
} from "./04-firebase-data.js";
import {
  copyToClipboard,
  showToast,
  getEventInviteUrl,
  openQrModalForEvent,
  updateAppNavigation,
} from "./02-invite-nav-auth-ui.js";
import { EVENT_DISSOLVED_GRACE_MS } from "./04-event-details.js";
import { showView } from "./02-ui-common.js";

let organizerPendingPanelBound = false;
let organizerPasscodeCopyBound = false;
let organizerEventEditBound = false;
let eventEditPanelBound = false;

function eventDateTextToDateInputValue(dateText) {
  const s = String(dateText || "").trim();
  if (!s) {
    return "";
  }
  const isoDateTime = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (isoDateTime) {
    return `${isoDateTime[1]}T${isoDateTime[2]}`;
  }
  const isoDate = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoDate) {
    return `${isoDate[1]}T12:00`;
  }
  const jpWithTime = s.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日(?:（[^）]*）)?\s*(\d{1,2}):(\d{2})/
  );
  if (jpWithTime) {
    const y = jpWithTime[1];
    const mo = String(jpWithTime[2]).padStart(2, "0");
    const d = String(jpWithTime[3]).padStart(2, "0");
    const hh = String(jpWithTime[4]).padStart(2, "0");
    const mm = String(jpWithTime[5]).padStart(2, "0");
    return `${y}-${mo}-${d}T${hh}:${mm}`;
  }
  const jpDateOnly = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jpDateOnly) {
    const y = jpDateOnly[1];
    const mo = String(jpDateOnly[2]).padStart(2, "0");
    const d = String(jpDateOnly[3]).padStart(2, "0");
    return `${y}-${mo}-${d}T12:00`;
  }
  return "";
}

function eventDateTextToTimeInputValue(dateText) {
  const s = String(dateText || "").trim();
  if (!s) {
    return "12:00";
  }
  const isoDateTime = s.match(/^\d{4}-\d{2}-\d{2}[T\s](\d{2}:\d{2})/);
  if (isoDateTime) {
    return isoDateTime[1];
  }
  const jpWithTime = s.match(/(?:\d{4})年(?:\d{1,2})月(?:\d{1,2})日(?:（[^）]*）)?\s*(\d{1,2}):(\d{2})/);
  if (jpWithTime) {
    return `${String(jpWithTime[1]).padStart(2, "0")}:${jpWithTime[2]}`;
  }
  return "12:00";
}

function formatDateTimeLocalToEventDateText(value) {
  const v = String(value || "").trim();
  if (!v) {
    return "";
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    return v;
  }
  const lang = typeof getCurrentAppLanguage === "function" ? getCurrentAppLanguage() : "ja";
  if (lang === "en") {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  }
  const wdays = ["日", "月", "火", "水", "木", "金", "土"];
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const wd = wdays[d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}年${mo}月${day}日（${wd}） ${hh}:${mm}`;
}

function closeEventEditPanel() {
  if (!eventEditOverlay) {
    return;
  }
  eventEditOverlay.hidden = true;
  document.body.classList.remove("event-edit-open");
}

function ensureEventEditDateInputIsDateTimeLocal() {
  if (!eventEditDateInput || !eventEditTimeInput) {
    return;
  }
  if (eventEditDateInput.type !== "date") {
    eventEditDateInput.type = "date";
  }
  if (eventEditTimeInput.type !== "time") {
    eventEditTimeInput.type = "time";
  }
  eventEditTimeInput.step = "60";
}

function openEventEditPanel() {
  const isOrganizer =
    typeof isCurrentUserOrganizer === "function" ? isCurrentUserOrganizer() : false;
  if (!isOrganizer || appState.isDissolved) {
    return;
  }
  if (!eventEditOverlay || !eventEditForm) {
    return;
  }
  ensureEventEditDateInputIsDateTimeLocal();
  const title =
    String(appState.eventDocTitle || "").trim() ||
    String(eventTitle?.textContent || "").trim();
  const dateVal = eventDateTextToDateInputValue(appState.eventDocDateText);
  const timeVal = eventDateTextToTimeInputValue(appState.eventDocDateText);
  const location =
    String(appState.eventDocLocation || "").trim() ||
    String(eventLocation?.textContent || "").trim();
  if (eventEditNameInput) {
    eventEditNameInput.value = title;
  }
  if (eventEditDateInput) {
    eventEditDateInput.value = dateVal;
  }
  if (eventEditTimeInput) {
    eventEditTimeInput.value = timeVal;
  }
  if (eventEditLocationInput) {
    eventEditLocationInput.value = location;
  }
  eventEditOverlay.hidden = false;
  document.body.classList.add("event-edit-open");
  window.requestAnimationFrame(() => {
    eventEditNameInput?.focus();
  });
}

async function submitEventEditForm(event) {
  event.preventDefault();
  const isOrganizer =
    typeof isCurrentUserOrganizer === "function" ? isCurrentUserOrganizer() : false;
  if (!isOrganizer || appState.isDissolved) {
    return;
  }
  const title = String(eventEditNameInput?.value || "").trim();
  const dateOnly = String(eventEditDateInput?.value || "").trim();
  const timeOnly = String(eventEditTimeInput?.value || "").trim();
  const dateLocal = dateOnly && timeOnly ? `${dateOnly}T${timeOnly}` : "";
  const dateText = formatDateTimeLocalToEventDateText(dateLocal);
  const location = String(eventEditLocationInput?.value || "").trim();
  if (!title || !dateText || !location) {
    window.alert("イベント名・日時・場所はすべて入力してください。");
    return;
  }
  try {
    await ensureReadyForFirestoreWrite();
    await getEventDocRef().update({
      title,
      dateText,
      location,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    if (appState.eventId && typeof logEventNotificationTrigger === "function") {
      void logEventNotificationTrigger(appState.eventId, "event_info_updated", {
        title,
        dateText,
        location,
      });
    }
    showToast("イベント情報を更新しました。");
    closeEventEditPanel();
  } catch (e) {
    console.error("イベント情報更新エラー:", e);
    window.alert(`イベント情報の更新に失敗しました\n${e?.message || String(e)}`);
  }
}

function setupEventEditPanel() {
  if (eventEditPanelBound || !eventEditOverlay || !eventEditForm) {
    return;
  }
  ensureEventEditDateInputIsDateTimeLocal();
  eventEditPanelBound = true;
  eventEditForm.addEventListener("submit", (e) => {
    void submitEventEditForm(e);
  });
  eventEditCancelButton?.addEventListener("click", () => {
    closeEventEditPanel();
  });
  eventEditCloseButton?.addEventListener("click", () => {
    closeEventEditPanel();
  });
  eventEditOverlay.addEventListener("click", (e) => {
    if (e.target === eventEditOverlay) {
      closeEventEditPanel();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || eventEditOverlay.hidden) {
      return;
    }
    closeEventEditPanel();
  });
}

function isOrganizerForPendingUi() {
  return (
    appState.participantAccessMode === "organizer" ||
    (typeof isCurrentUserOrganizer === "function" && isCurrentUserOrganizer())
  );
}

function getPendingParticipantsFromState() {
  return appState.participants.filter((p) => String(p.status || "") === "pending");
}

function renderOrganizerPendingParticipantsUI() {
  if (!organizerPendingParticipantsBlock || !organizerPendingParticipantsList) {
    return;
  }
  if (!isOrganizerForPendingUi()) {
    organizerPendingParticipantsBlock.hidden = true;
    organizerPendingParticipantsList.innerHTML = "";
    if (organizerPendingEmptyHint) {
      organizerPendingEmptyHint.hidden = true;
    }
    return;
  }
  organizerPendingParticipantsBlock.hidden = false;
  const pending = getPendingParticipantsFromState();
  if (organizerPendingEmptyHint) {
    organizerPendingEmptyHint.hidden = pending.length > 0;
  }
  organizerPendingParticipantsList.innerHTML = "";
  pending.forEach((p) => {
    const li = document.createElement("li");
    li.className = "organizer-pending-row";
    li.innerHTML = `
      <div class="organizer-pending-row__main">
        <strong class="organizer-pending-name">${escapeHtml(p.name || "（無名）")}</strong>
        <span class="organizer-pending-meta note">UID: ${escapeHtml(p.participantUid || p.id || "—")}</span>
      </div>
      <div class="organizer-pending-row__actions">
        <button type="button" class="secondary-button pending-approve-btn" data-participant-id="${escapeAttr(
          p.id
        )}">承認</button>
        <button type="button" class="danger-button pending-reject-btn" data-participant-id="${escapeAttr(
          p.id
        )}">拒否</button>
      </div>
    `;
    organizerPendingParticipantsList.appendChild(li);
  });
}

async function approvePendingParticipant(participantDocId) {
  const pid = String(participantDocId || "").trim();
  if (!pid) {
    return;
  }
  try {
    await ensureReadyForFirestoreWrite();
    await getParticipantsCollectionRef().doc(pid).update({
      status: "approved",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast("承認しました。");
  } catch (e) {
    console.error("承認エラー:", e);
    alert(`承認に失敗しました\n${e?.message || String(e)}`);
  }
}

async function rejectPendingParticipant(participantDocId) {
  const pid = String(participantDocId || "").trim();
  if (!pid) {
    return;
  }
  if (!window.confirm("この参加申請を拒否し、データを削除します。よろしいですか？")) {
    return;
  }
  try {
    await ensureReadyForFirestoreWrite();
    await getParticipantsCollectionRef().doc(pid).delete();
    showToast("拒否しました（ドキュメントを削除しました）。");
  } catch (e) {
    console.error("拒否エラー:", e);
    alert(`拒否に失敗しました\n${e?.message || String(e)}`);
  }
}

function setupOrganizerPasscodeCopyButton() {
  if (organizerPasscodeCopyBound || !organizerPasscodeCopyButton) {
    return;
  }
  organizerPasscodeCopyBound = true;
  organizerPasscodeCopyButton.addEventListener("click", async () => {
    const code = String(appState.eventPasscode || "").trim();
    if (!code) {
      return;
    }
    try {
      await copyToClipboard(code);
      showToast("パスコードをコピーしました");
    } catch (e) {
      console.error("パスコードコピー:", e);
      alert("コピーに失敗しました。");
    }
  });
}

function setupOrganizerEventEditButton() {
  setupEventEditPanel();
  if (organizerEventEditBound || !eventEditButton) {
    return;
  }
  organizerEventEditBound = true;
  eventEditButton.addEventListener("click", () => {
    openEventEditPanel();
  });
}

function openShareBottomSheet(forEventId) {
  setupShareBottomSheet();
  if (forEventId != null && forEventId !== "") {
    const id = String(forEventId).trim();
    if (id) {
      appState.eventId = id;
    }
  }
  const wrap = document.getElementById("shareBottomSheet");
  if (!wrap) {
    return;
  }
  wrap.removeAttribute("hidden");
  void wrap.offsetWidth;
  requestAnimationFrame(() => {
    wrap.classList.add("bottom-sheet-wrap--open");
    document.body.classList.add("share-bottom-sheet-open");
  });
}

function closeShareBottomSheet() {
  const wrap = document.getElementById("shareBottomSheet");
  if (!wrap) {
    return;
  }
  wrap.classList.remove("bottom-sheet-wrap--open");
  document.body.classList.remove("share-bottom-sheet-open");
  wrap.setAttribute("hidden", "");
}

function setupShareBottomSheet() {
  const wrap = document.getElementById("shareBottomSheet");
  const backdrop = document.getElementById("shareBottomSheetBackdrop");
  const cancel = document.getElementById("bsCancelButton");
  const copyBtn = document.getElementById("bsCopyLinkButton");
  const qrBtn = document.getElementById("bsShowQrButton");
  if (!wrap || wrap.dataset.bound === "1") {
    return;
  }
  wrap.dataset.bound = "1";
  backdrop?.addEventListener("click", () => {
    closeShareBottomSheet();
  });
  cancel?.addEventListener("click", () => {
    closeShareBottomSheet();
  });
  copyBtn?.addEventListener("click", () => {
    void (async () => {
      const id = String(appState.eventId || "").trim();
      if (!id || typeof getEventInviteUrl !== "function") {
        closeShareBottomSheet();
        return;
      }
      const url = getEventInviteUrl(id);
      try {
        if (typeof copyToClipboard === "function") {
          await copyToClipboard(url);
        }
        if (typeof showToast === "function") {
          showToast("招待リンクをコピーしました");
        }
      } catch (e) {
        console.error("share sheet copy:", e);
      }
      closeShareBottomSheet();
    })();
  });
  qrBtn?.addEventListener("click", () => {
    const id = String(appState.eventId || "").trim();
    if (id && typeof openQrModalForEvent === "function") {
      openQrModalForEvent(id);
    }
    closeShareBottomSheet();
  });
}

function setupModernActionMenu() {
  const menuToggle = document.getElementById("modernActionMenuToggle");
  const actionMenu = document.getElementById("modernActionMenu");
  if (!menuToggle || !actionMenu || menuToggle.dataset.bound === "1") {
    return;
  }
  menuToggle.setAttribute("aria-expanded", "false");
  const closeMenu = () => {
    if (!actionMenu.classList.contains("is-open")) {
      actionMenu.hidden = true;
      menuToggle.setAttribute("aria-expanded", "false");
      return;
    }
    actionMenu.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      actionMenu.hidden = true;
    }, 250);
  };
  menuToggle.dataset.bound = "1";
  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = actionMenu.classList.contains("is-open");
    if (!isOpen) {
      actionMenu.hidden = false;
      requestAnimationFrame(() => {
        actionMenu.classList.add("is-open");
        menuToggle.setAttribute("aria-expanded", "true");
      });
    } else {
      closeMenu();
    }
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) {
      return;
    }
    if (
      actionMenu.classList.contains("is-open") &&
      !actionMenu.contains(e.target) &&
      e.target !== menuToggle &&
      !menuToggle.contains(e.target)
    ) {
      closeMenu();
    }
  });

  actionMenu.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) {
      return;
    }
    if (e.target.closest(".modern-action-menu-item")) {
      closeMenu();
    }
  });

  const openAccountingBtn = document.getElementById("openAccountingButton");
  if (openAccountingBtn && openAccountingBtn.dataset.accountingNavBound !== "1") {
    openAccountingBtn.dataset.accountingNavBound = "1";
    openAccountingBtn.addEventListener("click", () => {
      showView("accounting-view");
      if (typeof window.openAccountingView === "function") {
        window.openAccountingView();
      }
    });
  }
}

function setupEventShareButton() {
  setupModernActionMenu();
  setupShareBottomSheet();
  if (!eventShareButton || eventShareButton.dataset.shareBound) {
    return;
  }
  eventShareButton.dataset.shareBound = "1";
  eventShareButton.addEventListener("click", () => {
    const id = String(appState.eventId || "").trim();
    if (!id) {
      return;
    }
    openShareBottomSheet();
  });
}

function renderOrganizerPasscodePanel() {
  setupOrganizerEventEditButton();
  setupOrganizerPasscodeCopyButton();
  if (!organizerPasscodePanel || !organizerPasscodeValue) {
    return;
  }
  const show =
    isOrganizerForPendingUi() && !!(appState.eventPasscode && String(appState.eventPasscode).trim());
  organizerPasscodePanel.hidden = !show;
  if (show) {
    organizerPasscodeValue.textContent = appState.eventPasscode;
  }
}

function setupOrganizerPendingParticipantsPanel() {
  if (!organizerPendingParticipantsBlock || organizerPendingPanelBound) {
    return;
  }
  organizerPendingPanelBound = true;
  organizerPendingParticipantsBlock.addEventListener("click", (event) => {
    const raw = event.target;
    if (!(raw instanceof Element)) {
      return;
    }
    const btn = raw.closest("button");
    if (!btn || !organizerPendingParticipantsBlock.contains(btn)) {
      return;
    }
    const docId = btn.getAttribute("data-participant-id") || "";
    if (btn.classList.contains("pending-approve-btn")) {
      void approvePendingParticipant(docId);
      return;
    }
    if (btn.classList.contains("pending-reject-btn")) {
      void rejectPendingParticipant(docId);
    }
  });
}

/**
 * イベントを解散状態へ移行（is_dissolved + dissolved_at + will_delete_at）。
 * 成功後はマイイベント一覧へ戻す。
 */
async function dissolveEventImmediately() {
  const isOrganizer =
    typeof isCurrentUserOrganizer === "function" ? isCurrentUserOrganizer() : false;
  if (!isOrganizer) {
    if (joinStatusText) {
      joinStatusText.textContent = "主催者のみイベントを解散できます。";
    }
    return;
  }
  if (appState.isDissolved) {
    if (joinStatusText) {
      joinStatusText.textContent = "すでに解散済みです。";
    }
    return;
  }
  const dissolveConfirmMessage =
    "本当にこのイベントを解散しますか？\n\n" +
    "【注意】\n" +
    "・解散後は通常イベントとしての募集を停止します。\n" +
    "・一覧では「🏁 解散」セクションに表示されます。\n" +
    "・解散後、72時間でデータは完全に非表示になります。";
  if (!window.confirm(dissolveConfirmMessage)) {
    return;
  }
  try {
    await ensureReadyForFirestoreWrite();
    const dissolveEventId = appState.eventId || "";
    const eventRef = getEventDocRef();
    if (typeof teardownEventPageLiveListeners === "function") {
      teardownEventPageLiveListeners();
    }
    const willDeleteAtTs = firebase.firestore.Timestamp.fromMillis(
      Date.now() + 72 * 60 * 60 * 1000
    );
    await eventRef.update({
      is_dissolved: true,
      is_active: false,
      dissolved_at: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      will_delete_at: willDeleteAtTs,
    });
    if (dissolveEventId && typeof logEventNotificationTrigger === "function") {
      void logEventNotificationTrigger(dissolveEventId, "event_dissolved", {
        willDeleteAt: willDeleteAtTs.toMillis(),
      });
    }
    appState.eventId = "";
    const path = window.location.pathname || "/";
    window.history.replaceState({}, "", path);
    appState.authSessionRoute = "host_workspace";
    appState.appShellEntered = true;
    if (typeof setCreateModeUI === "function") {
      setCreateModeUI();
    } else if (typeof showView === "function") {
      showView("host-dashboard");
      if (typeof loadMyEvents === "function") {
        loadMyEvents();
      }
      if (typeof updateAppNavigation === "function") {
        updateAppNavigation();
      }
    }
    if (joinStatusText) {
      joinStatusText.textContent = "イベントを解散しました。";
    }
    window.alert(
      "イベントを解散しました。72時間後に自動で非表示になります。"
    );
  } catch (error) {
    console.error("解散処理エラー:", error);
    if (joinStatusText) {
      joinStatusText.textContent = "解散処理に失敗しました。";
    }
    alert(`解散処理に失敗しました\n${error?.message || String(error)}`);
    if (appState.eventId) {
      if (typeof subscribeEventInfo === "function") {
        subscribeEventInfo();
      }
      if (typeof syncEventSocialFirestoreListeners === "function") {
        syncEventSocialFirestoreListeners();
      }
    }
  }
}

const HOST_DASH_EXPORTS = {
  eventDateTextToDateInputValue,
  closeEventEditPanel,
  openEventEditPanel,
  submitEventEditForm,
  setupEventEditPanel,
  isOrganizerForPendingUi,
  getPendingParticipantsFromState,
  renderOrganizerPendingParticipantsUI,
  approvePendingParticipant,
  rejectPendingParticipant,
  setupOrganizerPasscodeCopyButton,
  setupOrganizerEventEditButton,
  setupEventShareButton,
  openShareBottomSheet,
  renderOrganizerPasscodePanel,
  setupOrganizerPendingParticipantsPanel,
  dissolveEventImmediately,
};

Object.assign(window, HOST_DASH_EXPORTS);

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setupShareBottomSheet(), { once: true });
  } else {
    setupShareBottomSheet();
  }
}

export {
  eventDateTextToDateInputValue,
  closeEventEditPanel,
  openEventEditPanel,
  submitEventEditForm,
  setupEventEditPanel,
  isOrganizerForPendingUi,
  getPendingParticipantsFromState,
  renderOrganizerPendingParticipantsUI,
  approvePendingParticipant,
  rejectPendingParticipant,
  setupOrganizerPasscodeCopyButton,
  setupOrganizerEventEditButton,
  setupEventShareButton,
  openShareBottomSheet,
  renderOrganizerPasscodePanel,
  setupOrganizerPendingParticipantsPanel,
  dissolveEventImmediately,
};
