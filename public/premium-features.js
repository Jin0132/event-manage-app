(function () {
  let premiumTimerId = null;

  function hasPremiumPostingWindow(dissolvedAt) {
    if (!dissolvedAt) {
      return false;
    }
    const elapsedMs = Date.now() - dissolvedAt.getTime();
    const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
    return elapsedMs <= seventyTwoHoursMs;
  }

  function getPremiumRemainingMs(dissolvedAt) {
    if (!dissolvedAt) {
      return 0;
    }
    const endMs = dissolvedAt.getTime() + 72 * 60 * 60 * 1000;
    return Math.max(0, endMs - Date.now());
  }

  function formatDurationMs(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }

  function stopTimer() {
    if (premiumTimerId) {
      window.clearInterval(premiumTimerId);
      premiumTimerId = null;
    }
  }

  function renderCountdown(state, elements) {
    if (!(state.isPremium && !state.isEventActive && state.dissolvedAt)) {
      elements.premiumCountdownText.hidden = true;
      elements.premiumCountdownText.textContent = "";
      elements.premiumTopTimer.hidden = true;
      elements.premiumTopTimer.textContent = "";
      return 0;
    }

    const remainingMs = getPremiumRemainingMs(state.dissolvedAt);
    elements.premiumCountdownText.hidden = false;
    elements.premiumTopTimer.hidden = false;

    if (remainingMs > 0) {
      const text = `プレミアム投稿期限まで残り ${formatDurationMs(remainingMs)}`;
      elements.premiumCountdownText.textContent = text;
      elements.premiumTopTimer.textContent = text;
      return remainingMs;
    }

    elements.premiumCountdownText.textContent =
      "プレミアム投稿期限が終了しました（閲覧のみ）。";
    elements.premiumTopTimer.textContent =
      "プレミアム投稿期限が終了しました（閲覧のみ）。";
    return 0;
  }

  function startTimer(ctx) {
    stopTimer();
    premiumTimerId = window.setInterval(() => {
      const remainingMs = renderCountdown(ctx.state, ctx.elements);
      if (remainingMs > 0) {
        return;
      }
      ctx.state.canPost = false;
      ctx.elements.chatForm.hidden = true;
      ctx.elements.photoUploadControls.hidden = true;
      ctx.elements.joinForm.hidden = true;
      stopTimer();
    }, 1000);
  }

  function applyAccessControl(ctx) {
    const { state, elements } = ctx;
    const mode = state.participantAccessMode || "unlocked";
    const myUid =
      typeof getCurrentFirebaseAuthUid === "function" ? getCurrentFirebaseAuthUid() : "";
    const isAuthOrg =
      mode === "organizer" ||
      (!!myUid && !!(state.organizerAuthUid || "") && myUid === state.organizerAuthUid);
    const hideSocialGate = !isAuthOrg && (mode === "pending" || mode === "not_joined");
    if (hideSocialGate) {
      stopTimer();
      state.canSeeParticipants = false;
      state.canPost = mode === "not_joined" && state.isEventActive;
      elements.joinForm.hidden = !state.canPost;
      elements.photoUploadControls.hidden = !state.canPost;
      elements.chatForm.hidden = !state.canPost;
      elements.participantsSection.hidden = true;
      elements.photosSection.hidden = true;
      elements.chatSection.hidden = true;
      elements.participantsTable.classList.remove("content-locked");
      elements.photosGrid.classList.remove("content-locked");
      elements.messagesList.classList.remove("content-locked");
      elements.photosLockOverlay.hidden = true;
      elements.messagesLockOverlay.hidden = true;
      elements.premiumCountdownText.hidden = true;
      elements.premiumTopTimer.hidden = true;
      elements.eventClosedMessage.hidden = true;
      elements.accessNotice.hidden = true;
      elements.organizerControls.hidden = true;
      elements.upgradeButtonPhotos.hidden = true;
      elements.upgradeButtonMessages.hidden = true;
      return;
    }

    const isClosedNonPremium = !state.isEventActive && !state.isPremium;
    const isPremiumExpired =
      !state.isEventActive &&
      state.isPremium &&
      !hasPremiumPostingWindow(state.dissolvedAt);
    const isPremiumWithinPostingWindow =
      !state.isEventActive &&
      state.isPremium &&
      hasPremiumPostingWindow(state.dissolvedAt);
    const shouldLockContent = isClosedNonPremium;

    state.canSeeParticipants = true;
    state.canPost = state.isEventActive || isPremiumWithinPostingWindow;

    elements.joinForm.hidden = !state.canPost;
    elements.photoUploadControls.hidden = !state.canPost;
    elements.chatForm.hidden = !state.canPost;
    elements.participantsSection.hidden = false;
    elements.photosSection.hidden = false;
    elements.chatSection.hidden = false;
    elements.participantsTable.classList.toggle("content-locked", shouldLockContent);
    elements.photosGrid.classList.toggle("content-locked", shouldLockContent);
    elements.messagesList.classList.toggle("content-locked", shouldLockContent);
    elements.photosLockOverlay.hidden = !shouldLockContent;
    elements.messagesLockOverlay.hidden = !shouldLockContent;

    renderCountdown(state, elements);

    if (isClosedNonPremium) {
      elements.eventClosedMessage.hidden = false;
      elements.eventClosedMessage.textContent = "このイベントは解散しました。";
      elements.accessNotice.hidden = false;
      elements.accessNotice.textContent =
        "このイベントは終了しました。非プレミアム設定のため、メッセージと写真は表示されません。";
      stopTimer();
    } else if (isPremiumExpired) {
      elements.eventClosedMessage.hidden = false;
      elements.eventClosedMessage.textContent =
        "このイベントは解散済みです。プレミアム期限終了のため、現在は閲覧のみです。";
      elements.accessNotice.hidden = false;
      elements.accessNotice.textContent =
        "ギャラリーモード: メッセージと写真は閲覧できますが、新規投稿はできません。";
      stopTimer();
    } else if (isPremiumWithinPostingWindow) {
      elements.eventClosedMessage.hidden = false;
      elements.eventClosedMessage.textContent =
        "このイベントは解散済みです。プレミアム特典により72時間以内は投稿できます。";
      elements.accessNotice.hidden = false;
      elements.accessNotice.textContent =
        "プレミアム投稿期間中: 解散後72時間までは投稿可能です。";
      startTimer(ctx);
    } else {
      elements.eventClosedMessage.hidden = true;
      elements.accessNotice.hidden = true;
      elements.accessNotice.textContent = "";
      stopTimer();
    }

    const myUid =
      typeof getCurrentFirebaseAuthUid === "function" ? getCurrentFirebaseAuthUid() : "";
    const orgUid = String(state.organizerAuthUid || "").trim();
    const isOrganizer = !!myUid && !!orgUid && myUid === orgUid;
    elements.organizerControls.hidden = !isOrganizer || !state.isEventActive;
    const showUpgradeCta = shouldLockContent && isOrganizer;
    elements.upgradeButtonPhotos.hidden = !showUpgradeCta;
    elements.upgradeButtonMessages.hidden = !showUpgradeCta;
  }

  function teardown(elements) {
    stopTimer();
    elements.premiumCountdownText.hidden = true;
    elements.premiumCountdownText.textContent = "";
    elements.premiumTopTimer.hidden = true;
    elements.premiumTopTimer.textContent = "";
    elements.participantsTable.classList.remove("content-locked");
    elements.photosGrid.classList.remove("content-locked");
    elements.messagesList.classList.remove("content-locked");
    elements.photosLockOverlay.hidden = true;
    elements.messagesLockOverlay.hidden = true;
    elements.upgradeButtonPhotos.hidden = true;
    elements.upgradeButtonMessages.hidden = true;
  }

  window.PremiumFeatures = {
    applyAccessControl,
    teardown,
  };
})();
