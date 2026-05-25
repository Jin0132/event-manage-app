import {
  appState,
  accountAvatarWrap,
  accountAvatarImg,
  participantAccessPendingPanel,
  participantAccessNotJoinedPanel,
  joinStatusText,
  DEFAULT_AVATAR_URL,
  DEFAULT_EVENT,
  MAX_IMAGE_EDGE,
  MAX_UPLOAD_BYTES,
  JPEG_QUALITY_STEPS,
} from "./01-config-state-dom.js";

/** ポップアップ中止・COOP 等、ユーザー操作や環境由来でログに出しても意味が薄い認証エラー */
function isIgnorableAuthPopupLikeError(error) {
  if (!error) {
    return false;
  }
  const code = String(error.code || "");
  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/popup-blocked"
  ) {
    return true;
  }
  const msg = String(error.message || "");
  if (/cross-origin|COOP|Cross-Origin-Opener-Policy|blocked by browser/i.test(msg)) {
    return true;
  }
  return false;
}

let participantsCollUnsub = null;
let photosCollUnsub = null;
let messagesCollUnsub = null;
let eventDocUnsub = null;
/** onAuthStateChanged を二重登録しない */
let firebaseAuthListenerAttached = false;
/** Auth 永続化設定を一度だけ適用 */
let authPersistenceConfigured = false;
/** beforeunload 離脱フラグ登録を二重化しない */
let anonymousUnloadHookAttached = false;

function isFirebaseAppReady() {
  return typeof firebase !== "undefined" && !!firebase.apps && firebase.apps.length > 0;
}

function connectFirestoreAndStorage() {
  if (typeof firebase === "undefined") {
    throw new Error("Firebase SDKの読み込みに失敗しました。");
  }
  if (!isFirebaseAppReady()) {
    throw new Error(
      "Firebase App が未初期化です。script.js 先頭の firebase.initializeApp および config.js の読み込み順を確認してください。"
    );
  }
  if (typeof firebaseConfig === "undefined" || !firebaseConfig || !firebaseConfig.apiKey) {
    throw new Error(
      "firebaseConfig が未定義です。config.js で var firebaseConfig を設定し、script.js より前に読み込んでください。"
    );
  }
  if (!db) {
    db = firebase.firestore();
  }
  if (!storage) {
    storage = firebase.storage();
  }
}

/**
 * signInWithRedirect 後の復帰時、必ず onAuthStateChanged より前に呼ぶ。
 * ここでリダイレクト結果を処理してからリスナーを付けないと、ログインが完了しない・順序不整合になることがある。
 */
async function processAuthRedirectResultIfAny() {
  const auth = firebase.auth();
  let redirectUser = null;
  try {
    const result = await auth.getRedirectResult();
    redirectUser = result?.user || null;
    if (redirectUser && typeof setAuthStatusLine === "function") {
      setAuthStatusLine("");
    }
  } catch (e) {
    if (!isIgnorableAuthPopupLikeError(e)) {
      console.warn("getRedirectResult:", e);
      if (typeof setAuthStatusLine === "function") {
        setAuthStatusLine(`ログイン結果の取得に失敗しました: ${e?.message || String(e)}`);
      }
    }
  }
  /* startMainUIIfLoggedIn は bootstrap() 側で統一（ここで呼ぶとログイン画面より先にプロフィール等が出る） */
}

function startFirebaseAuthListenerOnce() {
  if (firebaseAuthListenerAttached) {
    return;
  }
  firebaseAuthListenerAttached = true;
  const auth = firebase.auth();
  authReadyPromise = new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Firebase認証の初期化がタイムアウトしました。"));
    }, 15000);
    let firstCallback = true;
    auth.onAuthStateChanged((user) => {
      appState.firebaseAuthUid = user?.uid || "";
      appState.isAuthReady = !!user;
      appState.currentPictureUrl = user?.photoURL || "";
      updateJoinButtonUI();
      if (accountAvatarWrap) {
        accountAvatarWrap.hidden = !user;
      }
      if (accountAvatarImg) {
        const photoUrl = user?.photoURL;
        const isAnonymous = !!user?.isAnonymous;
        accountAvatarImg.referrerPolicy = "no-referrer";
        accountAvatarImg.src = !isAnonymous && photoUrl ? photoUrl : DEFAULT_AVATAR_URL;
      }
      updateAppNavigation();
      if (firstCallback) {
        firstCallback = false;
        window.clearTimeout(timeoutId);
        resolve(user);
      }
      if (typeof applyAuthSessionRouteFromUser === "function") {
        void applyAuthSessionRouteFromUser(user || null);
      }
    });
  });
}

