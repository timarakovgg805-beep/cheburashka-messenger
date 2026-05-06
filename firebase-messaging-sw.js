importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyChukX4n2wht5XoPvqFvZ3qL8QnF3g7xqk",
    authDomain: "cheburashka-messenger.firebaseapp.com",
    projectId: "cheburashka-messenger",
    storageBucket: "cheburashka-messenger.appspot.com",
    messagingSenderId: "866248912465",
    appId: "1:866248912465:web:ad608b7c62e5d66818d270"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('Received background message:', payload);
    const notificationTitle = payload.data?.title || 'Новое сообщение';
    const notificationOptions = {
        body: payload.data?.body || 'У вас новое сообщение',
        icon: '/icon-192.png',
        badge: '/icon-192.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});