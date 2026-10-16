// js/auth.js
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== TAB SWITCHING =====
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const formTitle = document.getElementById("formTitle");
const formSubtitle = document.getElementById("formSubtitle");

tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("bg-white", "shadow", "text-teal-700");
  tabLogin.classList.remove("text-gray-500");
  tabRegister.classList.remove("bg-white", "shadow", "text-teal-700");
  tabRegister.classList.add("text-gray-500");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  formTitle.innerText = "Welcome Back 👋";
  formSubtitle.innerText = "Sign in to continue";
});

tabRegister.addEventListener("click", () => {
  tabRegister.classList.add("bg-white", "shadow", "text-teal-700");
  tabRegister.classList.remove("text-gray-500");
  tabLogin.classList.remove("bg-white", "shadow", "text-teal-700");
  tabLogin.classList.add("text-gray-500");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  formTitle.innerText = "Create Account ✨";
  formSubtitle.innerText = "Register to get your Digital Health ID";
});

// ===== GENERATE HEALTH ID =====
function generateHealthId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SH-${year}-${rand}`;
}

// ===== REGISTER =====
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("regError");
  errBox.innerText = "";

  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const blood = document.getElementById("regBlood").value;
  const age = document.getElementById("regAge").value;

  if (password.length < 6) {
    errBox.innerText = "Password must be at least 6 characters";
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });

    const healthId = generateHealthId();

    await setDoc(doc(db, "patients", cred.user.uid), {
      uid: cred.user.uid,
      name,
      email,
      bloodGroup: blood,
      age: Number(age),
      healthId,
      chronicDiseases: [],
      medicalHistory: [],
      appointments: [],
      createdAt: serverTimestamp()
    });

    alert(`✅ Account created!\nYour Digital Health ID: ${healthId}\n\nSave this ID for family access.`);
    window.location.href = "dashboard.html";
  } catch (err) {
    errBox.innerText = err.message;
  }
});

// ===== LOGIN =====
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("loginError");
  errBox.innerText = "";

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch (err) {
    errBox.innerText = err.message;
  }
});
