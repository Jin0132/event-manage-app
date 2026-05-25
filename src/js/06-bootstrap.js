/* 起動・画面切り替え — load order matters */
import {
  appState,
  DEFAULT_AVATAR_URL,
  DEFAULT_EVENT,
  nameInput,
  joinSection,
  rsvpEditModal,
  rsvpEditForm,
  rsvpEditCloseButton,
  rsvpEditCommentInput,
  rsvpEditStatusText,
  dmModal,
  dmModalTitle,
  dmModalCloseButton,
  dmMessagesList,
  dmForm,
  dmMessageInput,
  dmStatusText,
  createPremiumInput,
  myEventsGrid,
  joinStatusText,
  participantsBody,
  dissolveButton,
  upgradeButtonPhotos,
  upgradeButtonMessages,
} from "./01-config-state-dom.js";
import { normalizePointerEventTarget, showView } from "./02-ui-common.js";
import {
  isPremiumFeaturesEnabled,
  updateAppNavigation,
  setupAppNavigation,
} from "./02-invite-nav-auth-ui.js";
import { setupRoleSelectHandlers, setupAccountAvatarMenu, hideRoleSelectUI } from "./01-auth.js";
import {
  isFirebaseAppReady,
  initializeFirebaseAuthReady,
  ensureEventDocumentExists,
  evaluateParticipantEventAccess,
  subscribeEventInfo,
  subscribeParticipants,
  subscribeDirectMessagesThread,
  closeDirectMessagesThreadSubscription,
  sendDirectMessageToUser,
  getParticipantsCollectionRef,
} from "./04-firebase-data.js";
import {
  setupForm,
  setCreateModeUI,
  setEventModeUI,
  openUpgradeGuide,
  setupCalendarAfterRsvp,
  setupPhotoUpload,
  setupChatForm,
  setupOrganizerAnnouncementForm,
  setupQrModalHandlers,
} from "./05-forms-features.js";
import { setupEventShareButton, setupOrganizerPendingParticipantsPanel, dissolveEventImmediately } from "./06-host-dash.js";
import {
  setupLoginAuthDelegation,
  setupGoogleAuthButtons,
  setupEmailAuthUi,
  setAuthStatusLine,
  showAuthSelectionUI,
  hideAuthSelectionUI,
} from "./07-login-screen.js";
import { setupPasscodeJoinHandlers, hideJoinByPasscodeFlow } from "./05-join-event.js";
import { setupWaitingRoomHandlers, teardownWaitingRoom } from "./08-waiting-room.js";
import { assertProfileCompleteForMainFlow, setupUserProfileForm } from "./11-user-profile.js";
import { applyAuthSessionRouteFromUser } from "./09-app-session-routing.js";
import { openEventDetailsFromHostDashboard } from "./10-app-views.js";
import { setupCreateForm } from "./04-create-event.js";
import {
  renderParticipants,
  renderPhotos,
  renderMessages,
  updateJoinButtonUI,
  updateAccessControlUI,
  applyEventInfo,
  getEventIdFromQuery,
} from "./03-utils-render-access.js";
import { initPwaAndMessaging } from "./12-pwa-fcm.js";

let participantRowsClickBound = false;
let dmRenderUnsub = null;
let guestAccessChoiceBusy = false;
let participantInfoActionHandler = null;

function bindHostDashboardInteractions() {
  if (myEventsGrid && !myEventsGrid.dataset.boundHostEventDelegation) {
    myEventsGrid.dataset.boundHostEventDelegation = "1";
    myEventsGrid.addEventListener("click", async (event) => {
      console.log("🔥 [Debug] 主催者Gridがクリックされました", event.target);
      const target = normalizePointerEventTarget(event.target);
      if (!target) {
        return;
      }
      const shareBtn = target.closest(".my-event-share-button");
      if (shareBtn) {
        event.preventDefault();
        event.stopPropagation();
        const eventId = String(shareBtn.getAttribute("data-event-id") || "").trim();
        if (!eventId || typeof window.openShareBottomSheet !== "function") {
          return;
        }
        window.openShareBottomSheet(eventId);
        return;
      }
      const eventNode = target.closest("[data-event-id]");
      if (!eventNode || !myEventsGrid.contains(eventNode)) {
        console.log("🔥 [Debug] 取得したCard:", eventNode, "EventID:", "");
        return;
      }
      const eventId = String(eventNode.getAttribute("data-event-id") || "").trim();
      console.log("🔥 [Debug] 取得したeventId:", eventId);
      console.log("🔥 [Debug] 取得したCard:", eventNode, "EventID:", eventId);
      if (!eventId) {
        return;
      }
      event.preventDefault();
      try {
        await openEventDetailsFromHostDashboard(eventId);
      } catch (e) {
        console.error("🔥 [Error] openEventDetailsFromHostDashboard 失敗:", e);
      }
    });
  }
  const newEvBtn = document.getElementById("myEventsNewEventButton");
  if (newEvBtn && !newEvBtn.dataset.bound) {
    newEvBtn.dataset.bound = "1";
    newEvBtn.addEventListener("click", () => {
      if (typeof showView === "function") {
        showView("host-create");
      }
    });
  }
}