function attachAnonymousUnloadAbandonMarkerOnce() {
  if (anonymousUnloadHookAttached) {
    return;
  }
  anonymousUnloadHookAttached = true;
  window.addEventListener("beforeunload", () => {
    try {
      if (!isFirebaseAppReady()) {
        return;
      }
      const user = firebase.auth().currentUser;
      const uid = user?.uid ? String(user.uid) : "";
      const eventId = String(appState.eventId || "").trim();
      if (!user || !user.isAnonymous || !uid || !eventId) {
        return;
      }
      firebase
        .firestore()
        .collection("events")
        .doc(eventId)
        .collection("participants")
        .doc(uid)
        .set(
          {
            is_abandoned: true,
            abandonedAtClientMs: Date.now(),
          },
          { merge: true }
        );
    } catch (error) {
      console.warn("beforeunload guest mark abandoned:", error);
    }
  });
}

async function initializeFirebaseAuthReady() {
  if (!firebaseInitPromise) {
    firebaseInitPromise = (async () => {
      connectFirestoreAndStorage();
      if (!authPersistenceConfigured) {
        try {
          await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        } catch (error) {
          console.error("永続性の設定エラー:", error);
        } finally {
          authPersistenceConfigured = true;
        }
      }
      await processAuthRedirectResultIfAny();
      startFirebaseAuthListenerOnce();
      attachAnonymousUnloadAbandonMarkerOnce();
      await authReadyPromise;
      isFirebaseReady = true;
    })();
  }
  return firebaseInitPromise;
}

async function ensureReadyForFirestoreWrite() {
  await initializeFirebaseAuthReady();
  if (!isFirebaseReady || !getCurrentFirebaseAuthUid()) {
    throw new Error("Firebase認証がまだ完了していません。");
  }
}

function getCurrentFirebaseAuthUid() {
  if (!isFirebaseAppReady()) {
    return appState.firebaseAuthUid || "";
  }
  return appState.firebaseAuthUid || firebase.auth().currentUser?.uid || "";
}

function getEventDocRef() {
  return db.collection("events").doc(appState.eventId);
}

function getParticipantsCollectionRef() {
  return getEventDocRef().collection("participants");
}

/** appState.eventId に依存せず参加者ドキュメントを参照（パスコード・待合室用） */
function getParticipantDocRefForEvent(eventId, participantUid) {
  return db.collection("events").doc(eventId).collection("participants").doc(participantUid);
}

function applyParticipantAccessPanels() {
  if (participantAccessPendingPanel) {
    participantAccessPendingPanel.hidden = appState.participantAccessMode !== "pending";
  }
  if (participantAccessNotJoinedPanel) {
    participantAccessNotJoinedPanel.hidden = appState.participantAccessMode !== "not_joined";
  }
}

/**
 * 非主催者は pending / 未登録のとき一覧・写真・チャットを非表示（UI側ゲート）
 */
async function evaluateParticipantEventAccess() {
  const uid = getCurrentFirebaseAuthUid();
  const eid = appState.eventId;
  if (!uid || !eid) {
    appState.participantAccessMode = eid ? "guest_readonly" : "unlocked";
    appState.organizerAuthUid = "";
  } else {
    try {
      const evSnap = await getEventDocRef().get();
      if (!evSnap.exists) {
        appState.participantAccessMode = "not_joined";
        appState.organizerAuthUid = "";
      } else {
        const od = evSnap.data() || {};
        const authOrgUid = String(od.organizer_auth_uid != null ? od.organizer_auth_uid : "").trim();
        const legacyOrgId = String(od.organizerId || od.organizer_uid || "").trim();
        const isOrganizerByAuthField = !!(authOrgUid && authOrgUid === uid);
        const isOrganizerLegacyId = !authOrgUid && !!(legacyOrgId && legacyOrgId === uid);
        if (isOrganizerByAuthField || isOrganizerLegacyId) {
          appState.organizerAuthUid = authOrgUid || uid;
          /**
           * 主催者でも participants に自分の行が未登録なら、必ず join-gate で自己参加登録を通す。
           * 登録後は organizer として通常のイベント詳細に入る。
           */
          const selfSnap = await getParticipantDocRefForEvent(eid, uid).get();
          if (selfSnap.exists) {
            appState.participantAccessMode = "organizer";
          } else {
            appState.participantAccessMode = "not_joined";
          }
          if (isOrganizerLegacyId) {
            try {
              await getEventDocRef().update({
                organizer_auth_uid: uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              });
            } catch (migrateErr) {
              console.warn("organizer_auth_uid バックフィル失敗:", migrateErr);
              if (typeof showToast === "function") {
                showToast(
                  "このイベントは古いデータ形式のため、一部操作で権限エラーになる場合があります。問題が続く場合は管理者に連絡してください。"
                );
              } else if (joinStatusText) {
                joinStatusText.textContent =
                  "このイベントは古い形式です。主催者操作でエラーが出る場合は再読み込みしてください。";
              }
            }
          }
        } else {
          appState.organizerAuthUid = authOrgUid;
          const selfSnap = await getParticipantDocRefForEvent(eid, uid).get();
          if (selfSnap.exists) {
            const st = String(selfSnap.data().status || "");
            if (st === "pending") {
              appState.participantAccessMode = "pending";
            } else if (st === "approved" || st === "出席" || st === "欠席" || st === "未定") {
              appState.participantAccessMode = "unlocked";
            } else {
              appState.participantAccessMode = "unlocked";
            }
          } else {
            const leg = await getParticipantsCollectionRef().where("participantUid", "==", uid).limit(5).get();
            if (!leg.empty) {
              const st = String(leg.docs[0].data().status || "");
              appState.participantAccessMode = st === "pending" ? "pending" : "unlocked";
            } else {
              appState.participantAccessMode = "not_joined";
            }
          }
        }
      }
    } catch (e) {
      if (e?.code === "permission-denied") {
        console.warn("evaluateParticipantEventAccess は権限がないため制限モードで継続します。", {
          eventId: appState.eventId,
          uid,
        });
      } else {
        console.error("evaluateParticipantEventAccess:", e);
      }
      appState.participantAccessMode = "not_joined";
      appState.organizerAuthUid = "";
    }
  }
  updateAccessControlUI();
  syncEventSocialFirestoreListeners();
}

