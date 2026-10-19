import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🌟 Firebase AI Logic Import
import { getAI, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-ai.js";

const firebaseConfig = {
  apiKey: "AIzaSyAewLllHLC5IBces1RCzfxZ4k19k3dU_Lw",
  authDomain: "healthcare-f59c5.firebaseapp.com",
  projectId: "healthcare-f59c5",
  storageBucket: "healthcare-f59c5.firebasestorage.app",
  messagingSenderId: "335899809673",
  appId: "1:335899809673:web:d395f1a579bcec2b12f358"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 🌟 AI Logic Initialize (এখানে কোনো API Key লাগে না)
export const ai = getAI(app, { backend: new GoogleAIBackend() });
