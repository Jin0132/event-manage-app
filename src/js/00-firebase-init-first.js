const firebaseConfigRef = window.firebaseConfig || window.FIREBASE_WEB_CONFIG;
if (!window.firebase || !firebaseConfigRef) {
  throw new Error("Firebase 初期化に必要な設定が見つかりません。");
}
if (!window.firebase.apps || window.firebase.apps.length === 0) {
  window.firebase.initializeApp(firebaseConfigRef);
}

export {};