/** messages / photos / participants / directMessages を購読してよいか（pending・未参加はルール拒否を避けるため購読しない） */
function shouldAttachEventSocialFirestoreListeners() {
  const mode = appState.participantAccessMode || "unlocked";
  return mode === "organizer" || mode === "unlocked";
}

function teardownParticipantsCollListener() {
  if (typeof participantsCollUnsub === "function") {
    participantsCollUnsub();
    participantsCollUnsub = null;
  }
}

function teardownPhotosCollListener() {
  if (typeof photosCollUnsub === "function") {
    photosCollUnsub();
    photosCollUnsub = null;
  }
}

function teardownMessagesCollListener() {
  if (typeof messagesCollUnsub === "function") {
    messagesCollUnsub();
    messagesCollUnsub = null;
  }
}

function teardownAllEventSocialListeners() {
  teardownParticipantsCollListener();
  teardownPhotosCollListener();
  teardownMessagesCollListener();
  if (typeof directMessagesUnsub === "function") {
    directMessagesUnsub();
    directMessagesUnsub = null;
  }
}

/**
 * 承認済み・主催者のみ photos/messages/participants/direct を購読。pending / not_joined では購読を外す。
 */
function syncEventSocialFirestoreListeners() {
  if (!db || !appState.eventId) {
    teardownAllEventSocialListeners();
    return;
  }
  if (appState.participantAccessMode === "guest_readonly") {
    subscribeParticipants();
    teardownPhotosCollListener();
    teardownMessagesCollListener();
    if (typeof directMessagesUnsub === "function") {
      directMessagesUnsub();
      directMessagesUnsub = null;
    }
    mergeChatBuffer = [];
    mergeDirectBuffer = [];
    appState.photos = [];
    appState.messages = [];
    renderPhotos();
    mergeChatAndDirectMessagesAndRender();
    return;
  }
  if (!shouldAttachEventSocialFirestoreListeners()) {
    teardownAllEventSocialListeners();
    mergeChatBuffer = [];
    mergeDirectBuffer = [];
    appState.participants = [];
    appState.photos = [];
    appState.messages = [];
    renderParticipants();
    renderPhotos();
    mergeChatAndDirectMessagesAndRender();
    return;
  }
  subscribeParticipants();
  subscribePhotos();
  subscribeMessages();
  rebuildDirectMessagesSubscription();
}

function getPhotosCollectionRef() {
  return getEventDocRef().collection("photos");
}

function getMessagesCollectionRef() {
  return getEventDocRef().collection("messages");
}

function getDirectMessagesCollectionRef() {
  return getEventDocRef().collection("directMessages");
}

function mergeChatAndDirectMessagesAndRender() {
  // DM は専用モーダルでのみ表示し、メインチャットには混在させない
  const merged = [...mergeChatBuffer].sort((a, b) => a.sortKey - b.sortKey);
  appState.messages = merged;
  renderMessages();
  if (messagesList) {
    messagesList.scrollTop = messagesList.scrollHeight;
  }
}

function mapDirectDocToMessage(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    channel: "direct",
    senderName: data.senderName || "参加者",
    pictureUrl: data.pictureUrl || "",
    text: data.text || "",
    messageType: "",
    senderAuthUid: data.senderAuthUid || "",
    targetParticipantUid: data.targetParticipantUid || "",
    targetParticipantName: data.targetParticipantName || "",
    dmPeerIds: Array.isArray(data.dmPeerIds) ? data.dmPeerIds : [],
    timeText: formatTimestamp(data.createdAt),
    sortKey: timestampToMs(data.createdAt),
  };
}

