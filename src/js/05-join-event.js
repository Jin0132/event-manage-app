import {
  appState,
  db,
  joinPasscodeInput,
  joinPasscodeInputPanel,
  joinPasscodeResultsPanel,
  joinPasscodeConfirmPanel,
  joinPasscodeStatusLine,
  joinPasscodeResultsList,
  joinPasscodeResultsMessage,
  joinPasscodeSearchButton,
  joinPasscodeConfirmEventName,
  joinPasscodeConfirmHostName,
  joinPasscodeConfirmDate,
  joinRequestApplyButton,
  participantEventsGrid,
  participantEventsStatusText,
} from "./01-config-state-dom.js";
import { escapeHtml, toDateOrNull, parseEventDateTextForIcs } from "./03-utils-render-access.js";
import {
  initializeFirebaseAuthReady,
  ensureReadyForFirestoreWrite,
  getParticipantDocRefForEvent,
} from "./04-firebase-data.js";
import { normalizePointerEventTarget, showView } from "./02-ui-common.js";
import { updateAppNavigation } from "./02-invite-nav-auth-ui.js";
import { getGraceEndMsFromDocData, isEventVisibleInListAfterDissolve } from "./04-event-details.js";
import { navigateToEventDetail } from "./08-waiting-room.js";

let joinPasscodeSearchBusy = false;
let joinPasscodeSelectedSummary = null;
let joinRequestApplyBusy = false;
const LIST_EVENT_DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000;
const LIST_EVENT_POST_END_VISIBLE_MS = 24 * 60 * 60 * 1000;

function parseEventStartMsFromData(data) {
  const d = data || {};
  const dateText = String(d.dateText || "").trim();
  if (dateText && typeof parseEventDateTextForIcs === "function") {
    const parsed = parseEventDateTextForIcs(dateText);
    if (parsed && !parsed.allDay && parsed.start instanceof Date && !Number.isNaN(parsed.start.getTime())) {
      return parsed.start.getTime();
    }
    if (parsed && parsed.allDay && parsed.dateStart) {
      const allDayStart = new Date(`${parsed.dateStart}T00:00:00+09:00`);
      if (!Number.isNaN(allDayStart.getTime())) {
        return allDayStart.getTime();
      }
    }
  }
  const candidates = [d.startAt, d.start_at, d.event_start_at, d.date, d.date_at];
  for (const candidate of candidates) {
    const dateObj = typeof toDateOrNull === "function" ? toDateOrNull(candidate) : null;
    if (dateObj && !Number.isNaN(dateObj.getTime())) {
      return dateObj.getTime();
    }
  }
  return Number.NaN;
}

function parseEventEndMsFromData(data, startMs) {
  const d = data || {};
  const dateText = String(d.dateText || "").trim();
  if (dateText && typeof parseEventDateTextForIcs === "function") {
    const parsed = parseEventDateTextForIcs(dateText);
    if (parsed && !parsed.allDay && parsed.end instanceof Date && !Number.isNaN(parsed.end.getTime())) {
      return parsed.end.getTime();
    }
    if (parsed && parsed.allDay && parsed.dateEnd) {
      const allDayEnd = new Date(`${parsed.dateEnd}T00:00:00+09:00`);
      if (!Number.isNaN(allDayEnd.getTime())) {
        return allDayEnd.getTime();
      }
    }
  }
  const candidates = [d.endAt, d.end_at, d.event_end_at];
  for (const candidate of candidates) {
    const dateObj = typeof toDateOrNull === "function" ? toDateOrNull(candidate) : null;
    if (dateObj && !Number.isNaN(dateObj.getTime())) {
      return dateObj.getTime();
    }
  }
  if (!Number.isFinite(startMs)) {
    return Number.POSITIVE_INFINITY;
  }
  return startMs + LIST_EVENT_DEFAULT_DURATION_MS;
}

function formatRemainingHoursText(ms) {
  const hours = Math.max(0, Math.ceil(ms / (60 * 60 * 1000)));
  return typeof t === "function" ? t("hours_remaining", "あと{hours}時間", { hours }) : `あと${hours}時間`;
}