function markDirectMessagesReadFromSender(senderUid) {
  const uid = String(senderUid || "").trim();
  if (!uid) {
    return;
  }
  try {
    localStorage.setItem(`last_read_dm_timestamp_${uid}`, String(Date.now()));
  } catch (e) {
    /* ignore */
  }
}

function closeFullscreenModalsSafely() {
  if (typeof resetBlockingOverlays === "function") {
    resetBlockingOverlays();
    return;
  }
  ["emailAuthModal", "qrModal", "iosAddToHomeModal"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.setAttribute("hidden", "");
    el.hidden = true;
    el.style.removeProperty("display");
  });
}

function hideAppLoadingScreen() {
  const loading = document.getElementById("app-loading-screen");
  if (!loading || loading.dataset.closed === "1") {
    return;
  }
  loading.dataset.closed = "1";
  loading.classList.add("fade-out");
  window.setTimeout(() => {
    loading.classList.add("hidden");
    loading.setAttribute("hidden", "");
  }, 520);
}

export async function startHostDashboard() {
  if (appState.appShellEntered) {
    return;
  }
  if (typeof isFirebaseAppReady !== "function" || !isFirebaseAppReady()) {
    return;
  }
  if (!firebase.auth().currentUser) {
    return;
  }
  try {
    if (typeof assertProfileCompleteForMainFlow === "function") {
      await assertProfileCompleteForMainFlow();
    }
  } catch (e) {
    if (String(e && e.message) === "profile_incomplete") {
      return;
    }
    throw e;
  }

  appState.authSessionRoute = "host_workspace";
  appState.currentRole = "host";
  appState.appShellEntered = true;
  hideAuthSelectionUI();
  if (typeof hideRoleSelectUI === "function") {
    hideRoleSelectUI();
  }
  if (typeof teardownWaitingRoom === "function") {
    teardownWaitingRoom();
  }
  if (typeof hideJoinByPasscodeFlow === "function") {
    hideJoinByPasscodeFlow();
  }

  appState.currentUserName = nameInput?.value?.trim() || "";
  if (!isPremiumFeaturesEnabled() && createPremiumInput) {
    createPremiumInput.checked = false;
    createPremiumInput.closest("label")?.setAttribute("hidden", "hidden");
  }

  try {
    setCreateModeUI();
    if (typeof setupCreateForm === "function") {
      setupCreateForm();
    } else if (typeof window.setupCreateForm === "function") {
      window.setupCreateForm();
    }
    bindHostDashboardInteractions();
    updateAppNavigation();
  } catch (error) {
    console.error("Host dashboard init エラー:", error);
    if (joinStatusText) {
      joinStatusText.textContent =
        typeof t === "function"
          ? t("status_ui_init_failed", "UI初期化に失敗しました。もう一度ページを開いてください。")
          : "UI初期化に失敗しました。もう一度ページを開いてください。";
    }
  }
}

export function maybeOrganizerQuickJoinAfterEnter() {
  if (!appState.organizerQuickJoinAfterCreate) {
    return;
  }
  appState.organizerQuickJoinAfterCreate = false;
  if (!joinSection) {
    return;
  }
  joinSection.classList.add("join-section--quick-highlight");
  if (joinStatusText) {
    joinStatusText.textContent =
      typeof t === "function"
        ? t(
            "status_quick_join_hint",
            "クイック参加: 主催者として名前と出欠を登録してください。「参加する」で一覧に反映されます。"
          )
        : "クイック参加: 主催者として名前と出欠を登録してください。「参加する」で一覧に反映されます。";
  }
  window.requestAnimationFrame(() => {
    joinSection.scrollIntoView({ behavior: "smooth", block: "center" });
    nameInput?.focus?.({ preventScroll: true });
  });
  window.setTimeout(() => {
    joinSection.classList.remove("join-section--quick-highlight");
  }, 10000);
}

