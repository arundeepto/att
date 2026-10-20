// js/nurse.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, arrayUnion, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// ===== LOAD CALLS (শুধু নিজের ডিপার্টমেন্টের) =====
async function loadCalls() {
  const list = document.getElementById("callsList");
  list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';

  try {
    const q = query(collection(db, "users"), where("role", "==", "patient"));
    const snap = await getDocs(q);

    const calls = [];
    snap.forEach(d => {
      const p = d.data();
      // 🌟 ফিল্টার: শুধু নিজের ডিপার্টমেন্টের কল দেখবে
      if (p.admittedDepartment === nurseData.department) {
        (p.nurseCalls || []).forEach(c => {
          if (c.status === "pending" || c.status === "critical") {
            calls.push({ ...c, patientUid: d.id });
          }
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

// ===== ADD TREATMENT (নার্সের প্যানেল থেকে) =====
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

    const treatment = {
      name: tname,
      date: new Date().toISOString().split("T")[0],
      department: nurseData.department,
      by: nurseData.name
    };

    await updateDoc(doc(db, "users", snap.docs[0].id), {
      treatments: arrayUnion(treatment)
    });
    status.innerText = "✅ Treatment added!";
    document.getElementById("tPatientId").value = "";
    document.getElementById("tName").value = "";
    setTimeout(() => status.innerText = "", 3000);
  } catch (e) { status.innerText = "❌ " + e.message; }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});
