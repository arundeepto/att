// js/hospital.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, arrayUnion, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// TABS
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");

    if (btn.dataset.tab === "nursecalls") loadNurseCalls();
    if (btn.dataset.tab === "admitted") loadAdmitted();
  });
});

let currentUser = null;
let hospitalData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=hospital"; return; }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    hospitalData = snap.data();
    document.getElementById("hospitalName").innerText = hospitalData.name || "Hospital";
  }
  loadBedStats();
});

// ===== BED STATS =====
async function loadBedStats() {
  const q = query(collection(db, "users"), where("role", "==", "patient"));
  const snap = await getDocs(q);
  let totalBeds = 40; // ডেমো: ২০ বেড + ২০ কেবিন
  let occupied = 0;
  
  const grid = document.getElementById("bedGrid");
  grid.innerHTML = "";

  snap.forEach(d => {
    const p = d.data();
    if (p.isAdmitted) occupied++;
  });

  document.getElementById("statBeds").innerText = totalBeds;
  document.getElementById("statAvailable").innerText = totalBeds - occupied;
  document.getElementById("statCalls").innerText = 0;
  document.getElementById("statRevenue").innerText = "৳0";

  // Bed Grid (ডেমো ভিজুয়াল)
  for(let i=1; i<=12; i++) {
    const isOcc = i <= occupied;
    const cls = isOcc ? "bg-blue-50 border-l-4 border-blue-400" : "bg-green-50 border-l-4 border-green-400";
    grid.innerHTML += `
      <div class="${cls} p-3 rounded-xl">
        <div class="flex justify-between">
          <p class="font-bold text-sm">Bed ${i}</p>
          <span class="text-[10px] font-medium uppercase">${isOcc ? 'Occupied' : 'Free'}</span>
        </div>
      </div>
    `;
  }
}

// ===== ASSIGN BED (Admit Patient) =====
document.getElementById("assignBedBtn").addEventListener("click", async () => {
  const hid = document.getElementById("bedPatientId").value.trim();
  const dept = document.getElementById("bedDept").value;
  const room = document.getElementById("bedNumber").value.trim();
  const status = document.getElementById("bedStatus").value;
  const msg = document.getElementById("bedMsg");

  if (!hid || !room) { msg.innerText = "❌ Enter Patient ID and Bed Number"; return; }
  msg.innerText = "Admitting...";

  try {
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);
    if (snap.empty) { msg.innerText = "❌ Patient not found"; return; }

    // 🌟 রোগীর ডকুমেন্টে ডিপার্টমেন্ট, রুম এবং isAdmitted: true সেট করা
    await updateDoc(doc(db, "users", snap.docs[0].id), {
      isAdmitted: true,
      admittedDepartment: dept,
      room: room,
      bedStatus: status
    });

    msg.innerText = `✅ Admitted to ${dept} (${room})`;
    document.getElementById("bedPatientId").value = "";
    document.getElementById("bedNumber").value = "";
    loadBedStats();
    setTimeout(() => msg.innerText = "", 3000);

  } catch (e) { msg.innerText = "❌ " + e.message; }
});

// ===== ADMITTED LIST =====
async function loadAdmitted() {
  const list = document.getElementById("admittedList");
  list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';

  const q = query(collection(db, "users"), where("role", "==", "patient"));
  const snap = await getDocs(q);
  const admitted = [];
  
  snap.forEach(d => {
    const p = d.data();
    if (p.isAdmitted) admitted.push({ ...p, uid: d.id });
  });

  if (admitted.length === 0) {
    list.innerHTML = '<p class="text-sm text-gray-400">No patients admitted.</p>';
    return;
  }

  list.innerHTML = admitted.map(p => `
    <div class="border border-gray-200 rounded-xl p-3 flex justify-between items-center">
      <div>
        <p class="font-semibold text-sm">${p.name}</p>
        <p class="text-xs text-gray-500">${p.healthId} · Room: ${p.room}</p>
        <p class="text-xs text-blue-600 font-medium">${p.admittedDepartment}</p>
      </div>
      <button class="dischargeBtn bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium" data-uid="${p.uid}">Discharge</button>
    </div>
  `).join("");

  document.querySelectorAll(".dischargeBtn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const uid = e.currentTarget.dataset.uid;
      await updateDoc(doc(db, "users", uid), {
        isAdmitted: false, admittedDepartment: "", room: "", bedStatus: "available"
      });
      loadAdmitted();
      loadBedStats();
    });
  });
}