function maybeNotJoinedFocusJoinFormAfterEnter() {
  if (appState.participantAccessMode !== "not_joined") {
    return;
  }
  if (!joinSection) {
    return;
  }
  joinSection.classList.add("join-section--not-joined-highlight");
  window.requestAnimationFrame(() => {
    joinSection.scrollIntoView({ behavior: "smooth", block: "center" });
    nameInput?.focus?.({ preventScroll: true });
  });
  window.setTimeout(() => {
    joinSection.classList.remove("join-section--not-joined-highlight");
  }, 10000);
}

function closeRsvpEditModal() {
  if (rsvpEditModal) {
    rsvpEditModal.hidden = true;
  }
}

function closeDmModal() {
  if (dmModal) {
    dmModal.hidden = true;
  }
  if (typeof dmRenderUnsub === "function") {
    dmRenderUnsub();
    dmRenderUnsub = null;
  }
  closeDirectMessagesThreadSubscription();
}

function getGuestAccessChoiceEls() {
  return {
    modal: document.getElementById("guestAccessChoiceModal"),
    closeButton: document.getElementById("guestAccessChoiceCloseButton"),
    quickAnswerButton: document.getElementById("guestQuickAnswerButton"),
    googleLoginButton: document.getElementById("guestGoogleLoginButton"),
    emailLoginButton: document.getElementById("guestEmailLoginButton"),
    statusText: document.getElementById("guestAccessChoiceStatusText"),
    eventGuestJoinButton: document.getElementById("eventGuestJoinButton"),
    photosLoginButton: document.getElementById("guestGoogleLoginButtonPhotos"),
    messagesLoginButton: document.getElementById("guestGoogleLoginButtonMessages"),
  };
}

function closeGuestAccessChoiceModal() {
  const { modal, statusText } = getGuestAccessChoiceEls();
  if (!modal) {
    return;
  }
  modal.hidden = true;
  if (statusText) {
    statusText.textContent = "";
  }
}

function openGuestAccessChoiceModal() {
  const { modal, statusText } = getGuestAccessChoiceEls();
  if (!modal) {
    return;
  }
  modal.hidden = false;
  if (statusText) {
    statusText.textContent = "";
  }
}

async function continueEventAfterGuestAuth() {
  if (!appState.eventId) {
    return;
  }
  await evaluateParticipantEventAccess();
  if (typeof setEventModeUI === "function") {
    setEventModeUI();
  }
  updateAppNavigation();
}

async function handleGuestQuickAnswerAuth() {
  const { statusText } = getGuestAccessChoiceEls();
  if (guestAccessChoiceBusy) {
    return;
  }
  guestAccessChoiceBusy = true;
  try {
    if (statusText) {
      statusText.textContent = "ログイン不要の回答モードを準備しています…";
    }
    await initializeFirebaseAuthReady();
    await firebase.auth().signInAnonymously();
    appState.currentRole = "participant";
    appState.authSessionRoute = "event_page";
    closeGuestAccessChoiceModal();
    appState.participantAccessMode = "not_joined";
    if (typeof showView === "function") {
      showView("join-gate");
    }
    await continueEventAfterGuestAuth();
  } catch (error) {
    console.error("guest quick answer auth error:", error);
    if (statusText) {
      statusText.textContent = `開始に失敗しました: ${error?.message || String(error)}`;
    }
  } finally {
    guestAccessChoiceBusy = false;
  }
}

async function handleGuestGoogleSignIn() {
  const { statusText } = getGuestAccessChoiceEls();
  if (guestAccessChoiceBusy) {
    return;
  }
  guestAccessChoiceBusy = true;
  try {
    if (statusText) {
      statusText.textContent = "Googleログインを開始します…";
    }
    await initializeFirebaseAuthReady();
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({ prompt: "select_account" });
    await firebase.auth().signInWithPopup(provider);
    closeGuestAccessChoiceModal();
    await continueEventAfterGuestAuth();
  } catch (error) {
    console.error("guest google sign-in error:", error);
    if (statusText) {
      statusText.textContent = `Googleログインに失敗しました: ${error?.message || String(error)}`;
    }
  } finally {
    guestAccessChoiceBusy = false;
  }
}

