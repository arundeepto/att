// js/nurse.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, arrayUnion, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== TABS =====
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

// ===== AUTH & LOAD NURSE DATA (UID অথবা Email দিয়ে) =====
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=nurse"; return; }
  currentUser = user;

  try {
    // ১. প্রথমে UID দিয়ে খুঁজবে
    let snap = await getDoc(doc(db, "users", user.uid));
    
    // ২. যদি UID দিয়ে না পায়, তবে ইমেইল দিয়ে খুঁজবে
    if (!snap.exists()) {
      const q = query(collection(db, "users"), where("email", "==", user.email));
      const emailSnap = await getDocs(q);
      if (!emailSnap.empty) {
        snap = emailSnap.docs[0];
      }
    }

    if (snap.exists()) {
      nurseData = snap.data();
      const nameEl = document.getElementById("nurseName");
      if (nameEl) {
        nameEl.innerText = (nurseData.name || "Nurse") + " (" + (nurseData.department || "General") + ")";
      }
    } else {
      alert("❌ ডেটাবেসে আপনার প্রোফাইল পাওয়া যায়নি! ফায়ারবেসে 'email' ফিল্ড ঠিক আছে কিনা দেখুন।");
    }
  } catch (err) {
    console.error("Auth Error:", err);
  }
  
  loadCalls();
});

// ===== 1. LOAD CALLS =====
async function loadCalls() {
  const list = document.getElementById("callsList");
  if (!list) return;
  list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';

  if (!nurseData) return;

  try {
    const q = query(collection(db, "users"), where("role", "==", "patient"));
    const snap = await getDocs(q);
    const calls = [];
    
    const nurseDept = (nurseData.department || "").toLowerCase().trim();
    
    snap.forEach(d => {
      const p = d.data();
      const patientDept = (p.admittedDepartment || "").toLowerCase().trim();
      
      if (p.isAdmitted && patientDept === nurseDept) {
        (p.nurseCalls || []).forEach(c => {
          if (c.status === "pending" || c.status === "critical") {
            calls.push({ ...c, patientUid: d.id });
          }
        });
      }
    });

    if (calls.length === 0) {
      list.innerHTML = `<div class="text-center py-8"><div class="text-4xl mb-2">✅</div><p class="text-sm text-gray-500">No pending calls in ${nurseData.department || 'your department'}</p></div>`;
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

document.getElementById("refreshBtn")?.addEventListener("click", loadCalls);

// ===== 2. LOG VITALS =====
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
      vitals: arrayUnion({ 
        bp, pulse: Number(pulse), temp: temp ? Number(temp) : null, spo2: Number(spo2), notes, 
        loggedBy: nurseData.name || "Nurse", 
        department: nurseData.department || "General", 
        timestamp: new Date().toISOString() 
      })
    });

    status.innerText = "✅ Vitals saved";
    ["vPatientId", "vBP", "vPulse", "vTemp", "vSpo2", "vNotes"].forEach(id => document.getElementById(id).value = "");
    setTimeout(() => status.innerText = "", 3000);
  } catch (e) { status.innerText = "❌ " + e.message; }
});

// ===== 3. ADD TREATMENT =====
document.getElementById("addTreatBtn")?.addEventListener("click", async () => {
  const pid = document.getElementById("tPatientId").value.trim();
  const tname = document.getElementById("tName").value.trim();
  const status = document.getElementById("tStatusMsg");
  
  if (!pid || !tname) { status.innerText = "❌ Fill both fields"; return; }
  if (!nurseData) { status.innerText = "❌ Nurse data not loaded"; return; }
  
  status.innerText = "Saving...";

  try {
    let snap = await getDocs(query(collection(db, "users"), where("healthId", "==", pid)));
    
    if (snap.empty) {
      const allPatients = await getDocs(query(collection(db, "users"), where("role", "==", "patient")));
      let found = false;
      for (const docSnap of allPatients.docs) {
        const p = docSnap.data();
        if (p.name.toLowerCase().includes(pid.toLowerCase())) {
           await updateDoc(doc(db, "users", docSnap.id), {
             treatments: arrayUnion({
               name: tname, 
               date: new Date().toISOString().split("T")[0],
               department: nurseData.department || "General", 
               by: nurseData.name || "Nurse" 
             })
           });
           found = true;
           break;
        }
      }
      if (found) {
        status.innerText = "✅ Treatment added (found by name)!";
        document.getElementById("tPatientId").value = "";
        document.getElementById("tName").value = "";
        setTimeout(() => status.innerText = "", 3000);
        return;
      }
      status.innerText = "❌ Patient not found. Check ID or Name.";
      return;
    }

    await updateDoc(doc(db, "users", snap.docs[0].id), {
      treatments: arrayUnion({ 
        name: tname, 
        date: new Date().toISOString().split("T")[0], 
        department: nurseData.department || "General", 
        by: nurseData.name || "Nurse" 
      })
    });
    
    status.innerText = "✅ Treatment added!";
    document.getElementById("tPatientId").value = "";
    document.getElementById("tName").value = "";
    setTimeout(() => status.innerText = "", 3000);
  } catch (e) { status.innerText = "❌ " + e.message; }
});

// ===== 4. MY PATIENTS =====
async function loadPatients() {
  const list = document.getElementById("patientsList");
  if (!list) return;
  list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';

  if (!nurseData) return;

  try {
    const q = query(collection(db, "users"), where("role", "==", "patient"));
    const snap = await getDocs(q);
    const patients = [];
    const nurseDept = (nurseData.department || "").toLowerCase().trim();

    snap.forEach(d => {
      const p = d.data();
      const patientDept = (p.admittedDepartment || "").toLowerCase().trim();
      
      if (p.isAdmitted === true && patientDept === nurseDept) {
        patients.push(p);
      }
    });

    if (patients.length === 0) {
      list.innerHTML = `<p class="text-sm text-gray-400">No admitted patients in ${nurseData.department || 'your department'}.</p>`;
      return;
    }

    list.innerHTML = patients.map(p => {
      const latestVital = (p.vitals || []).slice(-1)[0];
      return `
        <div class="border border-gray-100 rounded-xl p-4">
          <div class="flex justify-between items-start flex-wrap gap-2">
            <div>
              <p class="font-semibold text-sm">${p.name}</p>
              <p class="text-xs text-gray-500">ID: ${p.healthId} · Room: <b>${p.room || "—"}</b></p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full ${
              p.bedStatus === "critical" ? "bg-red-100 text-red-700" :
              p.bedStatus === "observation" ? "bg-yellow-100 text-yellow-700" :
              "bg-green-100 text-green-700"
            }">${p.bedStatus || "stable"}</span>
          </div>
          ${latestVital ? `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
              <div class="bg-slate-100 rounded-lg p-2 text-center">❤️ ${latestVital.bp}</div>
              <div class="bg-slate-100 rounded-lg p-2 text-center">💓 ${latestVital.pulse}</div>
              <div class="bg-slate-100 rounded-lg p-2 text-center">🌡️ ${latestVital.temp || "—"}°C</div>
              <div class="bg-slate-100 rounded-lg p-2 text-center">🫁 ${latestVital.spo2}%</div>
            </div>
          ` : '<p class="text-xs text-gray-400 mt-2">No vitals logged yet</p>'}
        </div>
      `;
    }).join("");
  } catch (e) { list.innerHTML = `<p class="text-sm text-red-500">Error: ${e.message}</p>`; }
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});
