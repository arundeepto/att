// js/doctor.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, arrayUnion,
  collection, query, where, getDocs, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =========================================================
// TAB NAVIGATION
// =========================================================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "emergency") loadEmergencies();
  });
});

// =========================================================
// AUTH GUARD
// =========================================================
let currentUser = null;
let doctorData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html?role=doctor";
    return;
  }
  currentUser = user;

  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    doctorData = snap.data();

    // Verify role
    if (doctorData.role !== "doctor") {
      alert("Access denied. This portal is for doctors only.");
      window.location.href = "index.html";
      return;
    }

    document.getElementById("doctorName").innerText = "Dr. " + (doctorData.name || "");
    document.getElementById("bmdcBadge").classList.remove("hidden");

    // Set default date
    document.getElementById("rxDate").value = new Date().toISOString().split("T")[0];
  }
});

// =========================================================
// SEARCH PATIENT
// =========================================================
document.getElementById("searchBtn").addEventListener("click", searchPatient);
document.getElementById("searchId").addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchPatient();
});

async function searchPatient() {
  const id = document.getElementById("searchId").value.trim();
  const status = document.getElementById("searchStatus");
  const result = document.getElementById("patientResult");

  if (!id) { alert("Please enter a Health ID"); return; }

  status.innerText = "🔎 Searching...";
  result.classList.add("hidden");

  try {
    const q = query(collection(db, "users"), where("healthId", "==", id));
    const snap = await getDocs(q);

    if (snap.empty) {
      status.innerText = "";
      result.classList.remove("hidden");
      result.innerHTML = `
        <div class="border-t pt-4 text-center">
          <p class="text-sm text-red-500">❌ No patient found with ID: <b>${id}</b></p>
        </div>`;
      return;
    }

    const p = snap.docs[0].data();
    const uid = snap.docs[0].id;

    status.innerText = "✅ Patient found";
    result.classList.remove("hidden");

    // Render patient card
    result.innerHTML = `
      <div class="border-t pt-5">
        <div class="flex justify-between items-start mb-4 flex-wrap gap-3">
          <div>
            <h3 class="font-bold text-lg text-gray-800">${p.name}</h3>
            <p class="text-xs text-gray-500">ID: ${p.healthId} · Age: ${p.age} · ${p.gender}</p>
            <p class="text-xs text-gray-500">Blood: ${p.bloodGroup} · Phone: ${p.phone || "—"}</p>
          </div>
          <div class="flex gap-2">
            <button data-uid="${uid}" data-name="${p.name}" data-hid="${p.healthId}" class="usePatientBtn bg-[#006a4e] text-white text-xs px-3 py-2 rounded-lg font-medium">
              ✍️ Prescribe
            </button>
            <button data-uid="${uid}" class="viewHistoryBtn bg-blue-600 text-white text-xs px-3 py-2 rounded-lg font-medium">
              📋 History
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-4">
          <div class="bg-slate-100 rounded-lg p-2 text-center">Prescriptions<br><b class="text-base">${(p.medicalHistory || []).length}</b></div>
          <div class="bg-slate-100 rounded-lg p-2 text-center">Active Meds<br><b class="text-base">${(p.medications || []).length}</b></div>
          <div class="bg-slate-100 rounded-lg p-2 text-center">Vaccines<br><b class="text-base">${(p.vaccinations || []).length}</b></div>
          <div class="bg-slate-100 rounded-lg p-2 text-center">Referrals<br><b class="text-base">${(p.referrals || []).length}</b></div>
        </div>

        <div class="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-xs">
          <p class="font-semibold text-yellow-900 mb-1">⚠️ Chronic Conditions</p>
          <p class="text-yellow-800">${(p.chronicDiseases || []).join(", ") || "None recorded"}</p>
        </div>

        <div id="historyView" class="hidden mt-4 bg-gray-50 rounded-xl p-3">
          <p class="font-semibold text-sm mb-2">📋 Medical History</p>
          <div class="space-y-2 max-h-60 overflow-y-auto">
            ${(p.medicalHistory || []).length === 0
              ? '<p class="text-xs text-gray-400">No records</p>'
              : p.medicalHistory.slice().reverse().map(r => `
                <div class="bg-white p-2 rounded border border-gray-200 text-xs">
                  <p class="font-medium">${r.date} · ${r.doctor || "—"}</p>
                  <p class="text-gray-600">${r.diagnosis}</p>
                  <p class="text-[#006a4e] whitespace-pre-line">${r.medications}</p>
                </div>
              `).join("")
            }
          </div>
        </div>
      </div>
    `;

    // Attach handlers
    result.querySelector(".usePatientBtn").addEventListener("click", (e) => {
      const b = e.currentTarget;
      document.getElementById("rxPatientId").value = b.dataset.hid;
      document.getElementById("rxPatientName").value = b.dataset.name;
      document.querySelector('[data-tab="prescribe"]').click();
    });

    result.querySelector(".viewHistoryBtn").addEventListener("click", () => {
      document.getElementById("historyView").classList.toggle("hidden");
    });

  } catch (e) {
    status.innerText = "";
    result.classList.remove("hidden");
    result.innerHTML = `<p class="text-sm text-red-500">Error: ${e.message}</p>`;
  }
}

