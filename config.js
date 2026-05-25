// 審査時は false にして無料機能のみ有効化
window.ENABLE_PREMIUM_FEATURES = false;

/**
 * Firebase Web アプリ設定（Firebase コンソール → プロジェクトの設定 → 全般 → マイアプリ）
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

window.FIREBASE_VAPID_KEY = "";

var firebaseConfig = window.FIREBASE_WEB_CONFIG;