function rebuildDirectMessagesSubscription() {
  if (typeof directMessagesUnsub === "function") {
    directMessagesUnsub();
    directMessagesUnsub = null;
  }
  if (!appState.eventId || !db) {
    mergeDirectBuffer = [];
    mergeChatAndDirectMessagesAndRender();
    return;
  }
  if (!shouldAttachEventSocialFirestoreListeners()) {
    mergeDirectBuffer = [];
    mergeChatAndDirectMessagesAndRender();
    return;
  }
  const uid = getCurrentFirebaseAuthUid();
  if (!uid) {
    mergeDirectBuffer = [];
    mergeChatAndDirectMessagesAndRender();
    return;
  }
  const ref = getDirectMessagesCollectionRef();
  /** ルール: 主催者は全件クエリのみ可。participantAccessMode が確定してから掛ける（レガシー主催者含む）。 */
  const useOrganizerWideDm = appState.participantAccessMode === "organizer";
  const q = useOrganizerWideDm
    ? ref.orderBy("createdAt", "asc")
    : ref.where("targetParticipantUid", "==", uid).orderBy("createdAt", "asc");
  directMessagesUnsub = q.onSnapshot(
    (snapshot) => {
      if (!appState.canSeeParticipants) {
        mergeDirectBuffer = [];
        mergeChatAndDirectMessagesAndRender();
        return;
      }
      mergeDirectBuffer = snapshot.docs.map((doc) => mapDirectDocToMessage(doc)).filter((x) => !!x.text);
      mergeChatAndDirectMessagesAndRender();
    },
    (err) => {
      if (err?.code === "permission-denied") {
        console.warn("directMessages購読は権限がないためスキップしました。", {
          eventId: appState.eventId,
          mode: appState.participantAccessMode,
        });
        mergeDirectBuffer = [];
        mergeChatAndDirectMessagesAndRender();
        return;
      }
      console.error("directMessages購読エラー:", err);
    }
  );
}

function closeDirectMessagesThreadSubscription() {
  if (typeof directMessagesUnsub === "function") {
    directMessagesUnsub();
    directMessagesUnsub = null;
  }
}

function subscribeDirectMessagesThread(targetUid, onMessages) {
  closeDirectMessagesThreadSubscription();
  const myUid = getCurrentFirebaseAuthUid();
  const peerUid = String(targetUid || "").trim();
  if (!myUid || !peerUid || !appState.eventId || !db) {
    onMessages([]);
    return () => {};
  }
  const q = getDirectMessagesCollectionRef()
    .where("dmPeerIds", "array-contains", myUid);
  directMessagesUnsub = q.onSnapshot(
    (snapshot) => {
      const rows = snapshot.docs
        .map((doc) => mapDirectDocToMessage(doc))
        .filter((message) => {
          if (!message.text) {
            return false;
          }
          const ids = Array.isArray(message.dmPeerIds) ? message.dmPeerIds : [];
          return ids.includes(myUid) && ids.includes(peerUid);
        })
        .sort((a, b) => a.sortKey - b.sortKey);
      onMessages(rows);
    },
    (err) => {
      if (err?.code === "permission-denied") {
        console.warn("個別チャット購読は権限がないためスキップしました。", {
          eventId: appState.eventId,
          targetUid: peerUid,
        });
        onMessages([]);
        return;
      }
      console.error("個別チャット購読エラー:", err);
      onMessages([]);
    }
  );
  return closeDirectMessagesThreadSubscription;
}

