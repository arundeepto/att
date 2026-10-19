import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAewLllHLC5IBces1RCzfxZ4k19k3dU_Lw",
    authDomain: "healthcare-f59c5.firebaseapp.com",
    projectId: "healthcare-f59c5",
    storageBucket: "healthcare-f59c5.firebasestorage.app",
    messagingSenderId: "335899809673",
    appId: "1:335899809673:web:d395f1a579bcec2b12f358"
  };

// Gemini API Key
export const GEMINI_API_KEY = "AQ.Ab8RN6J2MJ4BLaNQkwUDOOC5wcnMD-olyR_AT1vLB28zPifcJQ";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
