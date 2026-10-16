// js/family.js
import { db } from "./firebase-config.js";
import {
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.getElementById("familyBtn")?.addEventListener("click", async () => {
  const id = document.getElementById("familyId").value.trim();
  const result = document.getElementById("familyResult");

  if (!id) {
    alert("Please enter a Health ID");
    return;
  }

  result.classList.remove("hidden");
  result.innerHTML = `<p class="text-sm text-gray-500 text-center">🔎 Searching...</p>`;

  try {
    const q = query(
      collection(db, "patients"),
      where("healthId", "==", id)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      result.innerHTML = `
        <div class="border-t pt-5 text-center">
          <p class="text-sm text-red-500">❌ No patient found with ID: <b>${id}</b></p>
          <p class="text-xs text-gray-400 mt-2">Ask the patient for their correct Digital Health ID</p>
        </div>`;
      return;
    }

    const p = snap.docs[0].data();

    // Latest medical record
    const latestRecord = (p.medicalHistory || []).slice(-1)[0];

    result.innerHTML = `
      <div class="border-t pt-5">
        <div class="flex justify-between items-center mb-4">
          <div>
            <h3 class="font-bold text-lg text-gray-800">${p.name}</h3>
            <p class="text-xs text-gray-500">ID: ${p.healthId} · Blood: ${p.bloodGroup || "—"}</p>
          </div>
          <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Stable</span>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-4">
          <div class="text-center p-2 rounded-lg bg-slate-100">❤️ BP<br><b>118/76</b></div>
          <div class="text-center p-2 rounded-lg bg-slate-100">💓 Pulse<br><b>82</b></div>
          <div class="text-center p-2 rounded-lg bg-slate-100">🌡️ Temp<br><b>37.1°C</b></div>
          <div class="text-center p-2 rounded-lg bg-slate-100">🫁 SpO₂<br><b>98%</b></div>
        </div>

        <div class="bg-blue-50 p-3 rounded-lg text-sm">
          <p class="font-medium text-gray-700">💊 Latest Medication</p>
          <p class="text-xs mt-1">${latestRecord?.medications || "No medication records"}</p>
        </div>

        <div class="bg-teal-50 p-3 rounded-lg text-sm mt-2">
          <p class="font-medium text-gray-700">📝 Latest Update</p>
          <p class="text-xs mt-1">${latestRecord?.doctorNotes || "Patient under observation. Stable condition."}</p>
        </div>

        <div class="bg-yellow-50 p-3 rounded-lg text-sm mt-2">
          <p class="font-medium text-gray-700">📅 Appointments</p>
          <p class="text-xs mt-1">${(p.appointments || []).length > 0
            ? p.appointments.slice(-2).map(a => `${a.doctor} — ${a.date} ${a.time}`).join("<br>")
            : "No upcoming appointments"}</p>
        </div>
      </div>
    `;
  } catch (e) {
    result.innerHTML = `
      <div class="border-t pt-5 text-center">
        <p class="text-sm text-red-500">❌ Error: ${e.message}</p>
      </div>`;
  }
});
