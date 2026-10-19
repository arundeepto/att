// js/patient.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
  });
});

let currentUser = null;
let userData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=patient"; return; }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    alert("Profile not found. Please register again.");
    window.location.href = "register.html";
    return;
  }
  userData = snap.data();
  renderAll(userData);
});

function renderAll(data) {
  document.getElementById("healthIdText").innerText = data.healthId || "—";
  document.getElementById("bloodText").innerText = data.bloodGroup || "—";
  document.getElementById("ageText").innerText = data.age || "—";
  document.getElementById("genderText").innerText = data.gender || "—";

  try {
    QRCode.toCanvas(document.getElementById("qrCanvas"),
      JSON.stringify({ id: data.healthId, name: data.name, blood: data.bloodGroup, phone: data.phone || "" }),
      { width: 130, margin: 1, color: { dark: "#006a4e", light: "#ffffff" } }
    );
  } catch (e) { console.error("QR error:", e); }

  document.getElementById("statPrescriptions").innerText = (data.medicalHistory || []).length;
  document.getElementById("statMeds").innerText = (data.medications || []).length;
  document.getElementById("statPast").innerText = (data.pastHistory || []).length;
  document.getElementById("statDrug").innerText = (data.drugHistory || []).length;

  const recent = (data.medicalHistory || []).slice().reverse().slice(0, 3);
  const recentList = document.getElementById("recentHistoryList");
  if (recent.length === 0) {
    recentList.innerHTML = '<p class="text-sm text-gray-400">No records yet. Scan a prescription with AI ✨</p>';
  } else {
    recentList.innerHTML = recent.map(renderHistoryItem).join("");
  }

  const full = (data.medicalHistory || []).slice().reverse();
  const fullList = document.getElementById("fullHistoryList");
  if (full.length === 0) {
    fullList.innerHTML = '<p class="text-sm text-gray-400">No records yet</p>';
  } else {
    fullList.innerHTML = full.map(renderHistoryItem).join("");
  }

  // PAST HISTORY
  const pastView = document.getElementById("pastHistoryView");
  if (pastView) {
    const past = data.pastHistory || [];
    pastView.innerHTML = past.length === 0
      ? '<p class="text-gray-400">No records</p>'
      : past.slice().reverse().map(p => `
          <div class="border-b border-orange-200 pb-1">
            <p class="font-medium">${p.condition} ${p.year ? "(" + p.year + ")" : ""}</p>
            ${p.notes ? `<p class="text-orange-700 text-[11px]">${p.notes}</p>` : ""}
          </div>
        `).join("");
  }

  // DRUG HISTORY
  const drugView = document.getElementById("drugHistoryView");
  if (drugView) {
    const drugs = data.drugHistory || [];
    drugView.innerHTML = drugs.length === 0
      ? '<p class="text-gray-400">No records</p>'
      : drugs.slice().reverse().map(d => `
          <div class="border-b border-red-200 pb-1">
            <p class="font-medium">${d.drug}</p>
            <p class="text-red-700 text-[11px]">${d.reaction} ${d.severity ? "· " + d.severity : ""}</p>
          </div>
        `).join("");
  }

  renderMedications(data.medications || []);
  renderVaccines(data.vaccinations || []);
}

function renderHistoryItem(r) {
  return `
    <div class="bg-blue-50 p-4 rounded-xl border border-blue-100">
      <div class="flex justify-between items-start">
        <p class="font-semibold text-sm text-gray-800">${r.date || "—"}</p>
        ${r.doctor ? `<span class="text-[10px] bg-white text-[#006a4e] px-2 py-0.5 rounded-full font-medium">${r.doctor}</span>` : ""}
      </div>
      <p class="text-xs text-gray-600 mt-1"><b>Diagnosis:</b> ${r.diagnosis || "—"}</p>
      <p class="text-xs text-[#006a4e] mt-1 whitespace-pre-line"><b>Meds:</b> ${r.medications || "—"}</p>
      ${r.doctorNotes ? `<p class="text-xs text-gray-500 mt-1 italic">"${r.doctorNotes}"</p>` : ""}
    </div>
  `;
}

