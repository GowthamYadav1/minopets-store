/**
 * Copy to firebase-config.js (gitignored):
 *   cp dev/js/firebase-config.example.js dev/js/firebase-config.js
 *
 * Fill values from Firebase console → Project settings → Your apps.
 * functionsBase: https://asia-south1-YOUR_PROJECT_ID.cloudfunctions.net
 * Never commit firebase-config.js.
 */
window.MINO_FIREBASE = {
  enabled: true,
  apiKey: 'AIzaSyBcIbgmd2GiAI4XkbAafDQzqPI9b8VbGXA',
  authDomain: 'mino-pets.firebaseapp.com',
  projectId: 'mino-pets',
  storageBucket: 'mino-pets.firebasestorage.app',
  messagingSenderId: '2146007591',
  appId: '1:2146007591:web:075681c0c6f32fe976ac02',
  functionsBase: 'https://asia-south1-mino-pets.cloudfunctions.net'
};
