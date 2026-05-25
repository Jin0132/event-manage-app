/* Service Worker — PWA / FCM（config.js の firebaseConfig と同期すること） */
/* eslint-disable no-undef */

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyAX1AS8PnUKSrESK6K_yIc8yD4OPOBwQuA",
  authDomain: "line-event-manager.firebaseapp.com",
  projectId: "line-event-manager",
  storageBucket: "line-event-manager.firebasestorage.app",
  messagingSenderId: "583089919622",
  appId: "1:583089919622:web:de98ea111d4c6a29692307",
  measurementId: "G-JGV2NBBSWE",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "お知らせ";
  const body = (payload.notification && payload.notification.body) || "";
  const options = {
    body,
    icon: "/icons/app-icon-192.svg",
    badge: "/icons/app-icon-192.svg",
    data: Object.assign({}, payload.data || {}, {
      fcmMessageId: payload.messageId || "",
    }),
    tag: payload.messageId || "fcm-default",
    renotify: true,
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const payload = {
    type: "FCM_NOTIFICATION_CLICK",
    data: event.notification.data || {},
  };
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        try {
          client.postMessage(payload);
        } catch (e) {
          /* ignore */
        }
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
      }
    })()
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