async function sendDirectMessageToUser(targetUid, text, targetName = "") {
  const peerUid = String(targetUid || "").trim();
  const body = String(text || "").trim();
  if (!peerUid || !body) {
    return;
  }
  await ensureReadyForFirestoreWrite();
  const myUid = getCurrentFirebaseAuthUid();
  if (!myUid) {
    throw new Error("認証情報が取得できません。");
  }
  const user = isFirebaseAppReady() ? firebase.auth().currentUser : null;
  const senderName = String(
    (user && (user.displayName || user.email || "").trim()) || appState.currentUserName || "参加者"
  ).slice(0, 50);
  const pictureUrl = (user && user.photoURL) || appState.currentPictureUrl || "";
  const dmPeerIds = [myUid, peerUid].filter((v, idx, arr) => !!v && arr.indexOf(v) === idx).sort();
  await getDirectMessagesCollectionRef().add({
    targetParticipantUid: peerUid,
    targetParticipantName: String(targetName || "").slice(0, 50),
    text: body.slice(0, 300),
    senderName,
    pictureUrl,
    senderAuthUid: myUid,
    dmPeerIds,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function getOrganizerSenderPayload() {
  const user = isFirebaseAppReady() ? firebase.auth().currentUser : null;
  const nameFromAuth =
    user && !user.isAnonymous && user.displayName ? user.displayName.trim() : "";
  const name =
    nameFromAuth ||
    (nameInput && nameInput.value.trim()) ||
    appState.currentUserName ||
    "主催者";
  const photo =
    (user && user.photoURL) || appState.currentPictureUrl || "";
  return {
    senderName: name.slice(0, 50),
    pictureUrl: photo,
    senderAuthUid: getCurrentFirebaseAuthUid(),
  };
}

async function postDirectParticipantMessage(targetUid, targetName, text) {
  try {
    await sendDirectMessageToUser(targetUid, text, targetName);
    if (joinStatusText) {
      joinStatusText.textContent = `${targetName} さんに個別メッセージを送りました。`;
    }
  } catch (error) {
    console.error("個別メッセージ送信エラー:", error);
    alert(`送信に失敗しました\n${error?.message || String(error)}`);
  }
}

const LIST_EVENT_DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000;
const LIST_EVENT_POST_END_VISIBLE_MS = 24 * 60 * 60 * 1000;

function parseEventStartMsFromData(data) {
  const d = data || {};
  const dateText = String(d.dateText || "").trim();
  if (dateText && typeof window.parseEventDateTextForIcs === "function") {
    const parsed = window.parseEventDateTextForIcs(dateText);
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
  // 取得不能時は buildCategorizedEventBuckets 側で「開催中」フォールバックに寄せる
  return Number.NaN;
}

function parseEventEndMsFromData(data, startMs) {
  const d = data || {};
  const dateText = String(d.dateText || "").trim();
  if (dateText && typeof window.parseEventDateTextForIcs === "function") {
    const parsed = window.parseEventDateTextForIcs(dateText);
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

    // 1. 主催者が解散したイベントのみ「解散」（72h 抹消・will_delete_at は grace 判定）
    if (row.isDissolved) {
      let graceEndMs = Number.isFinite(row.graceEndMs) ? row.graceEndMs : 0;
      if (!graceEndMs) {
        graceEndMs = endMs + LIST_EVENT_POST_END_VISIBLE_MS;
      }
      const remaining = graceEndMs - now;
      if (Number.isFinite(graceEndMs) && now >= graceEndMs) {
        return;
      }
      row.statusBadgeClass = "is-grace";
      row.statusText =
        remaining > 0
          ? `${closedLabelPrefix}${formatRemainingHoursText(remaining)}${closedLabelSuffix}`
          : (typeof t === "function" ? t("event_status_closed_short", "🏁 解散") : "🏁 解散");
      buckets.closed.push(row);
      return;
    }

    // 2. 開催前
    if (now < startMs) {
      row.statusBadgeClass = "is-active";
      row.statusText = upcomingLabel;
      buckets.upcoming.push(row);
      return;
    }

    // 3. 開始後〜明示解散まで（終了時刻後も未解散なら開催中）
    row.statusBadgeClass = "is-active";
    row.statusText = ongoingLabel;
    buckets.ongoing.push(row);
  });
  Object.values(buckets).forEach((arr) => arr.sort((a, b) => a.startMs - b.startMs));
  return buckets;
}

function renderCategorizedHostEvents(buckets) {
  const upcomingTitle = typeof t === "function" ? t("event_status_upcoming", "📅 開催前") : "📅 開催前";
  const ongoingTitle = typeof t === "function" ? t("event_status_ongoing", "🔴 開催中") : "🔴 開催中";
  const closedTitle = typeof t === "function" ? t("event_status_closed_short", "🏁 解散") : "🏁 解散";
  const groups = [
    { id: "hostEventsUpcoming", title: upcomingTitle, rows: buckets.upcoming },
    { id: "hostEventsOngoing", title: ongoingTitle, rows: buckets.ongoing },
    { id: "hostEventsClosed", title: closedTitle, rows: buckets.closed },
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
      const badgeEl = row.element.querySelector(".my-event-card-badge");
      if (badgeEl) {
        badgeEl.classList.remove("is-active", "is-grace", "is-closed");
        badgeEl.classList.add(row.statusBadgeClass || "is-active");
        badgeEl.textContent = row.statusText || "";
      }
      list.appendChild(row.element);
    });
    container.appendChild(title);
    container.appendChild(list);
    container.hidden = false;
  });
}

function resetHostEventGroups() {
  ["hostEventsUpcoming", "hostEventsOngoing", "hostEventsClosed"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.hidden = true;
    el.innerHTML = "";
  });
}

function showHostEventSkeleton() {
  const skeletonHost = document.getElementById("hostEventsUpcoming");
  if (!skeletonHost) {
    return;
  }
  skeletonHost.hidden = false;
  skeletonHost.innerHTML = `
    <div class="skeleton-box skeleton-card"></div>
    <div class="skeleton-box skeleton-card"></div>
    <div class="skeleton-box skeleton-card"></div>
  `;
}

