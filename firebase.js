import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDm-OaKbBgCC4WazbyGq5WJ-USqQkFTzsY",
  authDomain: "weather-duel-cf13e.firebaseapp.com",
  projectId: "weather-duel-cf13e",
  storageBucket: "weather-duel-cf13e.firebasestorage.app",
  messagingSenderId: "1066877072806",
  appId: "1:1066877072806:web:068b650d5a5b62872c4b67",
  databaseURL: "https://weather-duel-cf13e-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, onValue, update, push };