function setupGuestAccessChoiceModal() {
  const {
    modal,
    closeButton,
    quickAnswerButton,
    googleLoginButton,
    emailLoginButton,
    eventGuestJoinButton,
    photosLoginButton,
    messagesLoginButton,
  } = getGuestAccessChoiceEls();
  if (!modal || modal.dataset.bound === "1") {
    return;
  }
  modal.dataset.bound = "1";
  closeButton?.addEventListener("click", closeGuestAccessChoiceModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeGuestAccessChoiceModal();
    }
  });
  quickAnswerButton?.addEventListener("click", () => {
    void handleGuestQuickAnswerAuth();
  });
  googleLoginButton?.addEventListener("click", () => {
    void handleGuestGoogleSignIn();
  });
  emailLoginButton?.addEventListener("click", () => {
    closeGuestAccessChoiceModal();
    if (typeof openEmailAuthModal === "function") {
      openEmailAuthModal();
      return;
    }
    const emailModal = document.getElementById("emailAuthModal");
    if (emailModal) {
      emailModal.hidden = false;
      emailModal.removeAttribute("hidden");
    }
  });
  eventGuestJoinButton?.addEventListener("click", openGuestAccessChoiceModal);
  photosLoginButton?.addEventListener("click", () => {
    openGuestAccessChoiceModal();
  });
  messagesLoginButton?.addEventListener("click", () => {
    openGuestAccessChoiceModal();
  });
}

function renderDmMessages(rows) {
  if (!dmMessagesList) {
    return;
  }
  dmMessagesList.innerHTML = "";
  rows.forEach((message) => {
    const wrap = document.createElement("div");
    const isMine = message.senderAuthUid && message.senderAuthUid === appState.firebaseAuthUid;
    wrap.className = `message-item${isMine ? " message-item-mine" : ""}`;
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const from = document.createElement("span");
    from.textContent = message.senderName || "参加者";
    const time = document.createElement("span");
    time.textContent = message.timeText || "";
    meta.appendChild(from);
    meta.appendChild(time);
    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text || "";
    bubble.appendChild(meta);
    bubble.appendChild(text);
    wrap.appendChild(bubble);
    dmMessagesList.appendChild(wrap);
  });
  dmMessagesList.scrollTop = dmMessagesList.scrollHeight;
}

function openDmModal(targetUid, targetName) {
  if (!dmModal || !dmModalTitle) {
    return;
  }
  appState.activeDmTargetUid = String(targetUid || "").trim();
  const participantLabel =
    typeof t === "function" ? t("participant_label", "参加者") : "参加者";
  appState.activeDmTargetName = String(targetName || "").trim() || participantLabel;
  markDirectMessagesReadFromSender(appState.activeDmTargetUid);
  if (typeof renderParticipants === "function") {
    renderParticipants();
  }
  dmModalTitle.textContent =
    typeof t === "function"
      ? t("participant_dm_title", "{name} さんへのメッセージ", {
          name: appState.activeDmTargetName,
        })
      : `${appState.activeDmTargetName} さんへのメッセージ`;
  if (dmStatusText) {
    dmStatusText.textContent = "";
  }
  dmModal.hidden = false;
  if (typeof dmRenderUnsub === "function") {
    dmRenderUnsub();
  }
  dmRenderUnsub = subscribeDirectMessagesThread(appState.activeDmTargetUid, (rows) => {
    renderDmMessages(rows);
  });
}

function openRsvpEditModal(participantUid) {
  const uid = String(participantUid || "").trim();
  const mine = appState.participants.find((x) => String(x.participantUid || "").trim() === uid);
  if (!mine || !rsvpEditModal || !rsvpEditForm) {
    return;
  }
  const radio = rsvpEditForm.querySelector(`input[name="rsvpEditStatus"][value="${mine.status || "未定"}"]`);
  if (radio) {
    radio.checked = true;
  }
  if (rsvpEditCommentInput) {
    rsvpEditCommentInput.value = String(mine.comment || "");
  }
  if (rsvpEditStatusText) {
    rsvpEditStatusText.textContent = "";
  }
  rsvpEditModal.hidden = false;
}