// ===== NURSE CALLS =====
async function loadNurseCalls() {
  const list = document.getElementById("callsList");
  list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';

  const q = query(collection(db, "users"), where("role", "==", "patient"));
  const snap = await getDocs(q);
  const calls = [];
  
  snap.forEach(d => {
    const p = d.data();
    (p.nurseCalls || []).forEach(c => {
      if (c.status === "pending" || c.status === "critical") {
        calls.push({ ...c, patientUid: d.id });
      }
    });
  });

  document.getElementById("statCalls").innerText = calls.length;

  if (calls.length === 0) {
    list.innerHTML = '<div class="text-center py-8"><p class="text-sm text-gray-500">No active calls</p></div>';
    return;
  }

  list.innerHTML = calls.map(c => `
    <div class="${c.type === "emergency" ? "bg-red-50 border-red-200 emergency-pulse" : "bg-yellow-50 border-yellow-200"} border rounded-xl p-4">
      <div class="flex justify-between items-start flex-wrap gap-2">
        <div>
          <p class="font-bold text-sm">${c.type === "emergency" ? "🚨 SOS" : "🔔 Call"} · ${c.patientName}</p>
          <p class="text-xs text-gray-600 mt-1">Room: ${c.room} · Dept: ${c.department}</p>
        </div>
      </div>
    </div>
  `).join("");
}

document.getElementById("refreshCallsBtn").addEventListener("click", loadNurseCalls);

// ===== TREATMENT & BILLING (আগের মতোই) =====
document.getElementById("trSaveBtn").addEventListener("click", async () => {
  const hid = document.getElementById("trPatientId").value.trim();
  const type = document.getElementById("trType").value.trim();
  const dept = document.getElementById("trDept").value.trim();
  const cost = Number(document.getElementById("trCost").value) || 0;
  const notes = document.getElementById("trNotes").value.trim();
  const status = document.getElementById("trStatus");

  if (!hid || !type) { status.innerText = "❌ Fill required fields"; return; }
  status.innerText = "Saving...";

  try {
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);
    if (snap.empty) { status.innerText = "❌ Patient not found"; return; }

    await updateDoc(doc(db, "users", snap.docs[0].id), {
      treatments: arrayUnion({
        name: type, department: dept, cost, notes,
        hospital: hospitalData.name, date: new Date().toISOString().split("T")[0]
      })
    });
    status.innerText = "✅ Treatment saved";
    setTimeout(() => status.innerText = "", 3000);
  } catch (e) { status.innerText = "❌ " + e.message; }
});

document.getElementById("billBtn").addEventListener("click", async () => {
  const hid = document.getElementById("billPatientId").value.trim();
  const amount = Number(document.getElementById("billAmount").value);
  const purpose = document.getElementById("billPurpose").value.trim();
  const status = document.getElementById("billStatus");

  if (!hid || !amount || !purpose) { status.innerText = "❌ Fill all fields"; return; }
  status.innerText = "Processing...";

  try {
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);
    if (snap.empty) { status.innerText = "❌ Patient not found"; return; }

    await updateDoc(doc(db, "users", snap.docs[0].id), {
      payments: arrayUnion({
        amount, purpose, hospital: hospitalData.name,
        date: new Date().toISOString(), status: "paid"
      })
    });
    status.innerText = `✅ Paid ৳${amount}`;
    document.getElementById("statRevenue").innerText = "৳" + amount;
    setTimeout(() => status.innerText = "", 3000);
  } catch (e) { status.innerText = "❌ " + e.message; }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});
