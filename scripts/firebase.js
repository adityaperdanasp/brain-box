// Brain Box — own Firebase project, fully separate from al-idrisi-games.
// TODO(adit): replace with the config from your new "brain-box" Firebase
// project's Project Settings > General > Your apps > Web app.
const firebaseConfig = {
  apiKey: "TODO_API_KEY",
  authDomain: "brain-box-af9a6.firebaseapp.com",
  databaseURL: "https://brain-box-af9a6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "brain-box-af9a6",
  storageBucket: "brain-box-af9a6.firebasestorage.app",
  messagingSenderId: "TODO_SENDER_ID",
  appId: "TODO_APP_ID"
};

firebase.initializeApp(firebaseConfig);
window.BB_DB = firebase.database();
