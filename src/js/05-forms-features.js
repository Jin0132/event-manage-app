import {
  joinForm,
  joinButton,
  appState,
  joinStatusText,
  commentInput,
  calendarAfterRsvpButton,
  eventCalendarQuickAddButton,
  calendarPromptModal,
  calendarPromptCloseButton,
  calendarPromptCloseSecondaryButton,
  calendarPromptAddButton,
  photoStatusText,
  photoFileInput,
  chatPhotoInput,
  chatStatusText,
  uploadPhotoButton,
  chatPhotoButton,
  chatForm,
  messageInput,
  organizerAnnouncementForm,
  organizerAnnouncementInput,
  organizerAnnouncementStatus,
  createPremiumInput,
  UPGRADE_GUIDE_URL,
  qrModalCloseButton,
  qrModal,
  upgradeButtonPhotos,
  upgradeButtonMessages,
  createEventSection,
  messagesList,
} from "./01-config-state-dom.js";
import {
  hideCalendarAfterRsvpPrompt,
  updateJoinButtonUI,
  resetRsvpEditMode,
  showCalendarAfterRsvpPrompt,
  getCurrentEventDataForCalendar,
  downloadCalendarIcs,
  isCurrentUserOrganizer,
  getPremiumElements,
} from "./03-utils-render-access.js";
import {
  ensureReadyForFirestoreWrite,
  getParticipantsCollectionRef,
  evaluateParticipantEventAccess,
  optimizeImageForSpark,
  getCurrentFirebaseAuthUid,
  sanitizeFileName,
  getPhotosCollectionRef,
  getMessagesCollectionRef,
  getOrganizerSenderPayload,
  loadMyEvents,
} from "./04-firebase-data.js";
import { showView } from "./02-ui-common.js";
import { closeQrModal } from "./02-invite-nav-auth-ui.js";

function closeCalendarPromptModal() {
  if (calendarPromptModal) {
    calendarPromptModal.hidden = true;
  }
}

function openCalendarPromptModal() {
  if (calendarPromptModal) {
    calendarPromptModal.hidden = false;
  }
}

function runCalendarDownloadFromCurrentEvent() {
  downloadCalendarIcs(getCurrentEventDataForCalendar());
}

