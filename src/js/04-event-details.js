/* 解散後72時間猶予・TTL用 will_delete_at・詳細ヘッダーのカウントダウン — toDateOrNull は 03 依存 */
import { appState } from "./01-config-state-dom.js";
import { toDateOrNull } from "./03-utils-render-access.js";
import { showRoleSelectUI } from "./01-auth.js";
import { showView } from "./02-ui-common.js";
import { updateAppNavigation } from "./02-invite-nav-auth-ui.js";
import { teardownEventPageLiveListeners } from "./04-firebase-data.js";

const EVENT_DISSOLVED_GRACE_MS = 72 * 60 * 60 * 1000;
const DISSOLVED_GRACE_SUB_30_MS = 30 * 60 * 1000;

function getGraceEndMsFromDocData(data) {
  const d = data || {};
  const wd = typeof toDateOrNull === "function" ? toDateOrNull(d.will_delete_at) : null;
  if (wd && !Number.isNaN(wd.getTime())) {
    return wd.getTime();
  }
  const at = typeof toDateOrNull === "function" ? toDateOrNull(d.dissolved_at) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return null;
  }
  return at.getTime() + EVENT_DISSOLVED_GRACE_MS;
}

function computeEventSocialOpenFromDocData(data) {
  const d = data || {};
  const isDissolved = !!d.is_dissolved;
  const isActive = d.is_active !== false;
  if (isDissolved) {
    const end = getGraceEndMsFromDocData(d);
    if (end == null) {
      return false;
    }
    return Date.now() < end;
  }
  return isActive;
}

function getGraceEndMsFromAppState() {
  const wd =
    appState.willDeleteAt instanceof Date && !Number.isNaN(appState.willDeleteAt.getTime())
      ? appState.willDeleteAt
      : null;
  if (wd) {
    return wd.getTime();
  }
  const dissolvedAt =
    appState.dissolvedAt instanceof Date && !Number.isNaN(appState.dissolvedAt.getTime())
      ? appState.dissolvedAt
      : null;
  if (!dissolvedAt) {
    return null;
  }
  return dissolvedAt.getTime() + EVENT_DISSOLVED_GRACE_MS;
}

function isDissolvedGraceCountdownActive(isDissolved, graceEndMs) {
  if (!isDissolved || graceEndMs == null) {
    return false;
  }
  return Date.now() < graceEndMs;
}

function formatDissolvedGraceCountdownText(remainingMs) {
  if (remainingMs <= 0) {
    return "猶予期間は終了しました。";
  }
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  if (remainingMs >= DAY) {
    const days = Math.ceil(remainingMs / DAY);
    return `残り約 ${days} 日で閲覧・投稿ができなくなります。`;
  }
  if (remainingMs >= DISSOLVED_GRACE_SUB_30_MS) {
    const hours = Math.ceil(remainingMs / HOUR);
    return `残り約 ${hours} 時間で閲覧・投稿ができなくなります。`;
  }
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `残り ${mm}:${String(ss).padStart(2, "0")}（分:秒）で閲覧・投稿ができなくなります。`;
}

let dissolveCountdownTimerId = null;
let dissolveGraceExitInProgress = false;

function hasValidWillDeleteAtInAppState() {
  const wd = appState.willDeleteAt;
  return wd instanceof Date && !Number.isNaN(wd.getTime());
}

function getEventDissolveCountdownBannerEl() {
  return document.getElementById("eventDissolveCountdownBanner");
}

function teardownDissolveCountdownBanner() {
  if (dissolveCountdownTimerId !== null) {
    window.clearTimeout(dissolveCountdownTimerId);
    dissolveCountdownTimerId = null;
  }
  const el = getEventDissolveCountdownBannerEl();
  if (el) {
    el.hidden = true;
    el.textContent = "";
  }
}

/**
 * 猶予終了時: リスナー停止・eventId 除去・役割選択へ（イベントへのアクセス遮断）
 */
