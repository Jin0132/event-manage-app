/* PWA（A2HS）/ FCM 基盤 / Firestore 解析ログ / 通知トリガー用プレースホルダー */
import {
  db,
  pwaInstallBanner,
  iosAddToHomeModal,
  accountMenuPwaButton,
  accountAvatarDropdown,
  accountMenuNotifyButton,
  accountMenuNotifyButtonLabel,
} from "./01-config-state-dom.js";
import { ensureReadyForFirestoreWrite, getCurrentFirebaseAuthUid } from "./04-firebase-data.js";
import { showToast } from "./02-invite-nav-auth-ui.js";

const ANALYTICS_EVENT_NAMES = new Set([
  "permission_requested",
  "permission_granted",
  "permission_denied",
  "token_registered",
  "notification_clicked",
]);

const NOTIFICATION_TRIGGER_TYPES = new Set([
  "event_info_updated",
  "photo_uploaded",
  "event_dissolved",
]);

let pwaSwRegistration = null;
let fcmMessaging = null;

function updateNotificationButtonUI() {
  if (!accountMenuNotifyButtonLabel || typeof Notification === "undefined") {
    return;
  }
  const granted = Notification.permission === "granted";
  accountMenuNotifyButtonLabel.textContent = granted ? "通知をオフにする" : "通知をオンにする";
}

/**
 * 解析・通知系イベント（クライアント）。SW からは別途 postMessage で集計。
 * @param {string} eventName
 * @param {Record<string, unknown>} [extra]
 */
async function logAnalyticsClientEvent(eventName, extra) {
  if (!ANALYTICS_EVENT_NAMES.has(eventName)) {
    console.warn("logAnalyticsClientEvent: unknown eventName", eventName);
  }
  try {
    await ensureReadyForFirestoreWrite();
    const uid = getCurrentFirebaseAuthUid();
    if (!uid) {
      return;
    }
    await db.collection("analytics_events").add({
      eventName,
      userId: uid,
      source: "client",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      ...(extra && typeof extra === "object" ? { detail: extra } : {}),
    });
  } catch (e) {
    console.warn("logAnalyticsClientEvent", eventName, e);
  }
}

/**
 * Cloud Functions 等が購読しやすいイベント単位ログ（プレースホルダー）
 * @param {string} eventId
 * @param {"event_info_updated"|"photo_uploaded"|"event_dissolved"} triggerType
 * @param {Record<string, unknown>} [payload]
 */
async function logEventNotificationTrigger(eventId, triggerType, payload) {
  if (!eventId || !NOTIFICATION_TRIGGER_TYPES.has(triggerType)) {
    return;
  }
  try {
    await ensureReadyForFirestoreWrite();
    const uid = getCurrentFirebaseAuthUid();
    if (!uid) {
      return;
    }
    await db
      .collection("events")
      .doc(eventId)
      .collection("notificationTriggers")
      .add({
        triggerType,
        actorUid: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        payload: payload && typeof payload === "object" ? payload : {},
      });
  } catch (e) {
    console.warn("logEventNotificationTrigger", eventId, triggerType, e);
  }
}

async function registerPwaServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    pwaSwRegistration = reg;
    return reg;
  } catch (e) {
    console.warn("Service Worker の登録に失敗しました", e);
    return null;
  }
}

function getFirebaseVapidKey() {
  const k = typeof window !== "undefined" ? window.FIREBASE_VAPID_KEY : "";
  return typeof k === "string" && k.trim().length > 0 ? k.trim() : "";
}

function getMessagingInstance() {
  if (fcmMessaging) {
    return fcmMessaging;
  }
  if (typeof firebase === "undefined" || typeof firebase.messaging !== "function") {
    return null;
  }
  try {
    fcmMessaging = firebase.messaging();
    return fcmMessaging;
  } catch (e) {
    console.warn("firebase.messaging()", e);
    return null;
  }
}

async function persistFcmTokenToUserDoc(uid, token) {
  await db
    .collection("users")
    .doc(uid)
    .set(
      {
        /** 直近で登録した端末の FCM トークン（Cloud Functions で送信先に利用可能） */
        fcmToken: token,
        fcmTokenUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        /** 将来の複数端末対応用に配列へも追加（arrayUnion は重複を避ける） */
        fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
      },
      { merge: true }
    );
}