function buildCategorizedEventBuckets(rows) {
  const now = Date.now();
  const buckets = {
    upcoming: [],
    ongoing: [],
    closed: [],
  };
  rows.forEach((row) => {
    const startMs = Number.isFinite(row.startMs) ? row.startMs : now - 60 * 1000;
    const endMs = Number.isFinite(row.endMs) ? row.endMs : startMs + LIST_EVENT_DEFAULT_DURATION_MS;
    const upcomingLabel = typeof t === "function" ? t("event_status_upcoming", "📅 開催前") : "📅 開催前";
    const ongoingLabel = typeof t === "function" ? t("event_status_ongoing", "🔴 開催中") : "🔴 開催中";
    const closedLabelPrefix = typeof t === "function" ? t("event_status_closed_prefix", "🏁 解散（非表示まで：") : "🏁 解散（非表示まで：";
    const closedLabelSuffix = typeof t === "function" ? t("event_status_closed_suffix", "）") : "）";

    if (row.isDissolved) {
      let graceEndMs = Number.isFinite(row.graceEndMs) ? row.graceEndMs : 0;
      if (!graceEndMs) {
        graceEndMs = endMs + LIST_EVENT_POST_END_VISIBLE_MS;
      }
      const remaining = graceEndMs - now;
      if (Number.isFinite(graceEndMs) && now >= graceEndMs) {
        return;
      }
      row.statusText =
        remaining > 0
          ? `${closedLabelPrefix}${formatRemainingHoursText(remaining)}${closedLabelSuffix}`
          : (typeof t === "function" ? t("event_status_closed_short", "🏁 解散") : "🏁 解散");
      row.statusClass = "is-grace";
      buckets.closed.push(row);
      return;
    }

    if (now < startMs) {
      row.statusText = upcomingLabel;
      row.statusClass = "is-active";
      buckets.upcoming.push(row);
      return;
    }

    row.statusText = ongoingLabel;
    row.statusClass = "is-active";
    buckets.ongoing.push(row);
  });
  Object.values(buckets).forEach((arr) => arr.sort((a, b) => a.startMs - b.startMs));
  return buckets;
}

function renderCategorizedParticipantEvents(buckets) {
  const upcomingTitle = typeof t === "function" ? t("event_status_upcoming", "📅 開催前") : "📅 開催前";
  const ongoingTitle = typeof t === "function" ? t("event_status_ongoing", "🔴 開催中") : "🔴 開催中";
  const closedTitle = typeof t === "function" ? t("event_status_closed_short", "🏁 解散") : "🏁 解散";
  const groups = [
    { id: "participantEventsUpcoming", title: upcomingTitle, rows: buckets.upcoming },
    { id: "participantEventsOngoing", title: ongoingTitle, rows: buckets.ongoing },
    { id: "participantEventsClosed", title: closedTitle, rows: buckets.closed },
  ];
  groups.forEach((group) => {
    const container = document.getElementById(group.id);
    if (!container) {
      return;
    }
    container.hidden = true;
    container.innerHTML = "";
  });
  groups.forEach((group) => {
    const container = document.getElementById(group.id);
    if (!container) {
      return;
    }
    if (!group.rows.length) {
      container.hidden = true;
      return;
    }
    const title = document.createElement("h3");
    title.className = "event-category-title";
    title.textContent = group.title;
    const list = document.createElement("div");
    list.className = "event-category-list";
    group.rows.forEach((row) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "join-passcode-result-item event-card";
      btn.setAttribute("data-event-id", String(row.id || "").trim());
      btn.innerHTML = `
        <strong>${escapeHtml(row.title)}</strong>
        <span class="join-passcode-result-meta">主催: ${escapeHtml(row.hostName)}<br />日時: ${escapeHtml(row.dateText)}</span>
        <span class="my-event-card-badge ${row.statusClass || "is-active"}">${escapeHtml(row.statusText || "")}</span>
      `;
      list.appendChild(btn);
    });
    container.appendChild(title);
    container.appendChild(list);
    container.hidden = false;
  });
}

