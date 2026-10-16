// js/auth.js
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =========================================================
// UTILITY: 8-character unique Health ID generator
// Format: IHMS-XXXXXX (e.g. IHMS-A3F9K2)
// =========================================================
function generateHealthId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I
  let id = "IHMS-";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// =========================================================
// ROLE → dashboard mapping
// =========================================================
const ROLE_DASHBOARD = {
  patient:   "dashboard-patient.html",
  doctor:    "dashboard-doctor.html",
  hospital:  "dashboard-hospital.html",
  nurse:     "dashboard-nurse.html",
  pharmacy:  "dashboard-pharmacy.html",
  authority: "dashboard-authority.html"
};

// =========================================================
// ROLE PILL SELECTOR (login page)
// =========================================================
const roleGrid = document.getElementById("roleGrid");
let selectedRole = "patient";

if (roleGrid) {
  // Check URL param ?role=doctor
  const urlRole = new URLSearchParams(window.location.search).get("role");
  if (urlRole && ROLE_DASHBOARD[urlRole]) selectedRole = urlRole;

  // Highlight initial role
  roleGrid.querySelectorAll(".role-pill").forEach(pill => {
    if (pill.dataset.role === selectedRole) pill.classList.add("active");
    else pill.classList.remove("active");

    pill.addEventListener("click", () => {
      roleGrid.querySelectorAll(".role-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      selectedRole = pill.dataset.role;
    });
  });
}

// =========================================================
// REGISTER (patient only from register.html)
// =========================================================
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("regBtn");
    const err = document.getElementById("regError");
    err.innerText = "";
    btn.disabled = true;
    btn.innerText = "Creating...";

    const name = document.getElementById("regName").value.trim();
    const blood = document.getElementById("regBlood").value;
    const age = Number(document.getElementById("regAge").value);
    const gender = document.getElementById("regGender").value;
    const phone = document.getElementById("regPhone").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;

    if (password.length < 6) {
      err.innerText = "Password must be at least 6 characters";
      btn.disabled = false;
      btn.innerText = "Create Account";
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });

      const healthId = generateHealthId();

      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        name,
        email,
        phone: phone || "",
        bloodGroup: blood,
        age,
        gender,
        role: "patient",
        healthId,
        medicalHistory: [],
        appointments: [],
        vaccinations: [],
        medications: [],
        chronicDiseases: [],
        referrals: [],
        nurseCalls: [],
        createdAt: serverTimestamp()
      });

      alert(`✅ Account created!\n\nYour Digital Health ID:\n${healthId}\n\nSave this ID for family & doctor access.`);
      window.location.href = "dashboard-patient.html";
    } catch (error) {
      err.innerText = error.message;
      btn.disabled = false;
      btn.innerText = "Create Account";
    }
  });
}

// =========================================================
// LOGIN (all roles)
// =========================================================
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("loginBtn");
    const err = document.getElementById("loginError");
    err.innerText = "";
    btn.disabled = true;
    btn.innerText = "Signing in...";

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      // Get user doc to read their role
      const snap = await getDoc(doc(db, "users", cred.user.uid));

      if (!snap.exists()) {
        // Role doc missing → fallback to selected role
        window.location.href = ROLE_DASHBOARD[selectedRole] || "dashboard-patient.html";
        return;
      }

      const data = snap.data();
      const actualRole = data.role || selectedRole;

      // Route to correct dashboard based on stored role
      window.location.href = ROLE_DASHBOARD[actualRole] || "dashboard-patient.html";

    } catch (error) {
      err.innerText = error.message;
      btn.disabled = false;
      btn.innerText = "Sign In";
    }
  });
}

// =========================================================
// EXPORTS
// =========================================================
export { generateHealthId, ROLE_DASHBOARD };