async function loadMyEvents() {
  console.log("🔥 [Debug] loadMyEvents が発火しました");
  if (!myEventsGrid || !db) {
    return;
  }
  myEventsGrid.setAttribute("aria-busy", "true");
  const uid = getCurrentFirebaseAuthUid();
  if (!uid) {
    if (myEventsStatusText) {
      myEventsStatusText.textContent = "";
    }
    resetHostEventGroups();
    return;
  }
  if (myEventsStatusText) {
    myEventsStatusText.textContent = "読み込み中...";
  }
  showHostEventSkeleton();
  try {
    const snap = await db
      .collection("events")
      .where("organizer_auth_uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();
    if (myEventsStatusText) {
      myEventsStatusText.textContent = "";
    }
    resetHostEventGroups();
    if (snap.empty) {
      if (myEventsStatusText) {
        myEventsStatusText.textContent = "主催イベントはまだありません。下のフォームから作成できます。";
      }
      return;
    }
    const rows = [];
    snap.docs.forEach((docSnap) => {
      const d = docSnap.data() || {};
      if (typeof isEventVisibleInListAfterDissolve === "function" && !isEventVisibleInListAfterDissolve(d)) {
        return;
      }
      const card = document.createElement("article");
      card.className = "my-event-card event-card";
      card.setAttribute("data-event-id", String(docSnap.id || "").trim());
      const passLine =
        d.passcode != null && String(d.passcode).trim()
          ? `<p class="my-event-card-meta my-event-card-pass">参加パスコード: <strong>${escapeHtml(
              String(d.passcode).trim()
            )}</strong></p>`
          : "";
      card.innerHTML = `
        <button type="button" class="my-event-card-link" data-event-id="${escapeAttr(docSnap.id)}">
          <h3 class="my-event-card-title">${escapeHtml(d.title || "無題")}</h3>
          <p class="my-event-card-meta">${escapeHtml(d.dateText || "")}</p>
          <p class="my-event-card-meta">${escapeHtml(d.location || "")}</p>
          ${passLine}
          <span class="my-event-card-badge is-active">📅 開催前</span>
        </button>
        <button type="button" class="my-event-share-button" data-event-id="${escapeAttr(
          docSnap.id
        )}" aria-label="シェア">📤</button>
      `;
      const startMs = parseEventStartMsFromData(d);
      rows.push({
        startMs,
        endMs: parseEventEndMsFromData(d, startMs),
        isDissolved: !!d.is_dissolved,
        graceEndMs:
          typeof getGraceEndMsFromDocData === "function" ? Number(getGraceEndMsFromDocData(d) || 0) : 0,
        element: card,
      });
    });
    if (!rows.length) {
      if (myEventsStatusText) {
        myEventsStatusText.textContent = "該当するイベントはありません。";
      }
      return;
    }
    const buckets = buildCategorizedEventBuckets(rows);
    renderCategorizedHostEvents(buckets);
  } catch (error) {
    console.error("マイイベント取得エラー:", error);
    if (myEventsStatusText) {
      myEventsStatusText.textContent =
        "一覧の取得に失敗しました。Firestore に複合インデックス（organizer_auth_uid + createdAt）が必要な場合があります。";
    }
  } finally {
    myEventsGrid.removeAttribute("aria-busy");
  }
}

function sanitizeFileName(name) {
  return String(name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像の読み込みに失敗しました。"));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("画像の変換に失敗しました。"));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

async function optimizeImageForSpark(file) {
  const img = await loadImageFromFile(file);
  const maxSide = Math.max(img.width, img.height);
  const scale = maxSide > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / maxSide : 1;
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("画像描画コンテキストの初期化に失敗しました。");
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Spark節約のためJPEGに統一して段階的に圧縮
  for (const quality of JPEG_QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob.size <= MAX_UPLOAD_BYTES) {
      return { blob, ext: "jpg" };
    }
  }

  const smallest = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY_STEPS[JPEG_QUALITY_STEPS.length - 1]);
  if (smallest.size > MAX_UPLOAD_BYTES) {
    throw new Error("画像サイズが大きすぎます。より小さい画像を選択してください。");
  }
  return { blob: smallest, ext: "jpg" };
}

async function ensureEventDocumentExists() {
  const eventDocRef = getEventDocRef();
  const snap = await eventDocRef.get();
  if (snap.exists) {
    return;
  }
  const authUid = getCurrentFirebaseAuthUid();
  await eventDocRef.set({
    ...DEFAULT_EVENT,
    organizerId: authUid || "",
    organizer_uid: authUid || "",
    organizer_auth_uid: authUid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function subscribeEventInfo() {
  if (typeof eventDocUnsub === "function") {
    eventDocUnsub();
    eventDocUnsub = null;
  }
  eventDocUnsub = getEventDocRef().onSnapshot((docSnap) => {
    if (!docSnap.exists) {
      applyEventInfo(DEFAULT_EVENT);
      appState.isPremium = false;
      appState.canEditRsvp = true;
      appState.notifyOnUpdate = false;
      appState.dissolvedAt = null;
      appState.willDeleteAt = null;
      appState.isDissolved = false;
      appState.organizerUid = "";
      appState.organizerAuthUid = "";
      appState.eventPasscode = "";
      appState.eventDocTitle = "";
      appState.eventDocDateText = "";
      appState.eventDocLocation = "";
      appState.eventDocLocationUrl = "";
      appState.eventMaxParticipants = null;
      appState.eventAnswerDeadline = null;
      appState.eventIsPrivateList = false;
      appState.eventRequireApproval = false;
      applyEventActiveState(true);
      if (typeof renderOrganizerPasscodePanel === "function") {
        renderOrganizerPasscodePanel();
      }
      rebuildDirectMessagesSubscription();
      return;
    }
    const data = docSnap.data() || {};
    applyEventInfo(data);
    appState.eventDocTitle = data.title != null ? String(data.title) : "";
    appState.eventDocDateText = data.dateText != null ? String(data.dateText) : "";
    appState.eventDocLocation = data.location != null ? String(data.location) : "";
    appState.eventDocLocationUrl = data.location_url != null ? String(data.location_url) : "";
    appState.isPremium = isPremiumFeaturesEnabled() ? !!data.is_premium : false;
    appState.canEditRsvp = data.can_edit_rsvp !== false;
    appState.notifyOnUpdate = !!data.notify_on_update;
    appState.isDissolved = !!data.is_dissolved;
    appState.dissolvedAt = toDateOrNull(data.dissolved_at);
    appState.willDeleteAt = toDateOrNull(data.will_delete_at);
    appState.organizerUid = data.organizerId || data.organizer_uid || "";
    const myUidSnap = getCurrentFirebaseAuthUid();
    const rawOrgAuth =
      data.organizer_auth_uid != null && String(data.organizer_auth_uid).trim()
        ? String(data.organizer_auth_uid).trim()
        : "";
    const legSnap = String(data.organizerId || data.organizer_uid || "").trim();
    let effectiveOrgAuth = rawOrgAuth;
    if (!effectiveOrgAuth && myUidSnap && legSnap === myUidSnap) {
      effectiveOrgAuth = myUidSnap;
    }
    appState.organizerAuthUid = effectiveOrgAuth;
    appState.eventPasscode =
      data.passcode != null && String(data.passcode).trim() ? String(data.passcode).trim() : "";
    const rawMax = data.max_participants;
    if (rawMax == null || rawMax === "") {
      appState.eventMaxParticipants = null;
    } else {
      const n = Number(rawMax);
      appState.eventMaxParticipants = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    }
    appState.eventAnswerDeadline = toDateOrNull(data.answer_deadline);
    appState.eventIsPrivateList = !!data.is_private_list;
    appState.eventRequireApproval = !!data.require_approval;
    const socialOpen =
      typeof computeEventSocialOpenFromDocData === "function"
        ? computeEventSocialOpenFromDocData(data)
        : data.is_active !== false;
    applyEventActiveState(socialOpen);
    if (
      appState.isDissolved &&
      appState.willDeleteAt instanceof Date &&
      !Number.isNaN(appState.willDeleteAt.getTime()) &&
      Date.now() >= appState.willDeleteAt.getTime() &&
      appState.eventId
    ) {
      void handleDissolvedGraceExpired({ fromSnapshot: true });
      return;
    }
    if (typeof renderOrganizerPasscodePanel === "function") {
      renderOrganizerPasscodePanel();
    }
    rebuildDirectMessagesSubscription();
  });
}

function teardownEventPageLiveListeners() {
  if (typeof eventDocUnsub === "function") {
    eventDocUnsub();
    eventDocUnsub = null;
  }
  if (typeof teardownAllEventSocialListeners === "function") {
    teardownAllEventSocialListeners();
  }
  mergeChatBuffer = [];
  mergeDirectBuffer = [];
  appState.participants = [];
  appState.photos = [];
  appState.messages = [];
  if (typeof renderParticipants === "function") {
    renderParticipants();
  }
  if (typeof renderPhotos === "function") {
    renderPhotos();
  }
  if (typeof mergeChatAndDirectMessagesAndRender === "function") {
    mergeChatAndDirectMessagesAndRender();
  }
  if (typeof teardownDissolveCountdownBanner === "function") {
    teardownDissolveCountdownBanner();
  }
  if (typeof closeEventEditPanel === "function") {
    closeEventEditPanel();
  }
}

function subscribeParticipants() {
  teardownParticipantsCollListener();
  if (!appState.eventId || !db) {
    return;
  }
  participantsCollUnsub = getParticipantsCollectionRef()
    .orderBy("createdAt", "asc")
    .onSnapshot((snapshot) => {
      if (!appState.canSeeParticipants) {
        appState.participants = [];
        renderParticipants();
        if (typeof updateAccessControlUI === "function") {
          updateAccessControlUI();
        }
        return;
      }
      appState.participants = snapshot.docs.map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          name: data.name || "名無し",
          status: data.status || "未定",
          comment: data.comment || "",
          pictureUrl: data.pictureUrl || "",
          participantUid: data.participantUid || "",
        };
      });
      renderParticipants();
      if (typeof updateAccessControlUI === "function") {
        updateAccessControlUI();
      }
      if (typeof renderOrganizerPendingParticipantsUI === "function") {
        renderOrganizerPendingParticipantsUI();
      }
    }, (error) => {
      if (error?.code === "permission-denied") {
        console.warn("participants購読は権限がないためスキップしました。", {
          eventId: appState.eventId,
          mode: appState.participantAccessMode,
        });
        appState.participants = [];
        renderParticipants();
        return;
      }
      console.error("participants購読エラー:", error);
    });
}

function subscribePhotos() {
  teardownPhotosCollListener();
  if (!appState.eventId || !db) {
    return;
  }
  photosCollUnsub = getPhotosCollectionRef()
    .orderBy("createdAt", "desc")
    .onSnapshot((snapshot) => {
      if (!appState.canSeeParticipants) {
        appState.photos = [];
        renderPhotos();
        return;
      }
      appState.photos = snapshot.docs.map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          url: data.url || "",
          uploaderName: data.uploaderName || "匿名",
        };
      }).filter((x) => !!x.url);
      renderPhotos();
    }, (error) => {
      if (error?.code === "permission-denied") {
        console.warn("photos購読は権限がないためスキップしました。", {
          eventId: appState.eventId,
          mode: appState.participantAccessMode,
        });
        appState.photos = [];
        renderPhotos();
        return;
      }
      console.error("photos購読エラー:", error);
    });
}