async function requestNotificationPermissionAndRegisterToken() {
  await ensureReadyForFirestoreWrite();
  const uid = getCurrentFirebaseAuthUid();
  if (!uid) {
    if (typeof showToast === "function") {
      showToast(typeof t === "function" ? t("status_login_required", "ログインが必要です。") : "ログインが必要です。");
    }
    return;
  }

  const vapidKey = getFirebaseVapidKey();
  if (!vapidKey) {
    if (typeof showToast === "function") {
      showToast("プッシュ通知の設定（VAPID キー）が未設定です。Firebase コンソールと config.js を確認してください。");
    }
    return;
  }

  const messaging = getMessagingInstance();
  if (!messaging) {
    if (typeof showToast === "function") {
      showToast("通知機能の SDK が読み込まれていません。");
    }
    return;
  }

  await logAnalyticsClientEvent("permission_requested", { path: window.location.pathname });

  let perm = Notification.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }

  if (perm !== "granted") {
    await logAnalyticsClientEvent("permission_denied", { permission: perm });
    if (typeof showToast === "function") {
      showToast(
        typeof t === "function"
          ? t("status_permission_denied", "通知が許可されませんでした。ブラウザ設定から通知を許可できます。")
          : "通知が許可されませんでした。ブラウザ設定から通知を許可できます。"
      );
    }
    return;
  }

  await logAnalyticsClientEvent("permission_granted", {});

  try {
    const reg =
      pwaSwRegistration ||
      (await navigator.serviceWorker.getRegistration("/")) ||
      (await registerPwaServiceWorker());
    if (!reg) {
      throw new Error("Service Worker /sw.js の登録に失敗しました。");
    }
    const token = await messaging.getToken({
      vapidKey,
      serviceWorkerRegistration: reg,
    });
    if (!token) {
      await logAnalyticsClientEvent("token_registered", { ok: false });
      if (typeof showToast === "function") {
        showToast(
          typeof t === "function"
            ? t("status_token_failed", "通知トークンの取得に失敗しました。")
            : "通知トークンの取得に失敗しました。"
        );
      }
      return;
    }
    await persistFcmTokenToUserDoc(uid, token);
    await logAnalyticsClientEvent("token_registered", { ok: true });
    if (typeof showToast === "function") {
      showToast(
        typeof t === "function"
          ? t("status_token_registered", "通知を受け取れるように登録しました。")
          : "通知を受け取れるように登録しました。"
      );
    }
  } catch (e) {
    console.error("FCM getToken", e);
    await logAnalyticsClientEvent("token_registered", { ok: false, error: String(e?.message || e) });
    if (typeof showToast === "function") {
      showToast(`通知の登録に失敗しました: ${e?.message || String(e)}`);
    }
  }
}

function setupForegroundFcmListener() {
  const messaging = getMessagingInstance();
  if (!messaging || typeof messaging.onMessage !== "function") {
    return;
  }
  messaging.onMessage(() => {
    if (typeof showToast === "function") {
      showToast("新しい通知があります（フォアグラウンド）。");
    }
  });
}

function setupServiceWorkerMessageForAnalytics() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    const d = event.data;
    if (d && d.type === "FCM_NOTIFICATION_CLICK") {
      void logAnalyticsClientEvent("notification_clicked", d.data || {});
    }
  });
}

function setupNotifyButton() {
  updateNotificationButtonUI();
  if (document.documentElement.dataset.notifyFocusListenersBound !== "1") {
    document.documentElement.dataset.notifyFocusListenersBound = "1";
    window.addEventListener("focus", updateNotificationButtonUI);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        updateNotificationButtonUI();
      }
    });
  }
  if (!accountMenuNotifyButton || accountMenuNotifyButton.dataset.notifyClickBound === "1") {
    return;
  }
  accountMenuNotifyButton.dataset.notifyClickBound = "1";
  accountMenuNotifyButton.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (accountAvatarDropdown) {
      accountAvatarDropdown.hidden = true;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      alert(
        "通知をオフにするには、ブラウザのURLバー左側の設定（サイト設定）から通知権限をブロックしてください。"
      );
      updateNotificationButtonUI();
      return;
    }
    void requestNotificationPermissionAndRegisterToken().finally(() => {
      updateNotificationButtonUI();
    });
  });
}

/**
 * ログイン後に一度呼び出す（bootstrap 経由）
 */
function hidePwaInstallUiElements() {
  if (pwaInstallBanner) {
    pwaInstallBanner.hidden = true;
  }
  if (iosAddToHomeModal) {
    iosAddToHomeModal.hidden = true;
    iosAddToHomeModal.style.display = "none";
  }
  if (accountMenuPwaButton) {
    accountMenuPwaButton.hidden = true;
  }
}

function initPwaAndMessaging() {
  hidePwaInstallUiElements();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
  });
  void registerPwaServiceWorker().then(() => {
    hidePwaInstallUiElements();
  });
  setupNotifyButton();
  setupServiceWorkerMessageForAnalytics();
  setupForegroundFcmListener();
}

const PWA_FCM_EXPORTS = {
  logAnalyticsClientEvent,
  logEventNotificationTrigger,
  registerPwaServiceWorker,
  requestNotificationPermissionAndRegisterToken,
  updateNotificationButtonUI,
  initPwaAndMessaging,
};

Object.assign(window, PWA_FCM_EXPORTS);

export {
  logAnalyticsClientEvent,
  logEventNotificationTrigger,
  registerPwaServiceWorker,
  requestNotificationPermissionAndRegisterToken,
  updateNotificationButtonUI,
  initPwaAndMessaging,
};