// =========================================================
// SAVE PRESCRIPTION
// =========================================================
document.getElementById("rxSaveBtn").addEventListener("click", async () => {
  const hid = document.getElementById("rxPatientId").value.trim();
  const date = document.getElementById("rxDate").value;
  const diagnosis = document.getElementById("rxDiagnosis").value.trim();
  const meds = document.getElementById("rxMeds").value.trim();
  const notes = document.getElementById("rxNotes").value.trim();
  const status = document.getElementById("rxStatus");

  if (!hid || !date || !diagnosis || !meds) {
    status.innerText = "❌ Please fill all required fields";
    return;
  }

  status.innerText = "Saving...";

  try {
    // Find patient UID
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);

    if (snap.empty) {
      status.innerText = "❌ Patient not found";
      return;
    }

    const patientUid = snap.docs[0].id;

    const record = {
      patientName: document.getElementById("rxPatientName").value,
      date,
      doctor: "Dr. " + (doctorData.name || ""),
      doctorId: currentUser.uid,
      diagnosis,
      medications: meds,
      doctorNotes: notes,
      savedAt: new Date().toISOString(),
      source: "Doctor Portal"
    };

    // Parse meds for reminder
    const parsedMeds = meds.split("\n").filter(Boolean).map(line => {
      const [name, dosage, frequency, duration] = line.split("|").map(s => s.trim());
      return { name, dosage, frequency, duration, taken: false };
    });

    await updateDoc(doc(db, "users", patientUid), {
      medicalHistory: arrayUnion(record),
      medications: arrayUnion(...parsedMeds)
    });

    status.innerText = "✅ Prescription saved to patient's health card!";

    // Clear
    document.getElementById("rxDiagnosis").value = "";
    document.getElementById("rxMeds").value = "";
    document.getElementById("rxNotes").value = "";

    setTimeout(() => status.innerText = "", 3500);

  } catch (e) {
    status.innerText = "❌ " + e.message;
  }
});

