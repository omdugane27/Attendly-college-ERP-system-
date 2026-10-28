importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyB-icF6zYcvQLKM6ne9OtyzlAOKwbDWMAY",
  authDomain: "attendly-web-68887.firebaseapp.com",
  projectId: "attendly-web-68887",
  storageBucket: "attendly-web-68887.firebasestorage.app",
  messagingSenderId: "516599149981",
  appId: "1:516599149981:web:b2761faa72d946116c2b74"
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Attendly notification";
  const options = { body: payload.notification?.body || "You have an update.", icon: "./favicon.ico", data: payload.data || {} };
  self.registration.showNotification(title, options);
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("./"));
});