function resetParticipantEventGroups() {
  ["participantEventsUpcoming", "participantEventsOngoing", "participantEventsClosed"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.hidden = true;
    el.innerHTML = "";
  });
}

function mapDocToPasscodeSummary(docSnap) {
  const d = docSnap.data() || {};
  return {
    id: docSnap.id,
    event_name: d.title || "",
    host_name: d.host_name && String(d.host_name).trim() ? d.host_name : "—",
    date: d.dateText || "",
  };
}

async function fetchActiveEventsByPasscode(passcode) {
  const code = String(passcode || "").trim();
  if (!code) {
    return [];
  }
  await initializeFirebaseAuthReady();
  const snap = await db.collection("events").where("passcode", "==", code).limit(25).get();
  return snap.docs
    .filter((docSnap) =>
      typeof isEventVisibleInListAfterDissolve === "function"
        ? isEventVisibleInListAfterDissolve(docSnap.data() || {})
        : true
    )
    .map(mapDocToPasscodeSummary);
}

/** イベント ID が分かっているときの確認画面用（参加申請前の存在確認） */
async function fetchEventPasscodeDisplayFieldsById(eventId) {
  const id = String(eventId || "").trim();
  if (!id) {
    return null;
  }
  await initializeFirebaseAuthReady();
  const snap = await db.collection("events").doc(id).get();
  if (!snap.exists) {
    return null;
  }
  return mapDocToPasscodeSummary(snap);
}

function showPasscodeInputPanelOnly() {
  if (joinPasscodeInputPanel) {
    joinPasscodeInputPanel.hidden = false;
  }
  if (joinPasscodeResultsPanel) {
    joinPasscodeResultsPanel.hidden = true;
  }
  if (joinPasscodeConfirmPanel) {
    joinPasscodeConfirmPanel.hidden = true;
  }
}

function showJoinByPasscodeFlow() {
  void (async () => {
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
    appState.authSessionRoute = "participant_join";
    if (typeof showView === "function") {
      showView("participant-dashboard");
    }
    const joinSection = document.getElementById("joinByPasscodeSection");
    const staleBackBar = joinSection?.querySelector(".section-back-bar");
    if (staleBackBar instanceof HTMLElement) {
      staleBackBar.style.display = "none";
    }
    showPasscodeInputPanelOnly();
    appState.joinPasscodeFlowHadMultiple = false;
    joinPasscodeSelectedSummary = null;
    if (joinPasscodeStatusLine) {
      joinPasscodeStatusLine.textContent = "";
    }
    if (joinPasscodeInput) {
      joinPasscodeInput.value = "";
    }
    if (joinPasscodeResultsList) {
      joinPasscodeResultsList.innerHTML = "";
    }
    void loadParticipantJoinedEvents();
    updateAppNavigation();
  })();
}

function hideJoinByPasscodeFlow() {
  if (typeof teardownWaitingRoom === "function") {
    teardownWaitingRoom();
  }
  showPasscodeInputPanelOnly();
  if (joinPasscodeResultsList) {
    joinPasscodeResultsList.innerHTML = "";
  }
  if (joinPasscodeStatusLine) {
    joinPasscodeStatusLine.textContent = "";
  }
  joinPasscodeSelectedSummary = null;
  updateAppNavigation();
}

function showJoinPasscodeConfirm(summary) {
  joinPasscodeSelectedSummary = summary;
  if (typeof showView === "function") {
    showView("passcode-confirm");
  }
  if (joinPasscodeInputPanel) {
    joinPasscodeInputPanel.hidden = true;
  }
  if (joinPasscodeResultsPanel) {
    joinPasscodeResultsPanel.hidden = true;
  }
  if (joinPasscodeConfirmPanel) {
    joinPasscodeConfirmPanel.hidden = false;
  }
  if (joinPasscodeConfirmEventName) {
    joinPasscodeConfirmEventName.textContent = summary.event_name || "—";
  }
  if (joinPasscodeConfirmHostName) {
    joinPasscodeConfirmHostName.textContent = summary.host_name || "—";
  }
  if (joinPasscodeConfirmDate) {
    joinPasscodeConfirmDate.textContent = summary.date || "—";
  }
  updateAppNavigation();
}

