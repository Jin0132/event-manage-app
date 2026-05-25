// 審査時は false にして無料機能のみ有効化
window.ENABLE_PREMIUM_FEATURES = false;

/**
 * Firebase Web アプリ設定（Firebase コンソール → プロジェクトの設定 → 全般 → マイアプリ）
 * 01-config-state-dom.js はこのオブジェクトを参照します。
 * ルートの config.js と同一内容に保つこと（Vite は public/ を /config.js として配信）。
 */
window.FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyAX1AS8PnUKSrESK6K_yIc8yD4OPOBwQuA",
  authDomain: "line-event-manager.firebaseapp.com",
  projectId: "line-event-manager",
  storageBucket: "line-event-manager.firebasestorage.app",
  messagingSenderId: "583089919622",
  appId: "1:583089919622:web:de98ea111d4c6a29692307",
  measurementId: "G-JGV2NBBSWE",
};

/** Web プッシュ（FCM）用 VAPID 公開鍵 — Firebase コンソール → プロジェクトの設定 → Cloud Messaging → Web プッシュ証明書 */
window.FIREBASE_VAPID_KEY = "BE3Uwsb8qnxvcWvXzMmv8C_LBghMLzu4RFojh92kkjGXgcNepgAGRRoGfrWwUflOKvbfVTaRjkqwvAlyt2pIfHI";

/** script.js 先頭の firebase.initializeApp(firebaseConfig) 用（本ファイルは必ず script.js より前に読み込む） */
var firebaseConfig = window.FIREBASE_WEB_CONFIG;