function closeParticipantInfoModal() {
  const modal = document.getElementById("participantInfoModal");
  if (modal) {
    modal.hidden = true;
  }
  const actionButton = document.getElementById("participantInfoActionButton");
  if (actionButton) {
    actionButton.onclick = null;
    actionButton.hidden = false;
  }
  participantInfoActionHandler = null;
  const editBox = document.getElementById("participantInfoEditBox");
  const commentText = document.getElementById("participantInfoComment");
  const editIcon = document.getElementById("participantInfoEditIcon");
  const saveBtn = document.getElementById("inlineEditSaveBtn");
  if (editBox) {
    editBox.hidden = true;
  }
  if (commentText) {
    commentText.hidden = false;
  }
  if (editIcon) {
    editIcon.hidden = true;
  }
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = "保存";
  }
}

function openParticipantInfoModal(options) {
  const modal = document.getElementById("participantInfoModal");
  const avatar = document.getElementById("participantInfoAvatar");
  const name = document.getElementById("participantInfoName");
  const status = document.getElementById("participantInfoStatus");
  const comment = document.getElementById("participantInfoComment");
  const actionButton = document.getElementById("participantInfoActionButton");
  const editIcon = document.getElementById("participantInfoEditIcon");
  const editBox = document.getElementById("participantInfoEditBox");
  if (!modal || !avatar || !name || !status || !comment || !actionButton) {
    return;
  }
  const participantLabel =
    typeof t === "function" ? t("participant_label", "参加者") : "参加者";
  const statusValue = String(options?.status || "未定");
  name.textContent = String(options?.name || participantLabel);
  avatar.src = String(options?.avatar || DEFAULT_AVATAR_URL);
  avatar.referrerPolicy = "no-referrer";
  avatar.alt = `${name.textContent}のアイコン`;
  const statusText =
    statusValue === "出席"
      ? (typeof t === "function" ? t("participant_status_attend", "出席") : "出席")
      : statusValue === "欠席"
        ? (typeof t === "function" ? t("participant_status_absent", "欠席") : "欠席")
        : (typeof t === "function" ? t("participant_status_maybe", "未定") : "未定");
  status.textContent = statusText;
  status.className = "participant-info-modal__status";
  status.setAttribute("data-status", statusValue);
  comment.textContent =
    String(options?.comment || "").trim() ||
    (typeof t === "function" ? t("participant_comment_empty", "コメントはありません。") : "コメントはありません。");
  comment.hidden = false;

  if (options?.isSelf) {
    actionButton.hidden = true;
    actionButton.onclick = null;
    if (editIcon) {
      editIcon.hidden = false;
    }
  } else {
    actionButton.hidden = false;
    actionButton.textContent =
      typeof t === "function" ? t("participant_action_send_message", "メッセージを送る") : "メッセージを送る";
    if (editIcon) {
      editIcon.hidden = true;
    }
    participantInfoActionHandler = () => {
      closeParticipantInfoModal();
      openDmModal(options.uid, options.name);
    };
    actionButton.onclick = participantInfoActionHandler;
  }

  if (editBox) {
    editBox.hidden = true;
  }

  modal.hidden = false;
}