/**
 * 参加申請確認を出す直前に events/{id} を再取得し、eventId・主催者表示を最新化する
 */
async function prepareAndShowJoinPasscodeConfirm(row) {
  const id = row && String(row.id || "").trim();
  if (!id) {
    if (joinPasscodeStatusLine) {
      joinPasscodeStatusLine.textContent = "イベントの指定が不正です。";
    }
    return;
  }
  if (joinPasscodeStatusLine) {
    joinPasscodeStatusLine.textContent = "イベント情報を取得しています…";
  }
  try {
    await initializeFirebaseAuthReady();
    const fresh = await fetchEventPasscodeDisplayFieldsById(id);
    if (!fresh || !String(fresh.id || "").trim()) {
      if (joinPasscodeStatusLine) {
        joinPasscodeStatusLine.textContent = "イベントが見つかりません。パスコードを確認してください。";
      }
      return;
    }
    if (joinPasscodeStatusLine) {
      joinPasscodeStatusLine.textContent = "";
    }
    showJoinPasscodeConfirm(fresh);
  } catch (e) {
    console.error("参加確認用イベント再取得:", e);
    if (joinPasscodeStatusLine) {
      joinPasscodeStatusLine.textContent = "イベント情報の取得に失敗しました。";
    }
  }
}

function renderPasscodeResultsList(rows, onPick) {
  if (!joinPasscodeResultsList) {
    return;
  }
  joinPasscodeResultsList.innerHTML = "";
  rows.forEach((row) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "join-passcode-result-item";
    btn.innerHTML = `
      <strong>${escapeHtml(row.event_name || "（無題）")}</strong>
      <span class="join-passcode-result-meta">主催: ${escapeHtml(row.host_name || "—")}<br />日時: ${escapeHtml(
      row.date || "—"
    )}</span>
    `;
    btn.addEventListener("click", () => onPick(row));
    li.appendChild(btn);
    joinPasscodeResultsList.appendChild(li);
  });
}

async function runPasscodeSearch() {
  if (joinPasscodeSearchBusy) {
    return;
  }
  if (!joinPasscodeInput) {
    return;
  }
  const raw = String(joinPasscodeInput.value || "").trim();
  if (joinPasscodeStatusLine) {
    joinPasscodeStatusLine.textContent = "";
  }
  if (!raw) {
    if (joinPasscodeStatusLine) {
      joinPasscodeStatusLine.textContent = "パスコードを入力してください。";
    }
    return;
  }
  joinPasscodeSearchBusy = true;
  if (joinPasscodeSearchButton) {
    joinPasscodeSearchButton.disabled = true;
  }
  try {
    const rows = await fetchActiveEventsByPasscode(raw);
    if (rows.length === 0) {
      showPasscodeInputPanelOnly();
      if (joinPasscodeStatusLine) {
        joinPasscodeStatusLine.textContent = "該当するイベントが見つかりません";
      }
      return;
    }
    if (rows.length === 1) {
      appState.joinPasscodeFlowHadMultiple = false;
      await prepareAndShowJoinPasscodeConfirm(rows[0]);
      return;
    }
    appState.joinPasscodeFlowHadMultiple = true;
    if (joinPasscodeInputPanel) {
      joinPasscodeInputPanel.hidden = true;
    }
    if (joinPasscodeResultsPanel) {
      joinPasscodeResultsPanel.hidden = false;
    }
    if (joinPasscodeConfirmPanel) {
      joinPasscodeConfirmPanel.hidden = true;
    }
    if (joinPasscodeResultsMessage) {
      joinPasscodeResultsMessage.textContent =
        "複数のイベントが見つかりました。参加するイベントを選んでください。";
    }
    renderPasscodeResultsList(rows, (row) => {
      void prepareAndShowJoinPasscodeConfirm(row);
    });
  } catch (e) {
    console.error("パスコード検索エラー:", e);
    if (joinPasscodeStatusLine) {
      joinPasscodeStatusLine.textContent =
        "検索に失敗しました。Firestore の複合インデックス（passcode + is_active）を確認してください。";
    }
  } finally {
    joinPasscodeSearchBusy = false;
    if (joinPasscodeSearchButton) {
      joinPasscodeSearchButton.disabled = false;
    }
  }
}

