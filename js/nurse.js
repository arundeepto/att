import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, arrayUnion, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// TABS (নার্স ড্যাশবোর্ডের ট্যাব ফিক্স)
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    
    if (btn.dataset.tab === "patients") loadPatients();
  });
});

let currentUser = null;
let nurseData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=nurse"; return; }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    nurseData = snap.data();
    document.getElementById("nurseName").innerText = nurseData.name + " (" + (nurseData.department || "General") + ")";
  }
  loadCalls();
});

// ===== LOAD CALLS (শুধু নিজের ডিপার্টমেন্ট) =====
async function loadCalls() {
  const list = document.getElementById("callsList");
  list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';

  try {
    const q = query(collection(db, "users"), where("role", "==", "patient"));
    const snap = await getDocs(q);
    const calls = [];
    
    snap.forEach(d => {
      const p = d.data();
      if (p.admittedDepartment === nurseData.department) {
        (p.nurseCalls || []).forEach(c => {
          if (c.status === "pending" || c.status === "critical") calls.push({ ...c, patientUid: d.id });
        });
      }
    });

    if (calls.length === 0) {
      list.innerHTML = `<div class="text-center py-8"><div class="text-4xl mb-2">✅</div><p class="text-sm text-gray-500">No pending calls in ${nurseData.department}</p></div>`;
      return;
    }

    list.innerHTML = calls.map(c => `
      <div class="${c.type === "emergency" ? "emergency-pulse bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"} border rounded-xl p-4 mb-2">
        <div class="flex justify-between items-start flex-wrap gap-3">
          <div>
            <p class="font-bold text-sm">${c.type === "emergency" ? "🚨 SOS" : "🔔 Nurse Call"} · ${c.patientName}</p>
            <p class="text-xs text-gray-600 mt-1">Room: ${c.room} · Dept: ${c.department}</p>
          </div>
          <button class="respondBtn bg-[#006a4e] text-white text-xs px-3 py-2 rounded-lg font-medium" data-uid="${c.patientUid}">✅ Responded</button>
        </div>
      </div>
    `).join("");

    list.querySelectorAll(".respondBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        const data = userSnap.data();
        const updatedCalls = (data.nurseCalls || []).map(c => ({ ...c, status: "responded" }));
        await updateDoc(userRef, { nurseCalls: updatedCalls });
        loadCalls();
      });
    });
  } catch (e) { list.innerHTML = `<p class="text-sm text-red-500">Error: ${e.message}</p>`; }
}

document.getElementById("refreshBtn").addEventListener("click", loadCalls);

// ===== VITALS =====
document.getElementById("vitalSaveBtn")?.addEventListener("click", async () => {
  const hid = document.getElementById("vPatientId").value.trim();
  const bp = document.getElementById("vBP").value.trim();
  const pulse = document.getElementById("vPulse").value;
  const temp = document.getElementById("vTemp").value;
  const spo2 = document.getElementById("vSpo2").value;
  const notes = document.getElementById("vNotes").value.trim();
  const status = document.getElementById("vitalStatus");

  if (!hid || !bp || !pulse || !spo2) { status.innerText = "❌ Required: ID, BP, Pulse, SpO2"; return; }
  status.innerText = "Saving...";

  try {
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);
    if (snap.empty) { status.innerText = "❌ Patient not found"; return; }

    await updateDoc(doc(db, "users", snap.docs[0].id), {
      vitals: arrayUnion({ bp, pulse: Number(pulse), temp: temp ? Number(temp) : null, spo2: Number(spo2), notes, loggedBy: nurseData.name || "Nurse", timestamp: new Date().toISOString() })
    });

    status.innerText = "✅ Vitals saved";
    ["vPatientId", "vBP", "vPulse", "vTemp", "vSpo2", "vNotes"].forEach(id => document.getElementById(id).value = "");
    setTimeout(() => status.innerText = "", 3000);
  } catch (e) { status.innerText = "❌ " + e.message; }
});

// ===== ADD TREATMENT =====
document.getElementById("addTreatBtn")?.addEventListener("click", async () => {
  const pid = document.getElementById("tPatientId").value.trim();
  const tname = document.getElementById("tName").value.trim();
  const status = document.getElementById("tStatusMsg");
  
  if (!pid || !tname) { status.innerText = "❌ Fill fields"; return; }
  status.innerText = "Saving...";

  try {
    const q = query(collection(db, "users"), where("healthId", "==", pid));
    const snap = await getDocs(q);
    if (snap.empty) { status.innerText = "❌ Patient not found"; return; }

    await updateDoc(doc(db, "users", snap.docs[0].id), {
      treatments: arrayUnion({ name: tname, date: new Date().toISOString().split("T")[0], department: nurseData.department, by: nurseData.name })
    });
    status.innerText = "✅ Treatment added!";
    document.getElementById("tPatientId").value = "";
    document.getElementById("tName").value = "";
    setTimeout(() => status.innerText = "", 3000);
  } catch (e) { status.innerText = "❌ " + e.message; }
});

// ===== MY PATIENTS =====
async function loadPatients() {
  const list = document.getElementById("patientsList");
  list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';

  try {
    const q = query(collection(db, "users"), where("role", "==", "patient"));
    const snap = await getDocs(q);
    const patients = [];
    
    snap.forEach(d => {
      const p = d.data();
      if (p.isAdmitted && p.admittedDepartment === nurseData.department) patients.push(p);
    });

    if (patients.length === 0) {
      list.innerHTML = '<p class="text-sm text-gray-400">No admitted patients in your department.</p>';
      return;
    }

    list.innerHTML = patients.map(p => {
      const latestVital = (p.vitals || []).slice(-1)[0];
      return `
        <div class="border border-gray-100 rounded-xl p-4">
          <div class="flex justify-between items-start flex-wrap gap-2">
            <div>
              <p class="font-semibold text-sm">${p.name}</p>
              <p class="text-xs text-gray-500">ID: ${p.healthId} · Room: <b>${p.room}</b></p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">${p.bedStatus || "stable"}</span>
          </div>
          ${latestVital ? `<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs"><div class="bg-slate-100 rounded-lg p-2 text-center">❤️ ${latestVital.bp}</div><div class="bg-slate-100 rounded-lg p-2 text-center">💓 ${latestVital.pulse}</div><div class="bg-slate-100 rounded-lg p-2 text-center">🌡️ ${latestVital.temp || "—"}°C</div><div class="bg-slate-100 rounded-lg p-2 text-center">🫁 ${latestVital.spo2}%</div></div>` : '<p class="text-xs text-gray-400 mt-2">No vitals logged yet</p>'}
        </div>
      `;
    }).join("");
  } catch (e) { list.innerHTML = `<p class="text-sm text-red-500">Error: ${e.message}</p>`; }
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});