function setupParticipantInfoInlineEditHandlers() {
  const editIcon = document.getElementById("participantInfoEditIcon");
  const editBox = document.getElementById("participantInfoEditBox");
  const cancelBtn = document.getElementById("inlineEditCancelBtn");
  const saveBtn = document.getElementById("inlineEditSaveBtn");
  const inlineStatus = document.getElementById("inlineEditStatus");
  const inlineComment = document.getElementById("inlineEditComment");
  const commentText = document.getElementById("participantInfoComment");
  const statusEl = document.getElementById("participantInfoStatus");
  if (!editIcon || editIcon.dataset.bound === "1") {
    return;
  }
  editIcon.dataset.bound = "1";

  editIcon.addEventListener("click", () => {
    if (!editBox || !inlineStatus || !inlineComment || !commentText) {
      return;
    }
    editBox.hidden = false;
    commentText.hidden = true;
    editIcon.hidden = true;
    const raw = String(statusEl?.getAttribute("data-status") || "未定");
    inlineStatus.value = ["出席", "欠席", "未定"].includes(raw) ? raw : "未定";
    const emptyLabel =
      typeof t === "function" ? t("participant_comment_empty", "コメントはありません。") : "コメントはありません。";
    const cur = String(commentText.textContent || "").trim();
    inlineComment.value = cur === emptyLabel ? "" : cur;
  });

  cancelBtn?.addEventListener("click", () => {
    if (editBox) {
      editBox.hidden = true;
    }
    if (commentText) {
      commentText.hidden = false;
    }
    editIcon.hidden = false;
  });

  saveBtn?.addEventListener("click", async () => {
    const uid = firebase.auth().currentUser?.uid || "";
    if (!uid || !inlineStatus || !inlineComment || !saveBtn) {
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "保存中...";
    try {
      const newStatus = String(inlineStatus.value || "未定");
      const newComment = String(inlineComment.value || "").trim();
      await getParticipantsCollectionRef().doc(uid).set(
        {
          status: newStatus,
          comment: newComment,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await evaluateParticipantEventAccess();
      renderParticipants();
      closeParticipantInfoModal();
    } catch (error) {
      console.error("インライン出欠保存エラー:", error);
      window.alert("保存に失敗しました。");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "保存";
    }
  });
}

function setupParticipantInteractionModals() {
  setupParticipantInfoInlineEditHandlers();
  if (!participantsBody || participantRowsClickBound) {
    return;
  }
  participantRowsClickBound = true;
  participantsBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest(".participant-avatar-item--clickable");
    if (!row) {
      return;
    }
    const rowUid = String(row.getAttribute("data-participant-uid") || "").trim();
    const rowName = String(row.getAttribute("data-participant-name") || "").trim();
    const isSelf = row.getAttribute("data-is-self-row") === "1";
    if (!rowUid) {
      return;
    }
    openParticipantInfoModal({
      uid: rowUid,
      name: rowName || (typeof t === "function" ? t("participant_label", "参加者") : "参加者"),
      isSelf,
      status: String(row.getAttribute("data-participant-status") || "未定"),
      comment: String(row.getAttribute("data-participant-comment") || ""),
      avatar: String(row.getAttribute("data-participant-avatar") || DEFAULT_AVATAR_URL),
    });
  });

  rsvpEditCloseButton?.addEventListener("click", closeRsvpEditModal);
  rsvpEditModal?.addEventListener("click", (event) => {
    if (event.target === rsvpEditModal) {
      closeRsvpEditModal();
    }
  });
  rsvpEditForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const uid = firebase.auth().currentUser?.uid || "";
    if (!uid) {
      return;
    }
    const checked = rsvpEditForm.querySelector("input[name='rsvpEditStatus']:checked");
    const status = String(checked instanceof HTMLInputElement ? checked.value : "未定");
    const comment = String(rsvpEditCommentInput?.value || "").trim();
    try {
      await getParticipantsCollectionRef().doc(uid).set(
        {
          status,
          comment,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      if (rsvpEditStatusText) {
        rsvpEditStatusText.textContent = "更新しました。";
      }
      await evaluateParticipantEventAccess();
      closeRsvpEditModal();
    } catch (error) {
      console.error("出欠編集モーダル保存エラー:", error);
      if (rsvpEditStatusText) {
        rsvpEditStatusText.textContent = "保存に失敗しました。";
      }
    }
  });

  dmModalCloseButton?.addEventListener("click", closeDmModal);
  const participantInfoCloseButton = document.getElementById("participantInfoCloseButton");
  participantInfoCloseButton?.addEventListener("click", closeParticipantInfoModal);
  const participantInfoModal = document.getElementById("participantInfoModal");
  participantInfoModal?.addEventListener("click", (event) => {
    if (event.target === participantInfoModal) {
      closeParticipantInfoModal();
    }
  });
  dmModal?.addEventListener("click", (event) => {
    if (event.target === dmModal) {
      closeDmModal();
    }
  });
  dmForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(dmMessageInput?.value || "").trim();
    if (!text || !appState.activeDmTargetUid) {
      return;
    }
    const dmSubmitButton = dmForm.querySelector('button[type="submit"]');
    const defaultLabel = String(dmSubmitButton?.textContent || "送信");
    if (dmSubmitButton?.disabled) {
      return;
    }
    if (dmSubmitButton) {
      dmSubmitButton.disabled = true;
      dmSubmitButton.textContent = "送信中...";
    }
    try {
      await sendDirectMessageToUser(appState.activeDmTargetUid, text, appState.activeDmTargetName);
      if (dmMessageInput) {
        dmMessageInput.value = "";
      }
      if (dmStatusText) {
        dmStatusText.textContent = "";
      }
    } catch (error) {
      console.error("DM送信エラー:", error);
      if (dmStatusText) {
        dmStatusText.textContent = "送信に失敗しました。";
      }
    } finally {
      if (dmSubmitButton) {
        dmSubmitButton.disabled = false;
        dmSubmitButton.textContent = defaultLabel;
      }
    }
  });
}

