// js/doctor.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, arrayUnion,
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// TABS
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "emergency") loadEmergencies();
  });
});

// AUTH
let currentUser = null;
let doctorData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=doctor"; return; }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    doctorData = snap.data();
    if (doctorData.role !== "doctor") {
      alert("Access denied. Doctors only.");
      window.location.href = "index.html";
      return;
    }
    document.getElementById("doctorName").innerText = "Dr. " + (doctorData.name || "");
    document.getElementById("bmdcBadge").classList.remove("hidden");
    document.getElementById("rxDate").value = new Date().toISOString().split("T")[0];
  }
});

// SEARCH PATIENT — with 3 histories
document.getElementById("searchBtn").addEventListener("click", searchPatient);
document.getElementById("searchId").addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchPatient();
});

async function searchPatient() {
  const id = document.getElementById("searchId").value.trim();
  const status = document.getElementById("searchStatus");
  const result = document.getElementById("patientResult");
  if (!id) { alert("Enter Health ID"); return; }
  status.innerText = "🔎 Searching...";
  result.classList.add("hidden");

  try {
    const q = query(collection(db, "users"), where("healthId", "==", id));
    const snap = await getDocs(q);
    if (snap.empty) {
      status.innerText = "";
      result.classList.remove("hidden");
      result.innerHTML = `<div class="border-t pt-4 text-center"><p class="text-sm text-red-500">❌ No patient found: <b>${id}</b></p></div>`;
      return;
    }
    const p = snap.docs[0].data();
    const uid = snap.docs[0].id;
    status.innerText = "✅ Patient found";
    result.classList.remove("hidden");

    result.innerHTML = `
      <div class="border-t pt-5">
        <div class="flex justify-between items-start mb-4 flex-wrap gap-3">
          <div>
            <h3 class="font-bold text-lg text-gray-800">${p.name}</h3>
            <p class="text-xs text-gray-500">ID: ${p.healthId} · Age: ${p.age} · ${p.gender}</p>
            <p class="text-xs text-gray-500">Blood: ${p.bloodGroup} · Phone: ${p.phone || "—"}</p>
          </div>
          <button data-uid="${uid}" data-name="${p.name}" data-hid="${p.healthId}" class="usePatientBtn bg-[#006a4e] text-white text-xs px-3 py-2 rounded-lg font-medium">✍️ Prescribe</button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-4">
          <div class="bg-slate-100 rounded-lg p-2 text-center">Prescriptions<br><b class="text-base">${(p.medicalHistory || []).length}</b></div>
          <div class="bg-slate-100 rounded-lg p-2 text-center">Active Meds<br><b class="text-base">${(p.medications || []).length}</b></div>
          <div class="bg-orange-50 rounded-lg p-2 text-center">Past History<br><b class="text-base text-orange-700">${(p.pastHistory || []).length}</b></div>
          <div class="bg-red-50 rounded-lg p-2 text-center">Drug History<br><b class="text-base text-red-700">${(p.drugHistory || []).length}</b></div>
        </div>

        <div class="space-y-3">
          <div class="bg-gray-50 rounded-xl p-3">
            <p class="font-semibold text-sm mb-2">📋 Medical History</p>
            <div class="space-y-2 max-h-52 overflow-y-auto">
              ${(p.medicalHistory || []).length === 0
                ? '<p class="text-xs text-gray-400">No records</p>'
                : p.medicalHistory.slice().reverse().map(r => `
                  <div class="bg-white p-2 rounded border border-gray-200 text-xs">
                    <div class="flex justify-between">
                      <p class="font-medium">${r.date} · ${r.doctor || "—"}</p>
                      ${r.source ? `<span class="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">${r.source}</span>` : ""}
                    </div>
                    <p class="text-gray-600 mt-1"><b>Dx:</b> ${r.diagnosis || "—"}</p>
                    <p class="text-[#006a4e] whitespace-pre-line mt-0.5">${r.medications || ""}</p>
                  </div>
                `).join("")}
            </div>
          </div>

          <div class="bg-orange-50 rounded-xl p-3 border border-orange-100">
            <p class="font-semibold text-sm mb-2 text-orange-900">🕐 Past Medical History</p>
            <div class="space-y-1 max-h-40 overflow-y-auto">
              ${(p.pastHistory || []).length === 0
                ? '<p class="text-xs text-gray-400">No records</p>'
                : p.pastHistory.slice().reverse().map(h => `
                  <div class="bg-white p-2 rounded border border-orange-200 text-xs">
                    <div class="flex justify-between">
                      <p class="font-medium text-orange-900">${h.condition}</p>
                      <span class="text-[10px] text-orange-600">${h.year || ""}</span>
                    </div>
                    ${h.notes ? `<p class="text-orange-700 text-[11px] mt-0.5">${h.notes}</p>` : ""}
                  </div>
                `).join("")}
            </div>
          </div>

          <div class="bg-red-50 rounded-xl p-3 border border-red-100">
            <p class="font-semibold text-sm mb-2 text-red-900">⚠️ Drug / Allergy History</p>
            <div class="space-y-1 max-h-40 overflow-y-auto">
              ${(p.drugHistory || []).length === 0
                ? '<p class="text-xs text-gray-400">No records</p>'
                : p.drugHistory.slice().reverse().map(h => `
                  <div class="bg-white p-2 rounded border border-red-200 text-xs">
                    <div class="flex justify-between">
                      <p class="font-medium text-red-900">${h.drug}</p>
                      <span class="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">${h.severity || "—"}</span>
                    </div>
                    <p class="text-red-700 text-[11px] mt-0.5">${h.reaction}</p>
                  </div>
                `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    result.querySelector(".usePatientBtn").addEventListener("click", (e) => {
      const b = e.currentTarget;
      document.getElementById("rxPatientId").value = b.dataset.hid;
      document.getElementById("rxPatientName").value = b.dataset.name;
      document.querySelector('[data-tab="prescribe"]').click();
    });

  } catch (e) {
    status.innerText = "";
    result.classList.remove("hidden");
    result.innerHTML = `<p class="text-sm text-red-500">Error: ${e.message}</p>`;
  }
}

// SAVE RX
document.getElementById("rxSaveBtn").addEventListener("click", async () => {
  const hid = document.getElementById("rxPatientId").value.trim();
  const date = document.getElementById("rxDate").value;
  const diagnosis = document.getElementById("rxDiagnosis").value.trim();
  const meds = document.getElementById("rxMeds").value.trim();
  const notes = document.getElementById("rxNotes").value.trim();
  const status = document.getElementById("rxStatus");

  if (!hid || !date || !diagnosis || !meds) {
    status.innerText = "❌ Fill all required fields";
    return;
  }
  status.innerText = "Saving...";

  try {
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);
    if (snap.empty) { status.innerText = "❌ Patient not found"; return; }

    const record = {
      patientName: document.getElementById("rxPatientName").value,
      date,
      doctor: "Dr. " + (doctorData.name || ""),
      doctorId: currentUser.uid,
      doctorBmdc: doctorData.bmdcId || "",
      diagnosis,
      medications: meds,
      doctorNotes: notes,
      savedAt: new Date().toISOString(),
      source: "Doctor Portal"
    };

    const parsedMeds = meds.split("\n").filter(Boolean).map(line => {
      const [name, dosage, frequency, duration] = line.split("|").map(s => s.trim());
      return { name, dosage, frequency, duration, taken: false };
    });

    await updateDoc(doc(db, "users", snap.docs[0].id), {
      medicalHistory: arrayUnion(record),
      medications: arrayUnion(...parsedMeds)
    });

    status.innerText = "✅ Prescription saved!";
    setTimeout(() => status.innerText = "", 3000);
  } catch (e) {
    status.innerText = "❌ " + e.message;
  }
});

// PRINT
document.getElementById("rxPrintBtn").addEventListener("click", () => {
  const patientName = document.getElementById("rxPatientName").value.trim() || "—";
  const patientId = document.getElementById("rxPatientId").value.trim() || "—";
  const date = document.getElementById("rxDate").value || "—";
  const diagnosis = document.getElementById("rxDiagnosis").value.trim() || "—";
  const meds = document.getElementById("rxMeds").value.trim();
  const notes = document.getElementById("rxNotes").value.trim();

  if (!patientName || !diagnosis || !meds) {
    alert("Please fill Patient ID, Name, Diagnosis and Medications before printing");
    return;
  }

  document.getElementById("printDate").innerText = date;
  document.getElementById("printPatientName").innerText = patientName;
  document.getElementById("printPatientId").innerText = patientId;
  document.getElementById("printDiagnosis").innerText = diagnosis;
  document.getElementById("printNotes").innerText = notes || "No additional notes";
  document.getElementById("printDoctorName").innerText = "Dr. " + (doctorData.name || "—");
  document.getElementById("printDoctorBmdc").innerText = doctorData.bmdcId ? "BMDC: " + doctorData.bmdcId : "";

  const tbody = document.getElementById("printMedTable");
  const medsList = meds.split("\n").filter(Boolean);
  tbody.innerHTML = medsList.map((line, i) => {
    const [name, dosage, frequency, duration] = line.split("|").map(s => s.trim());
    return `
      <tr>
        <td style="padding: 6px; border: 1px solid #ddd;">${i + 1}</td>
        <td style="padding: 6px; border: 1px solid #ddd; font-weight: 500;">${name || "—"}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${dosage || "—"}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${frequency || "—"}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${duration || "—"}</td>
      </tr>
    `;
  }).join("");

  document.getElementById("printArea").classList.remove("hidden");
  document.getElementById("printArea").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => window.print(), 500);
});

// Print CSS
const printStyle = document.createElement("style");
printStyle.innerHTML = `
  @media print {
    body * { visibility: hidden !important; }
    #printArea, #printArea * { visibility: visible !important; }
    #printArea { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
    @page { margin: 15mm; }
  }
`;
document.head.appendChild(printStyle);

// CLEAR
document.getElementById("rxClearBtn").addEventListener("click", () => {
  ["rxPatientId", "rxPatientName", "rxDiagnosis", "rxMeds", "rxNotes"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("rxDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("rxStatus").innerText = "";
  document.getElementById("printArea").classList.add("hidden");
});

// EMERGENCY
async function loadEmergencies() {
  const list = document.getElementById("emergencyList");
  list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';
  try {
    const q = query(collection(db, "users"), where("role", "==", "patient"));
    const snap = await getDocs(q);
    const emergencies = [];
    snap.forEach(d => {
      const p = d.data();
      (p.nurseCalls || []).forEach(c => {
        if (c.type === "emergency" && c.status === "critical") {
          emergencies.push({ ...c, patientUid: d.id });
        }
      });
    });
    if (emergencies.length === 0) {
      list.innerHTML = `<div class="text-center py-8"><div class="text-4xl mb-2">✅</div><p class="text-sm text-gray-500">No active emergencies</p></div>`;
      return;
    }
    list.innerHTML = emergencies.map(e => `
      <div class="emergency-pulse bg-red-50 border border-red-200 rounded-xl p-4">
        <div class="flex justify-between items-start">
          <div>
            <p class="font-bold text-red-800">🚨 ${e.patientName}</p>
            <p class="text-xs text-red-600 mt-1">ID: ${e.patientId} · Blood: ${e.bloodGroup}</p>
            <p class="text-xs text-red-500 mt-1">${new Date(e.timestamp).toLocaleString()}</p>
          </div>
          <button class="respondBtn bg-red-600 text-white text-xs px-3 py-2 rounded-lg font-medium">Respond</button>
        </div>
      </div>
    `).join("");
    list.querySelectorAll(".respondBtn").forEach(btn => {
      btn.addEventListener("click", () => alert("✅ Emergency acknowledged."));
    });
  } catch (e) {
    list.innerHTML = `<p class="text-sm text-red-500">Error: ${e.message}</p>`;
  }
}

document.getElementById("refreshEmergencyBtn").addEventListener("click", loadEmergencies);

// REFERRAL
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
    await updateDoc(doc(db, "users", snap.docs[0].id), {
      referrals: arrayUnion({
        fromDoctor: "Dr. " + (doctorData.name || ""),
        fromDoctorId: currentUser.uid,
        toDepartment: dept,
        reason: notes,
        date: new Date().toISOString(),
        status: "pending"
      })
    });
    status.innerText = "✅ Referral sent to " + dept;
    document.getElementById("refPatientId").value = "";
    document.getElementById("refNotes").value = "";
    setTimeout(() => status.innerText = "", 3000);
  } catch (e) {
    status.innerText = "❌ " + e.message;
  }
});

// APPOINTMENTS
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
        if (a.date === today) todayAppts.push({ ...a, patientName: p.name, healthId: p.healthId });
      });
    });
    if (todayAppts.length === 0) {
      list.innerHTML = `<div class="text-center py-8"><div class="text-4xl mb-2">📅</div><p class="text-sm text-gray-500">No appointments today</p></div>`;
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

document.querySelector('[data-tab="schedule"]').addEventListener("click", loadAppointments);

// LOGOUT
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