function renderMedications(meds) {
  const list = document.getElementById("medsList");
  if (meds.length === 0) {
    list.innerHTML = `<div class="text-center py-8">
      <div class="text-4xl mb-2">💊</div>
      <p class="text-sm text-gray-400">No active medications</p>
      <p class="text-xs text-gray-400 mt-1">Scan a prescription to add medications</p>
    </div>`;
    return;
  }
  list.innerHTML = meds.map((m, i) => {
    const taken = m.taken || false;
    return `
      <div class="flex items-center justify-between p-4 rounded-xl border ${taken ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100'}">
        <div class="flex-1">
          <p class="font-semibold text-sm text-gray-800">${m.name || "—"}</p>
          <p class="text-xs text-gray-500 mt-0.5">${m.dosage || ""} · ${m.frequency || ""} · ${m.duration || ""}</p>
          <p class="text-[10px] text-gray-400 mt-1">🔔 Reminder: Daily at 8:00 AM & 8:00 PM</p>
        </div>
        <button data-med-index="${i}" class="med-toggle text-xs px-3 py-1.5 rounded-lg font-medium ${taken ? 'bg-green-500 text-white' : 'bg-[#006a4e] text-white'}">
          ${taken ? "✓ Taken" : "Mark Taken"}
        </button>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".med-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.medIndex);
      const updatedMeds = [...userData.medications];
      updatedMeds[idx].taken = !updatedMeds[idx].taken;
      await updateDoc(doc(db, "users", currentUser.uid), { medications: updatedMeds });
      userData.medications = updatedMeds;
      renderMedications(updatedMeds);
    });
  });
}

function renderVaccines(vaccines) {
  const list = document.getElementById("vaccineList");
  if (vaccines.length === 0) {
    list.innerHTML = `
      <div class="text-center py-8">
        <div class="text-4xl mb-2">💉</div>
        <p class="text-sm text-gray-400">No vaccination records yet</p>
      </div>
      <div class="mt-6 bg-yellow-50 border border-yellow-100 rounded-2xl p-4">
        <h3 class="font-semibold text-yellow-900 text-sm mb-2">📅 Common Vaccine Schedule (Bangladesh EPI)</h3>
        <ul class="text-xs text-yellow-800 space-y-1">
          <li>• Birth: BCG, OPV-0, Hep-B</li>
          <li>• 6 weeks: Penta-1, OPV-1, PCV-1, Rota-1</li>
          <li>• 10 weeks: Penta-2, OPV-2, PCV-2, Rota-2</li>
          <li>• 14 weeks: Penta-3, OPV-3, PCV-3, IPV, Rota-3</li>
          <li>• 9 months: MR-1, PCV Booster</li>
          <li>• 15 months: MR-2, DPT Booster</li>
        </ul>
      </div>`;
    return;
  }
  list.innerHTML = vaccines.map(v => `
    <div class="flex items-center justify-between p-4 rounded-xl bg-green-50 border border-green-100">
      <div>
        <p class="font-semibold text-sm text-gray-800">${v.name}</p>
        <p class="text-xs text-gray-500">Given: ${v.date || "—"}</p>
      </div>
      <span class="text-xs bg-green-500 text-white px-3 py-1 rounded-full">✓ Done</span>
    </div>
  `).join("");
}

document.getElementById("nurseCallBtn").addEventListener("click", async () => {
  const status = document.getElementById("nurseCallStatus");
  const call = {
    type: "nurse",
    patientId: userData.healthId,
    patientName: userData.name,
    room: userData.room || "Not assigned",
    timestamp: new Date().toISOString(),
    status: "pending"
  };
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      nurseCalls: arrayUnion(call)
    });
    status.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700">
      <p class="font-semibold text-sm">🚨 Nurse Called!</p>
      <p class="text-xs mt-1">Wait for assistance. Called at ${new Date().toLocaleTimeString()}</p>
    </div>`;
    setTimeout(() => {
      status.innerHTML = `<div class="bg-green-50 border border-green-200 rounded-xl p-3 text-green-700">
        <p class="font-semibold text-sm">✅ Nurse Responding</p>
        <p class="text-xs mt-1">Nurse is on the way to your room</p>
      </div>`;
    }, 4000);
  } catch (e) {
    status.innerHTML = `<p class="text-red-500">Error: ${e.message}</p>`;
  }
});

document.getElementById("emergencyBtn").addEventListener("click", async () => {
  if (!confirm("🚨 Send EMERGENCY alert to doctor on duty?")) return;
  const call = {
    type: "emergency",
    patientId: userData.healthId,
    patientName: userData.name,
    bloodGroup: userData.bloodGroup,
    timestamp: new Date().toISOString(),
    status: "critical"
  };
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      nurseCalls: arrayUnion(call)
    });
    alert("🚨 EMERGENCY alert sent!\nDoctor on duty has been notified.");
  } catch (e) {
    alert("Error: " + e.message);
  }
});

document.getElementById("downloadQRBtn").addEventListener("click", () => {
  const canvas = document.getElementById("qrCanvas");
  const link = document.createElement("a");
  link.download = `${userData.healthId}-QR.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