export async function enterEventMainUiFromInviteLink() {
  if (appState.appShellEntered) {
    return;
  }
  if (typeof isFirebaseAppReady !== "function" || !isFirebaseAppReady()) {
    return;
  }
  const currentUser = firebase.auth().currentUser;
  if (currentUser && !currentUser.isAnonymous) {
    try {
      if (typeof assertProfileCompleteForMainFlow === "function") {
        await assertProfileCompleteForMainFlow();
      }
    } catch (e) {
      if (String(e && e.message) === "profile_incomplete") {
        return;
      }
      throw e;
    }
  }

  appState.authSessionRoute = "event_page";
  appState.appShellEntered = true;
  hideAuthSelectionUI();
  if (typeof hideRoleSelectUI === "function") {
    hideRoleSelectUI();
  }
  if (typeof teardownWaitingRoom === "function") {
    teardownWaitingRoom();
  }
  if (typeof hideJoinByPasscodeFlow === "function") {
    hideJoinByPasscodeFlow();
  }

  appState.currentUserName = nameInput?.value?.trim() || "";
  if (!isPremiumFeaturesEnabled() && createPremiumInput) {
    createPremiumInput.checked = false;
    createPremiumInput.closest("label")?.setAttribute("hidden", "hidden");
  }

  try {
    setupGuestAccessChoiceModal();
    if (!currentUser) {
      appState.currentRole = "participant";
      appState.participantAccessMode = "guest_readonly";
      if (typeof showView === "function") {
        showView("event-details");
      }
      if (joinStatusText) {
        joinStatusText.textContent = "ログインなしの閲覧モードです。参加する場合は「参加する」ボタンから進んでください。";
      }
      applyEventInfo(DEFAULT_EVENT);
      renderParticipants();
      appState.photos = [];
      appState.messages = [];
      subscribeEventInfo();
      subscribeParticipants();
      if (typeof updateAccessControlUI === "function") {
        updateAccessControlUI();
      }
      updateAppNavigation();
      return;
    }
    setEventModeUI();
    if (joinStatusText) {
      joinStatusText.textContent =
        typeof t === "function" ? t("status_event_id", `イベントID: ${appState.eventId}`, { eventId: appState.eventId }) : `イベントID: ${appState.eventId}`;
    }
    applyEventInfo(DEFAULT_EVENT);
    renderParticipants();
    renderPhotos();
    renderMessages();

    setupForm();
    setupGuestAccessChoiceModal();
    setupParticipantInteractionModals();
    if (typeof setupEventShareButton === "function") {
      setupEventShareButton();
    }
    setupCalendarAfterRsvp();
    if (typeof setupOrganizerPendingParticipantsPanel === "function") {
      setupOrganizerPendingParticipantsPanel();
    }
    setupPhotoUpload();
    setupChatForm();
    setupOrganizerAnnouncementForm();
    upgradeButtonPhotos?.addEventListener("click", openUpgradeGuide);
    upgradeButtonMessages?.addEventListener("click", openUpgradeGuide);
    dissolveButton?.addEventListener("click", dissolveEventImmediately);
    await ensureEventDocumentExists();
    await evaluateParticipantEventAccess();
    setEventModeUI();
    renderParticipants();
    if (appState.participantAccessMode === "organizer" || appState.participantAccessMode === "unlocked") {
      renderPhotos();
      renderMessages();
    } else {
      appState.photos = [];
      appState.messages = [];
      renderPhotos();
      renderMessages();
    }
    subscribeEventInfo();
    updateAppNavigation();
    window.setTimeout(() => {
      maybeOrganizerQuickJoinAfterEnter();
      maybeNotJoinedFocusJoinFormAfterEnter();
    }, 120);
  } catch (error) {
    console.error("Main UI init エラー:", error);
    if (joinStatusText) {
      joinStatusText.textContent =
        typeof t === "function"
          ? t("status_ui_init_failed", "UI初期化に失敗しました。もう一度ページを開いてください。")
          : "UI初期化に失敗しました。もう一度ページを開いてください。";
    }
  }
}

