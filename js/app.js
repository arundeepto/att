// js/app.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== TAB NAVIGATION =====
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(btn.dataset.tab).classList.remove("hidden");
  });
});

// ===== AUTH GUARD =====
let currentUser = null;
let userData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  document.getElementById("userName").innerText = user.displayName || user.email;

  try {
    const snap = await getDoc(doc(db, "patients", user.uid));
    if (snap.exists()) {
      userData = snap.data();
      renderPatient(userData);
    } else {
      console.warn("No patient doc found");
    }
  } catch (e) {
    console.error("Load error:", e);
  }
});

// ===== RENDER PATIENT DATA =====
function renderPatient(data) {
  document.getElementById("healthIdText").innerText = data.healthId || "—";
  document.getElementById("bloodText").innerText = data.bloodGroup || "—";
  document.getElementById("ageText").innerText = data.age || "—";

  // QR code
  try {
    QRCode.toCanvas(
      document.getElementById("qrCanvas"),
      JSON.stringify({
        id: data.healthId,
        name: data.name,
        blood: data.bloodGroup
      }),
      { width: 110, margin: 1, color: { dark: "#0f766e", light: "#ffffff" } }
    );
  } catch (e) {
    console.error("QR error:", e);
  }

  // Medical History
  const list = document.getElementById("historyList");
  const history = (data.medicalHistory || []).slice().reverse();

  if (history.length === 0) {
    list.innerHTML = '<p class="text-sm text-gray-400">No records yet. Scan a prescription with AI ✨</p>';
  } else {
    list.innerHTML = history.map(r => `
      <div class="bg-blue-50 p-3 rounded-lg">
        <p class="font-semibold text-sm text-gray-700">${r.date || "—"}</p>
        <p class="text-xs text-gray-600 mt-1"><b>Diagnosis:</b> ${r.diagnosis || "—"}</p>
        <p class="text-xs text-teal-700 mt-1"><b>Meds:</b> ${r.medications || "—"}</p>
        ${r.doctorNotes ? `<p class="text-xs text-gray-500 mt-1 italic">"${r.doctorNotes}"</p>` : ""}
      </div>
    `).join("");
  }
}

// ===== TELEMEDICINE BOOKING =====
document.getElementById("bookBtn").addEventListener("click", async () => {
  const doctor = document.getElementById("doctorSelect").value;
  const date = document.getElementById("apptDate").value;
  const time = document.getElementById("apptTime").value;

  if (!date || !time) {
    alert("Please pick both date and time");
    return;
  }

  const appt = { doctor, date, time, bookedAt: new Date().toISOString() };

  try {
    await updateDoc(doc(db, "patients", currentUser.uid), {
      appointments: arrayUnion(appt)
    });
    document.getElementById("apptMsg").innerText =
      `✅ Appointment confirmed with ${doctor} on ${date} at ${time}`;
  } catch (e) {
    document.getElementById("apptMsg").innerText = "❌ " + e.message;
  }
});

// ===== LOGOUT =====
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// ===== EXPORT =====
export { currentUser, userData };