function setupForm() {
  const joinSubmitButton = joinButton || joinForm.querySelector('button[type="submit"]');
  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (appState.isSubmittingRsvp) {
      return;
    }

    if (!appState.canPost) {
      if (joinStatusText) {
        joinStatusText.textContent = "現在は投稿できません（閲覧モード）。";
      }
      return;
    }

    const formData = new FormData(joinForm);
    const authPhotoUrl =
      typeof isFirebaseAppReady === "function" && isFirebaseAppReady()
        ? String(firebase.auth().currentUser?.photoURL || "").trim()
        : "";
    const payload = {
      name: String(formData.get("name") || "").trim(),
      status: String(formData.get("status") || "未定"),
      comment: String(formData.get("comment") || "").trim(),
      pictureUrl: String(appState.currentPictureUrl || "").trim() || authPhotoUrl,
    };

    if (!payload.name) {
      if (joinStatusText) {
        joinStatusText.textContent = "名前を入力してください。";
      }
      return;
    }

    console.log("参加登録 payload:", payload);

    try {
      hideCalendarAfterRsvpPrompt();
      appState.isSubmittingRsvp = true;
      if (joinSubmitButton) {
        joinSubmitButton.disabled = true;
      }
      updateJoinButtonUI();
      await ensureReadyForFirestoreWrite();
      let submittedAsPending = false;
      if (appState.editingParticipantId) {
        const uid = firebase.auth().currentUser.uid;
        const editRef = getParticipantsCollectionRef().doc(appState.editingParticipantId);
        let existingStatus = "";
        try {
          const editSnap = await editRef.get();
          existingStatus = String(editSnap.data()?.status || "");
        } catch (readErr) {
          console.warn("edit participant status read", readErr);
        }
        const shouldRequirePending =
          !!appState.eventRequireApproval && existingStatus !== "approved";
        const saveStatus = shouldRequirePending ? "pending" : payload.status;
        submittedAsPending = shouldRequirePending;
        await editRef.update({
          name: payload.name,
          status: saveStatus,
          comment: payload.comment,
          pictureUrl: payload.pictureUrl || "",
          participantUid: uid,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const uid = firebase.auth().currentUser.uid;
        const selfRef = getParticipantsCollectionRef().doc(uid);
        const existing = await selfRef.get();
        if (existing.exists) {
          const prevStatus = String(existing.data().status || "");
          if (prevStatus === "pending") {
            const saveStatus = appState.eventRequireApproval ? "pending" : payload.status;
            submittedAsPending = saveStatus === "pending";
            await selfRef.update({
              name: payload.name,
              status: saveStatus,
              comment: payload.comment,
              pictureUrl: payload.pictureUrl || "",
              participantUid: uid,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
          } else if (appState.eventRequireApproval && prevStatus !== "approved") {
            submittedAsPending = true;
            await selfRef.update({
              name: payload.name,
              status: "pending",
              comment: payload.comment,
              pictureUrl: payload.pictureUrl || "",
              participantUid: uid,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
          }
          else if (
            prevStatus === "approved" ||
            prevStatus === "出席" ||
            prevStatus === "欠席" ||
            prevStatus === "未定"
          ) {
            await selfRef.update({
              name: payload.name,
              status: payload.status,
              comment: payload.comment,
              pictureUrl: payload.pictureUrl || "",
              participantUid: uid,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            const saveStatus = appState.eventRequireApproval ? "pending" : payload.status;
            submittedAsPending = saveStatus === "pending";
            await selfRef.set({
              name: payload.name,
              status: saveStatus,
              comment: payload.comment,
              pictureUrl: payload.pictureUrl || "",
              participantUid: uid,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
          }
        } else {
          const saveStatus = appState.eventRequireApproval ? "pending" : payload.status;
          submittedAsPending = saveStatus === "pending";
          await selfRef.set({
            name: payload.name,
            status: saveStatus,
            comment: payload.comment,
            pictureUrl: payload.pictureUrl || "",
            participantUid: uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
      commentInput.value = "";
      resetRsvpEditMode();
      if (joinStatusText) {
        joinStatusText.textContent = submittedAsPending
          ? "参加申請を送りました。主催者の承認をお待ちください。"
          : "参加情報を保存しました。";
      }
      if (submittedAsPending) {
        hideCalendarAfterRsvpPrompt();
      } else {
        showCalendarAfterRsvpPrompt();
      }
      openCalendarPromptModal();
      if (appState.eventId && typeof evaluateParticipantEventAccess === "function") {
        await evaluateParticipantEventAccess();
      }
      if (typeof setEventModeUI === "function") {
        setEventModeUI();
      }
    } catch (error) {
      console.error("参加登録エラー:", error);
      if (joinStatusText) {
        joinStatusText.textContent = "参加情報の保存に失敗しました。";
      }
      alert(`参加情報の保存に失敗しました\n${error?.message || String(error)}`);
    } finally {
      appState.isSubmittingRsvp = false;
      if (joinSubmitButton) {
        joinSubmitButton.disabled = false;
      }
      updateJoinButtonUI();
    }
  });
}

function setupCalendarAfterRsvp() {
  if (calendarAfterRsvpButton) {
    calendarAfterRsvpButton.addEventListener("click", runCalendarDownloadFromCurrentEvent);
  }
  if (eventCalendarQuickAddButton) {
    eventCalendarQuickAddButton.addEventListener("click", runCalendarDownloadFromCurrentEvent);
  }
  if (calendarPromptAddButton) {
    calendarPromptAddButton.addEventListener("click", () => {
      runCalendarDownloadFromCurrentEvent();
      closeCalendarPromptModal();
    });
  }
  if (calendarPromptCloseButton) {
    calendarPromptCloseButton.addEventListener("click", closeCalendarPromptModal);
  }
  if (calendarPromptCloseSecondaryButton) {
    calendarPromptCloseSecondaryButton.addEventListener("click", closeCalendarPromptModal);
  }
  if (calendarPromptModal) {
    calendarPromptModal.addEventListener("click", (event) => {
      if (event.target === calendarPromptModal) {
        closeCalendarPromptModal();
      }
    });
  }
}

function setupPhotoUpload() {
  async function uploadPhotoFile(file) {
    if (!file) {
      photoStatusText.textContent = "写真ファイルを選択してください。";
      return;
    }
    if (!file.type.startsWith("image/")) {
      photoStatusText.textContent = "画像ファイルのみアップロードできます。";
      return;
    }

    try {
      await ensureReadyForFirestoreWrite();
      photoStatusText.textContent = "画像を最適化中...";
      const optimized = await optimizeImageForSpark(file);
      photoStatusText.textContent = "写真をアップロード中...";
      const uidPart = getCurrentFirebaseAuthUid() || "unknown";
      const baseName = sanitizeFileName(file.name).replace(/\.[^.]+$/, "");
      const fileName = `${Date.now()}_${uidPart}_${baseName}.${optimized.ext}`;
      const storagePath = `events/${appState.eventId}/photos/${fileName}`;
      const storageRef = storage.ref(storagePath);
      await storageRef.put(optimized.blob, {
        contentType: "image/jpeg",
        cacheControl: "public,max-age=86400",
      });
      const url = await storageRef.getDownloadURL();

      await getPhotosCollectionRef().add({
        url,
        storagePath,
        uploaderAuthUid: getCurrentFirebaseAuthUid() || "",
        uploaderName: nameInput.value.trim() || appState.currentUserName || "匿名",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      if (appState.eventId && typeof logEventNotificationTrigger === "function") {
        void logEventNotificationTrigger(appState.eventId, "photo_uploaded", {
          storagePath,
        });
      }

      photoFileInput.value = "";
      if (chatPhotoInput) {
        chatPhotoInput.value = "";
      }
      photoStatusText.textContent = "写真を投稿しました。";
      chatStatusText.textContent = "写真を投稿しました。";
    } catch (error) {
      console.error("写真アップロードエラー:", error);
      if (error?.code === "storage/unauthorized") {
        photoStatusText.textContent =
          "アップロード権限がありません。Storage Rules と匿名認証の設定を確認してください。";
        return;
      }
      if (error?.code === "storage/quota-exceeded") {
        photoStatusText.textContent =
          "Storageの無料枠上限に達しました。不要画像の削除またはプラン確認をしてください。";
        return;
      }
      photoStatusText.textContent = error?.message || "写真の投稿に失敗しました。";
      alert(`写真の投稿に失敗しました\n${error?.message || String(error)}`);
    }
  }

  uploadPhotoButton.addEventListener("click", async () => {
    if (!appState.canPost) {
      photoStatusText.textContent = "現在は写真を投稿できません（閲覧モード）。";
      return;
    }
    await uploadPhotoFile(photoFileInput.files?.[0]);
  });

  if (chatPhotoButton && chatPhotoInput) {
    chatPhotoButton.addEventListener("click", () => {
      if (!appState.canPost) {
        if (chatStatusText) {
          chatStatusText.textContent = "現在は写真を投稿できません（閲覧モード）。";
        }
        return;
      }
      chatPhotoInput.click();
    });

    chatPhotoInput.addEventListener("change", async () => {
      if (!appState.canPost) {
        return;
      }
      const file = chatPhotoInput.files?.[0];
      if (!file) {
        return;
      }
      await uploadPhotoFile(file);
    });
  }
}

function setupChatForm() {
  if (!chatForm) {
    return;
  }
  const submitBtn = chatForm.querySelector(".chat-send-button");
  if (!chatForm.dataset.mobileSubmitBound) {
    chatForm.dataset.mobileSubmitBound = "1";
    let skipClickUntil = 0;
    submitBtn?.addEventListener("touchend", (event) => {
      if (chatForm.dataset.submitting === "true") {
        return;
      }
      event.preventDefault();
      skipClickUntil = Date.now() + 550;
      chatForm.requestSubmit();
    });
    submitBtn?.addEventListener("click", (event) => {
      if (chatForm.dataset.submitting === "true") {
        return;
      }
      if (Date.now() < skipClickUntil) {
        return;
      }
      event.preventDefault();
      chatForm.requestSubmit();
    });
    messageInput?.addEventListener("keydown", (event) => {
      if (chatForm.dataset.submitting === "true") {
        return;
      }
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
        return;
      }
      event.preventDefault();
      chatForm.requestSubmit();
    });
  }
  if (chatForm.dataset.bound === "true") {
    return;
  }
  chatForm.dataset.bound = "true";
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(messageInput?.value || "").trim();
    if (chatForm.dataset.submitting === "true") {
      return;
    }
    if (!text) {
      chatStatusText.textContent = "メッセージを入力してください。";
      return;
    }
    chatForm.dataset.submitting = "true";
    submitBtn?.setAttribute("disabled", "disabled");
    if (messageInput) {
      messageInput.disabled = true;
    }
    if (!appState.canPost) {
      chatStatusText.textContent = "現在は投稿できません（閲覧モード）。";
      chatForm.dataset.submitting = "false";
      submitBtn?.removeAttribute("disabled");
      if (messageInput) {
        messageInput.disabled = false;
      }
      return;
    }

    try {
      await ensureReadyForFirestoreWrite();
      await getMessagesCollectionRef().add({
        senderAuthUid: getCurrentFirebaseAuthUid() || "",
        senderName: nameInput.value.trim() || appState.currentUserName || "匿名",
        pictureUrl: appState.currentPictureUrl || "",
        text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      messageInput.value = "";
      chatStatusText.textContent = "";
      messageInput?.blur();
      window.requestAnimationFrame(() => {
        if (messagesList) {
          messagesList.scrollTop = messagesList.scrollHeight;
        }
      });
      window.setTimeout(() => {
        if (messagesList) {
          messagesList.scrollTop = messagesList.scrollHeight;
        }
      }, 120);
    } catch (error) {
      console.error("メッセージ送信エラー:", error);
      chatStatusText.textContent = "メッセージの送信に失敗しました。";
    } finally {
      if (messageInput) {
        messageInput.value = "";
        messageInput.disabled = false;
      }
      submitBtn?.removeAttribute("disabled");
      chatForm.dataset.submitting = "false";
      const isMobile = window.matchMedia("(max-width: 640px)").matches || navigator.maxTouchPoints > 0;
      if (isMobile) {
        messageInput?.blur();
      } else {
        messageInput?.focus();
      }
    }
  });
}

function setupOrganizerAnnouncementForm() {
  if (!organizerAnnouncementForm || !organizerAnnouncementInput) {
    return;
  }
  const organizerAnnouncementSubmitButton =
    organizerAnnouncementForm.querySelector('button[type="submit"]');
  const organizerAnnouncementSubmitDefaultLabel = String(
    organizerAnnouncementSubmitButton?.textContent || "全体にお知らせを送る"
  );
  organizerAnnouncementForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!appState.canPost || !isCurrentUserOrganizer()) {
      if (organizerAnnouncementStatus) {
        organizerAnnouncementStatus.textContent = "主催者のみ、イベントが投稿可能なときに送信できます。";
      }
      return;
    }
    const text = String(organizerAnnouncementInput.value || "").trim();
    if (!text) {
      if (organizerAnnouncementStatus) {
        organizerAnnouncementStatus.textContent = "本文を入力してください。";
      }
      return;
    }
    if (organizerAnnouncementSubmitButton?.disabled) {
      return;
    }
    if (organizerAnnouncementSubmitButton) {
      organizerAnnouncementSubmitButton.disabled = true;
      organizerAnnouncementSubmitButton.textContent = "送信中...";
    }
    try {
      await ensureReadyForFirestoreWrite();
      const payload = getOrganizerSenderPayload();
      await getMessagesCollectionRef().add({
        senderName: payload.senderName,
        pictureUrl: payload.pictureUrl,
        text: text.slice(0, 300),
        messageType: "announcement",
        senderAuthUid: payload.senderAuthUid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      organizerAnnouncementInput.value = "";
      if (organizerAnnouncementStatus) {
        organizerAnnouncementStatus.textContent = "お知らせを投稿しました。";
      }
    } catch (error) {
      console.error("お知らせ投稿エラー:", error);
      if (organizerAnnouncementStatus) {
        organizerAnnouncementStatus.textContent = "投稿に失敗しました。";
      }
      alert(`投稿に失敗しました\n${error?.message || String(error)}`);
    } finally {
      if (organizerAnnouncementSubmitButton) {
        organizerAnnouncementSubmitButton.disabled = false;
        organizerAnnouncementSubmitButton.textContent = organizerAnnouncementSubmitDefaultLabel;
      }
    }
  });
}

function setCreateModeUI() {
  if (window.PremiumFeatures?.teardown) {
    window.PremiumFeatures.teardown(getPremiumElements());
  }
  if (typeof hideRoleSelectUI === "function") {
    hideRoleSelectUI();
  }
  if (typeof hideJoinByPasscodeFlow === "function") {
    hideJoinByPasscodeFlow();
  }
  if (typeof showView === "function") {
    showView("host-dashboard");
  }
  loadMyEvents();
}

function openUpgradeGuide() {
  window.open(UPGRADE_GUIDE_URL, "_blank", "noopener,noreferrer");
}

function setEventModeUI() {
  if (typeof showView === "function") {
    const mode = appState.participantAccessMode || "unlocked";
    const shouldShowJoinGate = mode === "not_joined" || mode === "pending";
    showView(shouldShowJoinGate ? "join-gate" : "event-details");
  }
}

function setupQrModalHandlers() {
  if (qrModalCloseButton) {
    qrModalCloseButton.addEventListener("click", () => {
      closeQrModal();
    });
  }
  if (qrModal) {
    qrModal.addEventListener("click", (event) => {
      if (event.target === qrModal) {
        closeQrModal();
      }
    });
  }
}

const FORMS_FEATURE_EXPORTS = {
  setupForm,
  setupCalendarAfterRsvp,
  setupPhotoUpload,
  setupChatForm,
  setupOrganizerAnnouncementForm,
  setCreateModeUI,
  openUpgradeGuide,
  setEventModeUI,
  setupQrModalHandlers,
};

Object.assign(window, FORMS_FEATURE_EXPORTS);

export {
  setupForm,
  setupCalendarAfterRsvp,
  setupPhotoUpload,
  setupChatForm,
  setupOrganizerAnnouncementForm,
  setCreateModeUI,
  openUpgradeGuide,
  setEventModeUI,
  setupQrModalHandlers,
};