function subscribeMessages() {
  teardownMessagesCollListener();
  if (!appState.eventId || !db) {
    return;
  }
  messagesCollUnsub = getMessagesCollectionRef()
    .orderBy("createdAt", "asc")
    .onSnapshot((snapshot) => {
      if (!appState.canSeeParticipants) {
        mergeChatBuffer = [];
        mergeChatAndDirectMessagesAndRender();
        return;
      }
      mergeChatBuffer = snapshot.docs
        .map((doc) => {
          const data = doc.data() || {};
          const text = String(data.text ?? data.body ?? data.message ?? "").trim();
          const messageType =
            data.messageType ||
            (data.isAnnouncement === true ? "announcement" : "") ||
            (data.channel === "announcement" ? "announcement" : "") ||
            "";
          return {
            id: doc.id,
            channel: "public",
            senderName: data.senderName || "匿名",
            pictureUrl: data.pictureUrl || "",
            text,
            messageType,
            senderAuthUid: data.senderAuthUid || "",
            timeText: formatTimestamp(data.createdAt),
            sortKey: timestampToMs(data.createdAt),
          };
        })
        .filter((x) => !!(x && x.text) && x.messageType !== "direct");
      mergeChatAndDirectMessagesAndRender();
    }, (error) => {
      if (error?.code === "permission-denied") {
        console.warn("messages購読は権限がないためスキップしました。", {
          eventId: appState.eventId,
          mode: appState.participantAccessMode,
        });
        mergeChatBuffer = [];
        mergeDirectBuffer = [];
        mergeChatAndDirectMessagesAndRender();
        return;
      }
      console.error("messages購読エラー:", error);
      mergeChatBuffer = [];
      mergeChatAndDirectMessagesAndRender();
    });
}