export function setupLoginAndNavigationAfterFirebaseReady() {
  if (typeof setupLoginAuthDelegation === "function") {
    setupLoginAuthDelegation();
  } else {
    const st = document.getElementById("authStatusLine");
    if (st) {
      st.textContent =
        typeof t === "function"
          ? t("status_login_script_missing", "エラー: ログイン用スクリプトが読み込まれていません。")
          : "エラー: ログイン用スクリプトが読み込まれていません。";
    }
  }
  setupGoogleAuthButtons();
  setupQrModalHandlers();
  setupAppNavigation();
  setupEmailAuthUi();
  if (typeof setupRoleSelectHandlers === "function") {
    setupRoleSelectHandlers();
  }
  if (typeof setupAccountAvatarMenu === "function") {
    setupAccountAvatarMenu();
  }
  if (typeof setupPasscodeJoinHandlers === "function") {
    setupPasscodeJoinHandlers();
  }
  if (typeof setupWaitingRoomHandlers === "function") {
    setupWaitingRoomHandlers();
  }
  if (typeof setupUserProfileForm === "function") {
    setupUserProfileForm();
  }
  bindHostDashboardInteractions();
  if (typeof initPwaAndMessaging === "function") {
    initPwaAndMessaging();
  }
  if (typeof applyTranslations === "function" && typeof getCurrentAppLanguage === "function") {
    applyTranslations(getCurrentAppLanguage());
  }
}

export async function bootstrap() {
  try {
    appState.bootstrapAuthRoutingReady = false;
    if (typeof setAuthStatusLine === "function") {
      setAuthStatusLine(typeof t === "function" ? t("status_preparing_firebase", "Firebase を準備しています…") : "Firebase を準備しています…");
    }

    appState.pendingEventIdFromUrl = getEventIdFromQuery() || "";
    appState.eventId = "";
    appState.isAuthReady = false;
    updateJoinButtonUI();

    closeFullscreenModalsSafely();

    await initializeFirebaseAuthReady();

    setupLoginAndNavigationAfterFirebaseReady();

    appState.bootstrapAuthRoutingReady = true;
    if (typeof applyAuthSessionRouteFromUser === "function") {
      await applyAuthSessionRouteFromUser(firebase.auth().currentUser || null);
    }

    if (typeof setAuthStatusLine === "function") {
      if (isFirebaseAppReady() && firebase.auth().currentUser) {
        if (appState.eventId) {
          setAuthStatusLine("画面を準備しています…");
        } else {
          setAuthStatusLine(typeof t === "function" ? t("status_choose_role", "役割を選んでください。") : "役割を選んでください。");
        }
      } else {
        setAuthStatusLine(
          typeof t === "function" ? t("status_choose_login_method", "ログイン方法を選んでください。") : "ログイン方法を選んでください。"
        );
      }
    }
    /* ログイン後ルートは applyAuthSessionRouteFromUser に統一（startMainUIIfLoggedIn と二重にしない） */
    hideAppLoadingScreen();
  } catch (error) {
    console.error("bootstrap エラー:", error);
    appState.bootstrapAuthRoutingReady = true;
    closeFullscreenModalsSafely();
    if (typeof showAuthSelectionUI === "function") {
      showAuthSelectionUI();
    }
    const msg = String(error?.message || error || "");
    if (joinStatusText) {
      joinStatusText.textContent = /firebase|Firebase|認証の初期化/i.test(msg)
        ? "Firebaseの初期化に失敗しました。firebaseConfigを確認してください。"
        : "起動処理でエラーが発生しました。ページを再読み込みするか、コンソールを確認してください。";
    }
    const authLead = document.querySelector("#authSection .auth-lead-primary");
    if (authLead) {
      authLead.textContent = `起動エラー: ${msg}（詳細は F12 → コンソール）`;
    }
    if (typeof setAuthStatusLine === "function") {
      setAuthStatusLine(`起動エラー: ${msg}`);
    }
    hideAppLoadingScreen();
  }
}

const BOOTSTRAP_EXPORTS = {
  startHostDashboard,
  bindHostDashboardInteractions,
  maybeOrganizerQuickJoinAfterEnter,
  enterEventMainUiFromInviteLink,
  setupLoginAndNavigationAfterFirebaseReady,
  bootstrap,
};

Object.assign(window, BOOTSTRAP_EXPORTS);

void bootstrap();