function setupPasscodeJoinHandlers() {
  if (joinPasscodeSearchButton) {
    joinPasscodeSearchButton.addEventListener("click", () => {
      void runPasscodeSearch();
    });
  }
  if (joinPasscodeInput) {
    joinPasscodeInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        void runPasscodeSearch();
      }
    });
  }
  if (joinRequestApplyButton) {
    joinRequestApplyButton.addEventListener("click", () => {
      void submitJoinRequestForSelectedEvent();
    });
  }
  if (participantEventsGrid && !participantEventsGrid.dataset.participantJoinedDelegation) {
    participantEventsGrid.dataset.participantJoinedDelegation = "1";
    participantEventsGrid.addEventListener("click", (event) => {
      const el = normalizePointerEventTarget(event.target);
      if (!el) {
        return;
      }
      const card = el.closest(".event-card[data-event-id]");
      if (!card || !participantEventsGrid.contains(card)) {
        return;
      }
      const id = String(card.getAttribute("data-event-id") || "").trim();
      if (id) {
        navigateToEventDetail(id, "participant");
      }
    });
  }
}

async function submitJoinRequestForSelectedEvent() {
  if (joinRequestApplyBusy) {
    return;
  }
  const sel = joinPasscodeSelectedSummary;
  if (!sel || !sel.id) {
    if (joinPasscodeStatusLine) {
      joinPasscodeStatusLine.textContent = "先にイベントを検索して選択してください。";
    }
    return;
  }
  joinRequestApplyBusy = true;
  if (joinRequestApplyButton) {
    joinRequestApplyButton.disabled = true;
  }
  try {
    await ensureReadyForFirestoreWrite();
    const authUser = firebase.auth().currentUser;
    const authUid = authUser && authUser.uid ? String(authUser.uid) : "";
    if (!authUid) {
      throw new Error("ログイン情報がありません。");
    }
    const mini = await fetchEventPasscodeDisplayFieldsById(String(sel.id).trim());
    if (!mini || !String(mini.id || "").trim()) {
      throw new Error("イベントが見つかりません。");
    }
    const eventId = String(mini.id).trim();
    const ref = getParticipantDocRefForEvent(eventId, authUid);
    const existing = await ref.get();
    if (existing.exists) {
      const st = String(existing.data()?.status || "");
      if (st === "pending") {
        showWaitingRoomForJoinRequest(eventId, mini.host_name);
        return;
      }
      if (st === "approved" || st === "出席" || st === "欠席" || st === "未定") {
        navigateToEventDetail(eventId);
        return;
      }
      throw new Error("既に参加情報があります。イベントページで状態を確認してください。");
    }
    const name =
      (authUser && !authUser.isAnonymous && authUser.displayName && String(authUser.displayName).trim()) ||
      appState.currentUserName ||
      "参加者";
    /** Firestore ルール participantPendingCreateKeys と完全一致（余計なキーは禁止） */
    const pendingCreatePayload = {
      name: String(name).trim().slice(0, 50),
      status: "pending",
      participantUid: authUid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(pendingCreatePayload);
    showWaitingRoomForJoinRequest(eventId, mini.host_name);
  } catch (e) {
    console.error("参加申請エラー:", e);
    const msg = e?.message || String(e);
    if (joinPasscodeStatusLine) {
      joinPasscodeStatusLine.textContent = msg;
    }
    alert(`参加申請に失敗しました\n${msg}`);
  } finally {
    joinRequestApplyBusy = false;
    if (joinRequestApplyButton) {
      joinRequestApplyButton.disabled = false;
    }
  }
}

async function loadParticipantJoinedEvents() {
  console.log("🔥 [Debug] loadParticipantJoinedEvents が発火しました");
  if (!participantEventsGrid || !participantEventsStatusText) {
    return;
  }
  participantEventsGrid.setAttribute("aria-busy", "true");
  resetParticipantEventGroups();
  const participantSkeletonHost = document.getElementById("participantEventsUpcoming");
  if (participantSkeletonHost) {
    participantSkeletonHost.hidden = false;
    participantSkeletonHost.innerHTML = `
      <div class="skeleton-box skeleton-card"></div>
      <div class="skeleton-box skeleton-card"></div>
      <div class="skeleton-box skeleton-card"></div>
    `;
  }
  participantEventsStatusText.textContent = "";
  try {
    await initializeFirebaseAuthReady();
    const uid = firebase.auth().currentUser?.uid || "";
    if (!uid) {
      resetParticipantEventGroups();
      participantEventsStatusText.textContent = "ログイン後に参加済みイベントを表示できます。";
      return;
    }
    participantEventsStatusText.textContent = "参加済みイベントを読み込み中...";
    const partSnap = await db.collectionGroup("participants").where("participantUid", "==", uid).get();
    if (partSnap.empty) {
      resetParticipantEventGroups();
      participantEventsStatusText.textContent = "参加中のイベントはまだありません。";
      return;
    }
    const eventIds = Array.from(new Set(partSnap.docs.map((doc) => String(doc.ref.parent.parent?.id || "")).filter(Boolean)));
    const events = await Promise.all(
      eventIds.map(async (eventId) => {
        const snap = await db.collection("events").doc(eventId).get();
        if (!snap.exists) {
          return null;
        }
        const data = snap.data() || {};
        if (typeof isEventVisibleInListAfterDissolve === "function" && !isEventVisibleInListAfterDissolve(data)) {
          return null;
        }
        const startMs = parseEventStartMsFromData(data);
        return {
          id: eventId,
          title: String(data.title || "（無題）"),
          dateText: String(data.dateText || "日時未設定"),
          hostName: String(data.host_name || "—"),
          startMs,
          endMs: parseEventEndMsFromData(data, startMs),
          isDissolved: !!data.is_dissolved,
          graceEndMs:
            typeof getGraceEndMsFromDocData === "function" ? Number(getGraceEndMsFromDocData(data) || 0) : 0,
        };
      })
    );
    const rows = events.filter(Boolean);
    if (rows.length === 0) {
      resetParticipantEventGroups();
      participantEventsStatusText.textContent = "表示できる参加中イベントはありません。";
      return;
    }
    const buckets = buildCategorizedEventBuckets(rows);
    renderCategorizedParticipantEvents(buckets);
    participantEventsStatusText.textContent = `${rows.length}件のイベントに参加中です。`;
  } catch (e) {
    console.error("参加済みイベント取得エラー:", e);
    resetParticipantEventGroups();
    participantEventsStatusText.textContent = "参加済みイベントの取得に失敗しました。";
  } finally {
    participantEventsGrid.removeAttribute("aria-busy");
  }
}

const JOIN_EVENT_EXPORTS = {
  mapDocToPasscodeSummary,
  fetchActiveEventsByPasscode,
  fetchEventPasscodeDisplayFieldsById,
  showPasscodeInputPanelOnly,
  showJoinByPasscodeFlow,
  hideJoinByPasscodeFlow,
  showJoinPasscodeConfirm,
  prepareAndShowJoinPasscodeConfirm,
  renderPasscodeResultsList,
  runPasscodeSearch,
  setupPasscodeJoinHandlers,
  submitJoinRequestForSelectedEvent,
  loadParticipantJoinedEvents,
};

Object.assign(window, JOIN_EVENT_EXPORTS);

export {
  mapDocToPasscodeSummary,
  fetchActiveEventsByPasscode,
  fetchEventPasscodeDisplayFieldsById,
  showPasscodeInputPanelOnly,
  showJoinByPasscodeFlow,
  hideJoinByPasscodeFlow,
  showJoinPasscodeConfirm,
  prepareAndShowJoinPasscodeConfirm,
  renderPasscodeResultsList,
  runPasscodeSearch,
  setupPasscodeJoinHandlers,
  submitJoinRequestForSelectedEvent,
  loadParticipantJoinedEvents,
};
