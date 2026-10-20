import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, arrayUnion, collection, query, where, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
let activeChatDoctorId = null;
let unsubscribeChat = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=patient"; return; }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "register.html"; return; }
  userData = snap.data();
  
  renderUI(userData);
  loadDoctors();
});

function renderUI(data) {
  // QR Code Generation
  try {
    QRCode.toCanvas(
      document.getElementById("qrCanvas"), 
      data.healthId || "IHMS-0000",
      { width: 96, margin: 1, color: { dark: "#006a4e", light: "#ffffff" } }
    );
  } catch (e) { console.error("QR Error:", e); }

  // কার্ডে ডেটা বসানো
  document.getElementById("cardPatientName").innerText = data.name || "Unknown Patient";
  document.getElementById("cardHealthId").innerText = data.healthId || "—";
  document.getElementById("cardBloodGroup").innerText = data.bloodGroup || "—";
  document.getElementById("cardAge").innerText = data.age ? data.age + " yrs" : "—";

  // SOS & Admission Logic
  const sosBtn = document.getElementById("emergencyBtn");
  const admCard = document.getElementById("admissionCard");

  if (data.isAdmitted) {
    sosBtn.classList.remove("hidden");
    admCard.classList.remove("hidden");
    document.getElementById("admDept").innerText = data.admittedDepartment || "General";
    document.getElementById("admRoom").innerText = data.room || "—";
    
    const tList = document.getElementById("treatmentList");
    if (data.treatments && data.treatments.length > 0) {
      tList.innerHTML = data.treatments.map(t => `
        <div class="bg-blue-50 p-2 rounded border border-blue-100">
          <p class="font-semibold text-blue-900">${t.name}</p>
          <p class="text-[10px] text-gray-500">${t.date} · By ${t.by || "Staff"}</p>
        </div>
      `).join("");
    }
  } else {
    sosBtn.classList.add("hidden");
    admCard.classList.add("hidden");
  }

  // Rendering History & Meds
  const fullHistory = document.getElementById("fullHistoryList");
  if (fullHistory) {
    const hist = (data.medicalHistory || []).slice().reverse();
    fullHistory.innerHTML = hist.length === 0 ? '<p class="text-sm text-gray-400">No records</p>' : hist.map(r => `
      <div class="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-2">
        <p class="font-semibold text-sm">${r.date} · ${r.doctor || "—"}</p>
        <p class="text-xs text-gray-600 mt-1">Dx: ${r.diagnosis || "—"}</p>
        <p class="text-xs text-[#006a4e] mt-1 whitespace-pre-line">${r.medications || ""}</p>
      </div>
    `).join("");
  }

  const medsList = document.getElementById("medsList");
  if (medsList) {
    const meds = data.medications || [];
    medsList.innerHTML = meds.length === 0 ? '<p class="text-sm text-gray-400">No active meds</p>' : meds.map(m => `
      <div class="p-3 border rounded-xl mb-2 flex justify-between items-center">
        <div>
          <p class="font-semibold text-sm">${m.name}</p>
          <p class="text-xs text-gray-500">${m.dosage} · ${m.frequency}</p>
        </div>
      </div>
    `).join("");
  }
}

// ===== DOWNLOAD CARD =====
document.getElementById("downloadCardBtn")?.addEventListener("click", () => {
  const card = document.getElementById("downloadCardArea");
  html2canvas(card, { scale: 2 }).then(canvas => {
    const link = document.createElement("a");
    link.download = `${userData.healthId}-Health-Card.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
});

// ===== SOS =====
document.getElementById("emergencyBtn").addEventListener("click", async () => {
  if (!confirm("🚨 Send EMERGENCY alert to nurse?")) return;
  const call = { type: "emergency", patientId: userData.healthId, patientName: userData.name, department: userData.admittedDepartment || "General", room: userData.room || "—", timestamp: new Date().toISOString(), status: "critical" };
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { nurseCalls: arrayUnion(call) });
    alert("🚨 Alert sent!");
  } catch (e) { alert("Error: " + e.message); }
});

// ===== FIND DOCTORS =====
async function loadDoctors() {
  const list = document.getElementById("doctorList");
  if(!list) return;
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "doctor")));
  if (snap.empty) { list.innerHTML = '<p class="text-sm text-gray-400">No doctors found.</p>'; return; }

  list.innerHTML = snap.docs.map(docSnap => {
    const d = docSnap.data();
    return `
      <div class="border border-gray-200 rounded-xl p-4 flex justify-between items-center">
        <div>
          <p class="font-bold text-gray-800">${d.name}</p>
          <p class="text-xs text-[#006a4e] font-medium mt-0.5">🏥 ${d.department || "General"}</p>
        </div>
        <button class="chatBtn bg-blue-50 text-blue-600 px-3 py-2 rounded-lg text-xs font-medium" data-id="${docSnap.id}" data-name="${d.name}">💬 Chat</button>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".chatBtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const b = e.currentTarget;
      startChat(b.dataset.id, b.dataset.name);
      document.querySelector('[data-tab="chat"]').click();
    });
  });
}

// ===== CHAT =====
function startChat(doctorId, doctorName) {
  activeChatDoctorId = doctorId;
  document.getElementById("chatInput").disabled = false;
  document.getElementById("chatSendBtn").disabled = false;
  if (unsubscribeChat) unsubscribeChat();

  const chatRoomId = [currentUser.uid, doctorId].sort().join("_");
  unsubscribeChat = onSnapshot(doc(db, "chats", chatRoomId), (docSnap) => {
    const box = document.getElementById("chatMessages");
    if (docSnap.exists()) {
      const msgs = docSnap.data().messages || [];
      box.innerHTML = `<p class="text-center text-xs text-gray-400 mb-2">Chat with ${doctorName}</p>` + msgs.map(m => `
        <div class="flex ${m.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[75%] px-3 py-2 rounded-xl text-sm ${m.senderId === currentUser.uid ? 'bg-[#006a4e] text-white' : 'bg-white border text-gray-800'}">
            ${m.text}
          </div>
        </div>
      `).join("");
      box.scrollTop = box.scrollHeight;
    }
  });
}

document.getElementById("chatSendBtn").addEventListener("click", async () => {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text || !activeChatDoctorId) return;
  input.value = "";
  const chatRoomId = [currentUser.uid, activeChatDoctorId].sort().join("_");
  try {
    await updateDoc(doc(db, "chats", chatRoomId), { messages: arrayUnion({ senderId: currentUser.uid, text: text, timestamp: new Date().toISOString() }) }).catch(async (e) => {
      if (e.code === 'not-found') {
        const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await setDoc(doc(db, "chats", chatRoomId), { messages: [{ senderId: currentUser.uid, text: text, timestamp: new Date().toISOString() }] });
      }
    });
  } catch (e) { console.error(e); }
});

document.getElementById("logoutBtn").addEventListener("click", async () => { await signOut(auth); window.location.href = "index.html"; });