const FIREBASE_DATA_EXPORTS = {
  isFirebaseAppReady,
  initializeFirebaseAuthReady,
  ensureReadyForFirestoreWrite,
  getCurrentFirebaseAuthUid,
  getEventDocRef,
  getParticipantsCollectionRef,
  getParticipantDocRefForEvent,
  evaluateParticipantEventAccess,
  syncEventSocialFirestoreListeners,
  getPhotosCollectionRef,
  getMessagesCollectionRef,
  getDirectMessagesCollectionRef,
  mergeChatAndDirectMessagesAndRender,
  rebuildDirectMessagesSubscription,
  getOrganizerSenderPayload,
  postDirectParticipantMessage,
  subscribeDirectMessagesThread,
  closeDirectMessagesThreadSubscription,
  sendDirectMessageToUser,
  loadMyEvents,
  sanitizeFileName,
  optimizeImageForSpark,
  ensureEventDocumentExists,
  subscribeEventInfo,
  teardownEventPageLiveListeners,
  subscribeParticipants,
  subscribePhotos,
  subscribeMessages,
};

Object.assign(window, FIREBASE_DATA_EXPORTS);
window.loadMyEvents = loadMyEvents;

export {
  isFirebaseAppReady,
  initializeFirebaseAuthReady,
  ensureReadyForFirestoreWrite,
  getCurrentFirebaseAuthUid,
  getEventDocRef,
  getParticipantsCollectionRef,
  getParticipantDocRefForEvent,
  evaluateParticipantEventAccess,
  syncEventSocialFirestoreListeners,
  getPhotosCollectionRef,
  getMessagesCollectionRef,
  getDirectMessagesCollectionRef,
  mergeChatAndDirectMessagesAndRender,
  rebuildDirectMessagesSubscription,
  getOrganizerSenderPayload,
  postDirectParticipantMessage,
  subscribeDirectMessagesThread,
  closeDirectMessagesThreadSubscription,
  sendDirectMessageToUser,
  loadMyEvents,
  sanitizeFileName,
  optimizeImageForSpark,
  ensureEventDocumentExists,
  subscribeEventInfo,
  teardownEventPageLiveListeners,
  subscribeParticipants,
  subscribePhotos,
  subscribeMessages,
};