async function handleDissolvedGraceExpired(options) {
  const fromSnapshot = options && options.fromSnapshot;
  if (dissolveGraceExitInProgress) {
    return;
  }
  if (!appState.eventId) {
    return;
  }
  dissolveGraceExitInProgress = true;
  try {
    teardownDissolveCountdownBanner();
    if (typeof teardownEventPageLiveListeners === "function") {
      teardownEventPageLiveListeners();
    }
    appState.eventId = "";
    appState.isDissolved = false;
    appState.dissolvedAt = null;
    appState.willDeleteAt = null;
    appState.isEventActive = false;
    const path = window.location.pathname || "/";
    window.history.replaceState({}, "", path);
    appState.appShellEntered = false;
    appState.authSessionRoute = "role_select";
    if (typeof showRoleSelectUI === "function") {
      showRoleSelectUI();
    } else if (typeof showView === "function") {
      showView("role-selection");
      if (typeof updateAppNavigation === "function") {
        updateAppNavigation();
      }
    }
    window.alert(
      fromSnapshot
        ? "このイベントの猶予期間はすでに終了しています。役割選択から続行してください。"
        : "猶予期間が終了しました。このイベントへのアクセスはできません。役割選択から続行してください。"
    );
  } finally {
    dissolveGraceExitInProgress = false;
  }
}

/**
 * イベント詳細ヘッダー上部の猶予カウントダウン（is_dissolved かつ猶予内のみ）
 */
function syncEventDissolveCountdownBanner() {
  const el = getEventDissolveCountdownBannerEl();
  if (!el) {
    return;
  }
  teardownDissolveCountdownBanner();

  if (!hasValidWillDeleteAtInAppState()) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const graceEndMs = getGraceEndMsFromAppState();
  if (!isDissolvedGraceCountdownActive(!!appState.isDissolved, graceEndMs)) {
    el.hidden = true;
    el.textContent = "";
    return;
  }

  const intro =
    "このイベントは解散済みです。データの閲覧・投稿は猶予期間終了まで可能です。";

  function scheduleTick() {
    const remainingMs = graceEndMs - Date.now();
    if (remainingMs <= 0) {
      dissolveCountdownTimerId = null;
      void handleDissolvedGraceExpired({});
      return;
    }
    el.hidden = false;
    el.textContent = `${intro} ${formatDissolvedGraceCountdownText(remainingMs)}`;
    const delay = remainingMs <= DISSOLVED_GRACE_SUB_30_MS ? 1000 : 60 * 1000;
    dissolveCountdownTimerId = window.setTimeout(scheduleTick, delay);
  }

  scheduleTick();
}

function isEventVisibleInListAfterDissolve(d) {
  const data = d || {};
  const isDissolved = !!data.is_dissolved;
  if (!isDissolved) {
    return data.is_active !== false;
  }
  const willDeleteAt = typeof toDateOrNull === "function" ? toDateOrNull(data.will_delete_at) : null;
  if (!(willDeleteAt instanceof Date) || Number.isNaN(willDeleteAt.getTime())) {
    return true;
  }
  return Date.now() < willDeleteAt.getTime();
}

const EVENT_DETAILS_EXPORTS = {
  EVENT_DISSOLVED_GRACE_MS,
  DISSOLVED_GRACE_SUB_30_MS,
  getGraceEndMsFromDocData,
  computeEventSocialOpenFromDocData,
  getGraceEndMsFromAppState,
  isDissolvedGraceCountdownActive,
  formatDissolvedGraceCountdownText,
  teardownDissolveCountdownBanner,
  handleDissolvedGraceExpired,
  syncEventDissolveCountdownBanner,
  isEventVisibleInListAfterDissolve,
};

Object.assign(window, EVENT_DETAILS_EXPORTS);

export {
  EVENT_DISSOLVED_GRACE_MS,
  DISSOLVED_GRACE_SUB_30_MS,
  getGraceEndMsFromDocData,
  computeEventSocialOpenFromDocData,
  getGraceEndMsFromAppState,
  isDissolvedGraceCountdownActive,
  formatDissolvedGraceCountdownText,
  teardownDissolveCountdownBanner,
  handleDissolvedGraceExpired,
  syncEventDissolveCountdownBanner,
  isEventVisibleInListAfterDissolve,
};
