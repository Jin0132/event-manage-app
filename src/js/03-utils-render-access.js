import {
  appState,
  organizerAnnouncementBlock,
  participantsBody,
  participantsCount,
  nameInput,
  commentInput,
  joinButton,
  photosGrid,
  photosCount,
  messagesList,
  messagesCount,
  joinForm,
  joinFormGateMessage,
  eventClosedMessage,
  eventTitle,
  eventDate,
  eventLocation,
  eventDissolveCountdownBanner,
  premiumTopTimer,
  calendarAfterRsvpRow,
  DEFAULT_AVATAR_URL,
  DEFAULT_EVENT,
  UPGRADE_GUIDE_URL,
} from "./01-config-state-dom.js";

function getEventIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("eventId") || "").trim();
}

function getInitial(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function isCurrentUserOrganizer() {
  const myUid = getCurrentFirebaseAuthUid();
  if (!myUid) {
    return false;
  }
  if (appState.participantAccessMode === "organizer") {
    return true;
  }
  return !!appState.organizerAuthUid && myUid === appState.organizerAuthUid;
}

function getListedParticipantCount() {
  return appState.participants.filter((person) => String(person.status || "") !== "pending").length;
}

/**
 * 主催者以外向け: 回答期限後は常に。定員は参加者リストが取れているモード（unlocked 等）のみ判定。
 */
function getJoinRsvpClosedReasonForNonOrganizer() {
  if (isCurrentUserOrganizer()) {
    return null;
  }
  const mode = appState.participantAccessMode || "unlocked";
  const dl = appState.eventAnswerDeadline;
  if (dl instanceof Date && !Number.isNaN(dl.getTime()) && Date.now() > dl.getTime()) {
    return "deadline";
  }
  const max = appState.eventMaxParticipants;
  if (max != null && max > 0 && (mode === "unlocked" || mode === "organizer")) {
    if (getListedParticipantCount() >= max) {
      return "quota";
    }
  }
  return null;
}

function shouldAnonymizeParticipantListForViewer() {
  return !!appState.eventIsPrivateList && !isCurrentUserOrganizer();
}

function updateHostOrganizerUI() {
  if (organizerAnnouncementBlock) {
    organizerAnnouncementBlock.hidden = !isCurrentUserOrganizer() || !appState.canPost;
  }
}

function participantNameByUid(uid) {
  const p = appState.participants.find((x) => x.participantUid === uid);
  return p ? p.name : "参加者";
}

function buildDirectMetaLabel(message) {
  if (isCurrentUserOrganizer() && message?.targetParticipantUid) {
    const name = participantNameByUid(message.targetParticipantUid);
    return `<span class="message-direct-to">→ ${escapeHtml(name)} へ</span>`;
  }
  return `<span class="message-direct-to">主催者からの個別メッセージ</span>`;
}

function getLastReadDmTimestampBySender(senderUid) {
  const uid = String(senderUid || "").trim();
  if (!uid) {
    return 0;
  }
  try {
    const raw = localStorage.getItem(`last_read_dm_timestamp_${uid}`);
    const n = Number(raw || 0);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

function getUnreadDmCountBySenderForCurrentUser() {
  const myUid = String(getCurrentFirebaseAuthUid() || "").trim();
  if (!myUid) {
    return new Map();
  }
  const counts = new Map();
  const rows = Array.isArray(appState.messages) ? appState.messages : [];
  rows.forEach((message) => {
    if (!message || message.channel !== "direct") {
      return;
    }
    const targetUid = String(message.targetParticipantUid || "").trim();
    if (!targetUid || targetUid !== myUid) {
      return;
    }
    const senderUid = String(message.senderAuthUid || "").trim();
    if (!senderUid || senderUid === myUid) {
      return;
    }
    const createdMs = timestampToMs(message.createdAt);
    const lastReadMs = getLastReadDmTimestampBySender(senderUid);
    if (createdMs <= 0 || createdMs <= lastReadMs) {
      return;
    }
    counts.set(senderUid, (counts.get(senderUid) || 0) + 1);
  });
  return counts;
}

function renderParticipants() {
  participantsBody.innerHTML = "";

  if (!appState.canSeeParticipants) {
    participantsCount.textContent = "0名";
    return;
  }

  const listed = appState.participants.filter((person) => String(person.status || "") !== "pending");
  const anon = shouldAnonymizeParticipantListForViewer();
  const unreadBySender = getUnreadDmCountBySenderForCurrentUser();
  const currentUid = String(getCurrentFirebaseAuthUid() || "").trim();
  const currentAuthPhoto =
    typeof isFirebaseAppReady === "function" && isFirebaseAppReady()
      ? String(firebase.auth().currentUser?.photoURL || "").trim()
      : "";
  listed.forEach((person, idx) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "participant-avatar-item";
    const displayName = anon ? `参加者${idx + 1}` : person.name;
    const personUid = String(person.participantUid || "").trim();
    const fallbackOwnAvatar =
      personUid && personUid === currentUid ? String(appState.currentPictureUrl || "").trim() || currentAuthPhoto : "";
    const avatarSrc =
      anon ? DEFAULT_AVATAR_URL : String(person.pictureUrl || "").trim() || fallbackOwnAvatar || DEFAULT_AVATAR_URL;
    const rowUid = personUid;
    const myUid = String(getCurrentFirebaseAuthUid() || "").trim();
    const isSelfRow = !!rowUid && !!myUid && rowUid === myUid;
    const isRowClickable = !anon && !!rowUid;
    const statusValue = String(person.status || "未定");
    const statusClass =
      statusValue === "出席"
        ? "participant-avatar-item--attend"
        : statusValue === "欠席"
          ? "participant-avatar-item--absent"
          : "participant-avatar-item--maybe";
    item.classList.add(statusClass);
    item.innerHTML = `
      <img
        class="participant-avatar-item__img"
        src="${escapeHtml(avatarSrc)}"
        alt="${escapeHtml(displayName)}のアイコン"
        referrerpolicy="no-referrer"
        onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}';"
      />
      <span class="participant-avatar-item__name">${escapeHtml(displayName)}</span>
    `;
    const participantAvatarImg = item.querySelector(".participant-avatar-item__img");
    if (participantAvatarImg) {
      participantAvatarImg.src = avatarSrc || DEFAULT_AVATAR_URL;
      participantAvatarImg.referrerPolicy = "no-referrer";
      participantAvatarImg.onerror = () => {
        participantAvatarImg.src = DEFAULT_AVATAR_URL;
      };
    }
    const unreadCount = unreadBySender.get(rowUid) || 0;
    if (unreadCount > 0 && !isSelfRow) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = String(unreadCount > 99 ? "99+" : unreadCount);
      item.appendChild(badge);
    }
    if (isRowClickable) {
      item.classList.add("participant-avatar-item--clickable");
      item.setAttribute("data-participant-id", escapeAttr(person.id || ""));
      item.setAttribute("data-participant-uid", escapeAttr(rowUid));
      item.setAttribute("data-participant-name", escapeAttr(person.name || ""));
      item.setAttribute("data-participant-comment", escapeAttr(person.comment || ""));
      item.setAttribute("data-participant-status", escapeAttr(statusValue));
      item.setAttribute("data-participant-avatar", escapeAttr(avatarSrc));
      item.setAttribute("data-is-self-row", isSelfRow ? "1" : "0");
      item.setAttribute("aria-label", `${escapeAttr(displayName)} (${escapeAttr(statusValue)})`);
    } else {
      item.disabled = true;
    }
    participantsBody.appendChild(item);
  });

  participantsCount.textContent = `${listed.length}名`;
}

function resetRsvpEditMode() {
  appState.editingParticipantId = "";
  updateJoinButtonUI();
}

function setRsvpEditMode(participantId) {
  const target = appState.participants.find((participant) => participant.id === participantId);
  if (!target) {
    return;
  }
  appState.editingParticipantId = participantId;
  nameInput.value = target.name || "";
  commentInput.value = target.comment || "";
  const status = target.status || "未定";
  const radio = document.querySelector(`input[name="status"][value="${status}"]`);
  if (radio) {
    radio.checked = true;
  }
  updateJoinButtonUI();
}

function updateJoinButtonUI() {
  if (!joinButton) {
    return;
  }
  const isReadyToSubmit = appState.canPost && appState.isAuthReady && !appState.isSubmittingRsvp;
  joinButton.disabled = !isReadyToSubmit;
  if (appState.isSubmittingRsvp) {
    joinButton.textContent = "送信中...";
    return;
  }
  joinButton.textContent = appState.editingParticipantId ? "更新する" : "参加する";
}

function renderPhotos() {
  photosGrid.innerHTML = "";
  if (!appState.canSeeParticipants) {
    photosCount.textContent = "0枚";
    return;
  }

  appState.photos.forEach((photo) => {
    const wrapper = document.createElement("div");
    wrapper.className = "photo-item";
    wrapper.innerHTML = `
      <img
        src="${escapeHtml(photo.url)}"
        alt="イベント写真"
      />
    `;
    photosGrid.appendChild(wrapper);
  });
  photosCount.textContent = `${appState.photos.length}枚`;
}

function renderMessages() {
  if (!messagesList || !messagesCount) {
    return;
  }
  messagesList.innerHTML = "";
  if (!appState.canSeeParticipants) {
    messagesCount.textContent = "0件";
    return;
  }

  const myUid = getCurrentFirebaseAuthUid();
  const currentAuthPhoto =
    typeof isFirebaseAppReady === "function" && isFirebaseAppReady()
      ? String(firebase.auth().currentUser?.photoURL || "").trim()
      : "";
  const rows = Array.isArray(appState.messages) ? appState.messages : [];
  rows.forEach((message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    try {
      const isMine =
        !!myUid && !!message?.senderAuthUid && message.senderAuthUid === myUid;
      let extraClass = "";
      if (message?.messageType === "announcement") {
        extraClass += " message-item-announcement";
      }
      if (message?.channel === "direct") {
        extraClass += " message-item-direct";
      }
      const wrapper = document.createElement("div");
      wrapper.className = `message-item${isMine ? " message-item-mine" : ""}${extraClass}`;
      const announcementBadge =
        message?.messageType === "announcement"
          ? `<div class="message-announcement-badge">主催者からのお知らせ</div>`
          : "";
      const directRow =
        message?.channel === "direct"
          ? `<div class="message-meta message-meta-direct">${buildDirectMetaLabel(message)}</div>`
          : "";
      const senderLabel = String(message?.senderName ?? "匿名");
      const timeLabel = String(message?.timeText ?? "");
      const bodyText = String(message?.text ?? "");
      const fallbackOwnAvatar =
        !!myUid && !!message?.senderAuthUid && message.senderAuthUid === myUid
          ? String(appState.currentPictureUrl || "").trim() || currentAuthPhoto
          : "";
      const messageAvatar = String(message?.pictureUrl || "").trim() || fallbackOwnAvatar || DEFAULT_AVATAR_URL;
      wrapper.innerHTML = `
      <img
        class="avatar"
        src="${escapeHtml(messageAvatar)}"
        alt="${escapeHtml(senderLabel)}のアイコン"
        referrerpolicy="no-referrer"
        onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}';"
      />
      <div class="message-bubble">
        ${announcementBadge}
        ${directRow}
        <div class="message-meta">
          <span>${escapeHtml(senderLabel)}</span>
          <span>${escapeHtml(timeLabel)}</span>
        </div>
        <p class="message-text">${escapeHtml(bodyText)}</p>
      </div>
    `;
      const messageAvatarImg = wrapper.querySelector(".avatar");
      if (messageAvatarImg) {
        messageAvatarImg.src = messageAvatar || DEFAULT_AVATAR_URL;
        messageAvatarImg.referrerPolicy = "no-referrer";
        messageAvatarImg.onerror = () => {
          messageAvatarImg.src = DEFAULT_AVATAR_URL;
        };
      }
      messagesList.appendChild(wrapper);
    } catch (e) {
      console.warn("renderMessages: skip row", e);
    }
  });
  messagesCount.textContent = `${rows.length}件`;
}

function formatTimestamp(value) {
  const date = toDateOrNull(value);
  if (!date) {
    return "";
  }
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function toDateOrNull(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function timestampToMs(value) {
  const date = toDateOrNull(value);
  return date ? date.getTime() : 0;
}

function getPremiumElements() {
  return {
    joinForm,
    photoUploadControls,
    chatForm,
    participantsSection,
    photosSection,
    chatSection,
    participantsBody,
    photosGrid,
    messagesList,
    photosLockOverlay,
    messagesLockOverlay,
    eventClosedMessage,
    eventDissolveCountdownBanner,
    accessNotice,
    premiumCountdownText,
    premiumTopTimer,
    upgradeButtonPhotos,
    upgradeButtonMessages,
  };
}

function applyFreeAccessControlUI() {
  const mode = appState.participantAccessMode || "unlocked";
  const currentUser =
    typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
  const isGuestViewer = !currentUser || !!currentUser.isAnonymous;
  const uid = getCurrentFirebaseAuthUid();
  const isOrg =
    mode === "organizer" ||
    (!!uid && !!appState.organizerAuthUid && uid === appState.organizerAuthUid);

  const hideSocialForParticipant = !isOrg && (mode === "pending" || mode === "not_joined");
  const lockSocialForGuest = mode === "guest_readonly" || (!isOrg && isGuestViewer);

  appState.canSeeParticipants = !hideSocialForParticipant || lockSocialForGuest;

  if (isOrg || mode === "unlocked") {
    appState.canPost = appState.isEventActive;
  } else if (lockSocialForGuest) {
    appState.canPost = false;
  } else if (mode === "not_joined") {
    appState.canPost = appState.isEventActive;
  } else if (mode === "pending") {
    appState.canPost = false;
  } else {
    appState.canPost = appState.isEventActive;
  }

  const rsvpGateReason = getJoinRsvpClosedReasonForNonOrganizer();
  const showJoinGate =
    !!rsvpGateReason && (mode === "unlocked" || mode === "not_joined");
  if (joinFormGateMessage) {
    if (showJoinGate && rsvpGateReason === "quota") {
      joinFormGateMessage.hidden = false;
      joinFormGateMessage.textContent = "定員に達したため受付を終了しました。";
    } else if (showJoinGate && rsvpGateReason === "deadline") {
      joinFormGateMessage.hidden = false;
      joinFormGateMessage.textContent = "回答期限を過ぎたため受付を終了しました。";
    } else {
      joinFormGateMessage.hidden = true;
      joinFormGateMessage.textContent = "";
    }
  }
  joinForm.hidden = !appState.canPost || showJoinGate || lockSocialForGuest;
  photoUploadControls.hidden = !appState.canPost;
  chatForm.hidden = !appState.canPost;

  if (hideSocialForParticipant) {
    participantsSection.hidden = true;
    photosSection.hidden = true;
    chatSection.hidden = true;
  } else {
    participantsSection.hidden = false;
    photosSection.hidden = false;
    chatSection.hidden = false;
  }

  participantsBody.classList.remove("content-locked");
  photosGrid.classList.remove("content-locked");
  messagesList.classList.remove("content-locked");
  photosLockOverlay.hidden = true;
  messagesLockOverlay.hidden = true;
  const eventGuestJoinButton = document.getElementById("eventGuestJoinButton");
  const photosLockText = document.getElementById("photosLockText");
  const messagesLockText = document.getElementById("messagesLockText");
  const guestGoogleLoginButtonPhotos = document.getElementById("guestGoogleLoginButtonPhotos");
  const guestGoogleLoginButtonMessages = document.getElementById("guestGoogleLoginButtonMessages");
  if (eventGuestJoinButton) {
    eventGuestJoinButton.hidden = !lockSocialForGuest;
  }
  if (guestGoogleLoginButtonPhotos) {
    guestGoogleLoginButtonPhotos.hidden = true;
  }
  if (guestGoogleLoginButtonMessages) {
    guestGoogleLoginButtonMessages.hidden = true;
  }
  premiumCountdownText.hidden = true;
  premiumCountdownText.textContent = "";
  premiumTopTimer.hidden = true;
  premiumTopTimer.textContent = "";
  accessNotice.hidden = true;
  accessNotice.textContent = "";
  eventClosedMessage.hidden = appState.isEventActive;
  eventClosedMessage.textContent = "このイベントは解散しました。";

  const isParticipantMode = appState.currentRole === "participant";
  if (dissolveButton) {
    dissolveButton.hidden = !isOrg || !!appState.isDissolved || isParticipantMode;
  }
  if (eventEditButton) {
    eventEditButton.hidden = !isOrg || !!appState.isDissolved || isParticipantMode;
  }
  upgradeButtonPhotos.hidden = true;
  upgradeButtonMessages.hidden = true;

  if (lockSocialForGuest) {
    photosSection.hidden = false;
    chatSection.hidden = false;
    photosGrid.classList.add("content-locked");
    messagesList.classList.add("content-locked");
    photosLockOverlay.hidden = false;
    messagesLockOverlay.hidden = false;
    if (photosLockText) {
      photosLockText.textContent = "チャットや写真を共有するには、アカウント連携（ログイン）が必要です。";
    }
    if (messagesLockText) {
      messagesLockText.textContent = "チャットや写真を共有するには、アカウント連携（ログイン）が必要です。";
    }
    if (guestGoogleLoginButtonPhotos) {
      guestGoogleLoginButtonPhotos.hidden = false;
    }
    if (guestGoogleLoginButtonMessages) {
      guestGoogleLoginButtonMessages.hidden = false;
    }
  }
}

function updateAccessControlUI() {
  if (isPremiumFeaturesEnabled() && window.PremiumFeatures) {
    window.PremiumFeatures.applyAccessControl({
      state: appState,
      elements: getPremiumElements(),
    });
  } else {
    if (window.PremiumFeatures?.teardown) {
      window.PremiumFeatures.teardown(getPremiumElements());
    }
    applyFreeAccessControlUI();
  }
  if (typeof applyParticipantAccessPanels === "function") {
    applyParticipantAccessPanels();
  }
  if (!appState.canEditRsvp) {
    resetRsvpEditMode();
  }
  updateJoinButtonUI();
  updateHostOrganizerUI();
  if (typeof renderOrganizerPasscodePanel === "function") {
    renderOrganizerPasscodePanel();
  }
  if (typeof syncEventDissolveCountdownBanner === "function") {
    syncEventDissolveCountdownBanner();
  }
}

function applyEventInfo(eventData) {
  eventTitle.textContent = eventData.title || DEFAULT_EVENT.title;
  eventDate.textContent = eventData.dateText || DEFAULT_EVENT.dateText;
  const locationText = eventData.location || DEFAULT_EVENT.location;
  const locationUrlRaw = String(eventData.location_url || "").trim();
  let locationUrl = "";
  if (locationUrlRaw) {
    try {
      const parsed = new URL(locationUrlRaw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        locationUrl = parsed.toString();
      }
    } catch (e) {
      locationUrl = "";
    }
  }
  if (locationUrl) {
    eventLocation.innerHTML = `<a href="${escapeAttr(locationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(locationText)}</a>`;
  } else {
    eventLocation.textContent = locationText;
  }
  hideCalendarAfterRsvpPrompt();
}

function applyEventActiveState(isActive) {
  appState.isEventActive = isActive;
  updateAccessControlUI();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatIcsUtc(date) {
  const u = new Date(date);
  if (Number.isNaN(u.getTime())) {
    return null;
  }
  const y = u.getUTCFullYear();
  const mo = u.getUTCMonth() + 1;
  const d = u.getUTCDate();
  const h = u.getUTCHours();
  const mi = u.getUTCMinutes();
  const s = u.getUTCSeconds();
  return `${y}${pad2(mo)}${pad2(d)}T${pad2(h)}${pad2(mi)}${pad2(s)}Z`;
}

function formatIcsDateOnly(y, mo, d) {
  return `${y}${pad2(mo)}${pad2(d)}`;
}

/**
 * dateText（例: 2026年4月5日（日） 12:00 - 16:00）から開始・終了を推測
 */
function parseEventDateTextForIcs(dateText) {
  const raw = String(dateText || "").trim();
  if (!raw) {
    return null;
  }

  let y;
  let mo;
  let d;
  const jp = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jp) {
    y = parseInt(jp[1], 10);
    mo = parseInt(jp[2], 10);
    d = parseInt(jp[3], 10);
  } else {
    const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!iso) {
      return null;
    }
    y = parseInt(iso[1], 10);
    mo = parseInt(iso[2], 10);
    d = parseInt(iso[3], 10);
  }

  const rangeMatch = raw.match(/(\d{1,2}):(\d{2})\s*[-–〜～]\s*(\d{1,2}):(\d{2})/);
  if (rangeMatch) {
    const sh = parseInt(rangeMatch[1], 10);
    const sm = parseInt(rangeMatch[2], 10);
    const eh = parseInt(rangeMatch[3], 10);
    const em = parseInt(rangeMatch[4], 10);
    const start = new Date(`${y}-${pad2(mo)}-${pad2(d)}T${pad2(sh)}:${pad2(sm)}:00+09:00`);
    const end = new Date(`${y}-${pad2(mo)}-${pad2(d)}T${pad2(eh)}:${pad2(em)}:00+09:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    let endAdj = end;
    if (endAdj.getTime() <= start.getTime()) {
      endAdj = new Date(start.getTime() + 60 * 60 * 1000);
    }
    return { allDay: false, start, end: endAdj };
  }

  const timeMatches = raw.match(/(\d{1,2}):(\d{2})/g);
  if (timeMatches && timeMatches.length >= 2) {
    const p1 = timeMatches[0].match(/(\d{1,2}):(\d{2})/);
    const p2 = timeMatches[1].match(/(\d{1,2}):(\d{2})/);
    const start = new Date(
      `${y}-${pad2(mo)}-${pad2(d)}T${pad2(parseInt(p1[1], 10))}:${pad2(parseInt(p1[2], 10))}:00+09:00`
    );
    const end = new Date(
      `${y}-${pad2(mo)}-${pad2(d)}T${pad2(parseInt(p2[1], 10))}:${pad2(parseInt(p2[2], 10))}:00+09:00`
    );
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      let endAdj = end;
      if (endAdj.getTime() <= start.getTime()) {
        endAdj = new Date(start.getTime() + 60 * 60 * 1000);
      }
      return { allDay: false, start, end: endAdj };
    }
  }

  if (timeMatches && timeMatches.length === 1) {
    const p1 = timeMatches[0].match(/(\d{1,2}):(\d{2})/);
    const start = new Date(
      `${y}-${pad2(mo)}-${pad2(d)}T${pad2(parseInt(p1[1], 10))}:${pad2(parseInt(p1[2], 10))}:00+09:00`
    );
    if (!Number.isNaN(start.getTime())) {
      return {
        allDay: false,
        start,
        end: new Date(start.getTime() + 60 * 60 * 1000),
      };
    }
  }

  const nextDay = new Date(y, mo - 1, d + 1);
  return {
    allDay: true,
    dateStart: formatIcsDateOnly(y, mo, d),
    dateEnd: formatIcsDateOnly(nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate()),
  };
}

function getCurrentEventDataForCalendar() {
  return {
    title: (appState.eventDocTitle || eventTitle.textContent || "").trim() || DEFAULT_EVENT.title,
    dateText: (appState.eventDocDateText || eventDate.textContent || "").trim() || DEFAULT_EVENT.dateText,
    location: (appState.eventDocLocation || eventLocation.textContent || "").trim() || DEFAULT_EVENT.location,
  };
}

function hideCalendarAfterRsvpPrompt() {
  if (calendarAfterRsvpRow) {
    calendarAfterRsvpRow.hidden = true;
  }
}

function showCalendarAfterRsvpPrompt() {
  if (calendarAfterRsvpRow) {
    calendarAfterRsvpRow.hidden = false;
  }
}

function downloadCalendarIcs(eventData) {
  const title = String(eventData?.title || "").trim() || "イベント";
  const dateText = String(eventData?.dateText || "").trim();
  const location = String(eventData?.location || "").trim();

  const parsed = parseEventDateTextForIcs(dateText);
  const dtstamp = formatIcsUtc(new Date());
  const uidBase = appState.eventId ? String(appState.eventId) : "event";
  const uid = `${uidBase}-${Date.now()}@sakutto-line-event`;

  let lines = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Sakutto//Event//JA");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${dtstamp}`);

  if (parsed && parsed.allDay && parsed.dateStart && parsed.dateEnd) {
    lines.push(`DTSTART;VALUE=DATE:${parsed.dateStart}`);
    lines.push(`DTEND;VALUE=DATE:${parsed.dateEnd}`);
  } else if (parsed && !parsed.allDay && parsed.start && parsed.end) {
    const ds = formatIcsUtc(parsed.start);
    const de = formatIcsUtc(parsed.end);
    if (ds && de) {
      lines.push(`DTSTART:${ds}`);
      lines.push(`DTEND:${de}`);
    }
  } else {
    const now = new Date();
    lines.push(`DTSTART:${formatIcsUtc(now)}`);
    lines.push(`DTEND:${formatIcsUtc(new Date(now.getTime() + 60 * 60 * 1000))}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(title)}`);
  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }
  if (dateText) {
    lines.push(`DESCRIPTION:${escapeIcsText(`日時: ${dateText}`)}`);
  }
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "event";
  a.download = `${safeName}.ics`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const UTIL_EXPORTS = {
  getEventIdFromQuery,
  getInitial,
  escapeHtml,
  escapeAttr,
  isCurrentUserOrganizer,
  getListedParticipantCount,
  getJoinRsvpClosedReasonForNonOrganizer,
  shouldAnonymizeParticipantListForViewer,
  updateHostOrganizerUI,
  participantNameByUid,
  buildDirectMetaLabel,
  renderParticipants,
  resetRsvpEditMode,
  setRsvpEditMode,
  updateJoinButtonUI,
  renderPhotos,
  renderMessages,
  formatTimestamp,
  toDateOrNull,
  timestampToMs,
  getPremiumElements,
  applyFreeAccessControlUI,
  updateAccessControlUI,
  applyEventInfo,
  applyEventActiveState,
  pad2,
  escapeIcsText,
  formatIcsUtc,
  formatIcsDateOnly,
  parseEventDateTextForIcs,
  getCurrentEventDataForCalendar,
  hideCalendarAfterRsvpPrompt,
  showCalendarAfterRsvpPrompt,
  downloadCalendarIcs,
};

Object.assign(window, UTIL_EXPORTS);

export {
  getEventIdFromQuery,
  getInitial,
  escapeHtml,
  escapeAttr,
  isCurrentUserOrganizer,
  getListedParticipantCount,
  getJoinRsvpClosedReasonForNonOrganizer,
  shouldAnonymizeParticipantListForViewer,
  updateHostOrganizerUI,
  participantNameByUid,
  buildDirectMetaLabel,
  renderParticipants,
  resetRsvpEditMode,
  setRsvpEditMode,
  updateJoinButtonUI,
  renderPhotos,
  renderMessages,
  formatTimestamp,
  toDateOrNull,
  timestampToMs,
  getPremiumElements,
  applyFreeAccessControlUI,
  updateAccessControlUI,
  applyEventInfo,
  applyEventActiveState,
  pad2,
  escapeIcsText,
  formatIcsUtc,
  formatIcsDateOnly,
  parseEventDateTextForIcs,
  getCurrentEventDataForCalendar,
  hideCalendarAfterRsvpPrompt,
  showCalendarAfterRsvpPrompt,
  downloadCalendarIcs,
};
