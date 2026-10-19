// js/firebase-config.js
// ⚠️ IMPORTANT: Replace these with your own Firebase + Gemini keys

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🔧 STEP 1: Firebase Console → Project Settings → Web App → Config copy
const firebaseConfig = {
    apiKey: "AIzaSyAewLllHLC5IBces1RCzfxZ4k19k3dU_Lw",
    authDomain: "healthcare-f59c5.firebaseapp.com",
    projectId: "healthcare-f59c5",
    storageBucket: "healthcare-f59c5.firebasestorage.app",
    messagingSenderId: "335899809673",
    appId: "1:335899809673:web:d395f1a579bcec2b12f358"
  };

// 🔧 STEP 2: Get Gemini API key from https://aistudio.google.com/app/apikey
// firebase-config.js

// Ti Groq API Key-m
export const GROQ_API_KEY = "Gsk_aIA7pnJcgtM00jcLmkqmWGdyb3FYhJOB0Qo2st0RxiTlOmLQIBnQ"; 

// Ti Groq API Endpoint URL
export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