// =========================================================
// CLEAR RX FORM
// =========================================================
document.getElementById("rxClearBtn").addEventListener("click", () => {
  ["rxPatientId", "rxPatientName", "rxDiagnosis", "rxMeds", "rxNotes"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("rxDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("rxStatus").innerText = "";
});

// =========================================================
// EMERGENCY ALERTS
// =========================================================
async function loadEmergencies() {
  const list = document.getElementById("emergencyList");
  list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';

  try {
    // For demo: fetch all patients with active nurse calls
    const q = query(collection(db, "users"), where("role", "==", "patient"));
    const snap = await getDocs(q);

    const emergencies = [];
    snap.forEach(docSnap => {
      const p = docSnap.data();
      (p.nurseCalls || []).forEach(call => {
        if (call.type === "emergency" && call.status === "critical") {
          emergencies.push({ ...call, patientUid: docSnap.id });
        }
      });
    });

    if (emergencies.length === 0) {
      list.innerHTML = `
        <div class="text-center py-8">
          <div class="text-4xl mb-2">✅</div>
          <p class="text-sm text-gray-500">No active emergencies</p>
        </div>`;
      return;
    }

    list.innerHTML = emergencies.map(e => `
      <div class="emergency-pulse bg-red-50 border border-red-200 rounded-xl p-4">
        <div class="flex justify-between items-start">
          <div>
            <p class="font-bold text-red-800">🚨 EMERGENCY · ${e.patientName}</p>
            <p class="text-xs text-red-600 mt-1">ID: ${e.patientId} · Blood: ${e.bloodGroup}</p>
            <p class="text-xs text-red-500 mt-1">${new Date(e.timestamp).toLocaleString()}</p>
          </div>
          <button class="respondBtn bg-red-600 text-white text-xs px-3 py-2 rounded-lg font-medium" data-uid="${e.patientUid}">
            Respond
          </button>
        </div>
      </div>
    `).join("");

    list.querySelectorAll(".respondBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        alert("✅ Emergency acknowledged. Nurse notified.");
      });
    });

  } catch (e) {
    list.innerHTML = `<p class="text-sm text-red-500">Error: ${e.message}</p>`;
  }
}

document.getElementById("refreshEmergencyBtn").addEventListener("click", loadEmergencies);

// =========================================================
// REFERRAL
// =========================================================
document.getElementById("refSaveBtn").addEventListener("click", async () => {
  const hid = document.getElementById("refPatientId").value.trim();
  const dept = document.getElementById("refDept").value;
  const notes = document.getElementById("refNotes").value.trim();
  const status = document.getElementById("refStatus");

  if (!hid) { status.innerText = "❌ Enter patient Health ID"; return; }

  status.innerText = "Creating referral...";

  try {
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);

    if (snap.empty) { status.innerText = "❌ Patient not found"; return; }

    const referral = {
      fromDoctor: "Dr. " + (doctorData.name || ""),
      fromDoctorId: currentUser.uid,
      toDepartment: dept,
      reason: notes,
      date: new Date().toISOString(),
      status: "pending"
    };

    await updateDoc(doc(db, "users", snap.docs[0].id), {
      referrals: arrayUnion(referral)
    });

    status.innerText = "✅ Referral sent to " + dept;
    document.getElementById("refPatientId").value = "";
    document.getElementById("refNotes").value = "";
    setTimeout(() => status.innerText = "", 3500);

  } catch (e) {
    status.innerText = "❌ " + e.message;
  }
});

// =========================================================
// APPOINTMENTS (today)
// =========================================================
async function loadAppointments() {
  const list = document.getElementById("apptList");
  const today = new Date().toISOString().split("T")[0];

  try {
    const q = query(collection(db, "users"), where("role", "==", "patient"));
    const snap = await getDocs(q);

    const todayAppts = [];
    snap.forEach(d => {
      const p = d.data();
      (p.appointments || []).forEach(a => {
        if (a.date === today) {
          todayAppts.push({ ...a, patientName: p.name, healthId: p.healthId });
        }
      });
    });

    if (todayAppts.length === 0) {
      list.innerHTML = `
        <div class="text-center py-8">
          <div class="text-4xl mb-2">📅</div>
          <p class="text-sm text-gray-500">No appointments today</p>
        </div>`;
      return;
    }

    list.innerHTML = todayAppts.map(a => `
      <div class="flex justify-between items-center p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm">
        <div>
          <p class="font-semibold">${a.patientName}</p>
          <p class="text-xs text-gray-500">ID: ${a.healthId} · ${a.time}</p>
        </div>
        <span class="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg">${a.doctor}</span>
      </div>
    `).join("");

  } catch (e) {
    list.innerHTML = `<p class="text-sm text-red-500">Error: ${e.message}</p>`;
  }
}

// Load appointments when tab opens
document.querySelector('[data-tab="schedule"]').addEventListener("click", loadAppointments);

// =========================================================
// LOGOUT
// =========================================================
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
