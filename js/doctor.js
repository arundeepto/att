// js/doctor.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, arrayUnion, collection, query, where, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// TABS
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
  });
});

let currentUser = null;
let doctorData = null;
let activeChatPatientId = null;
let unsubscribeChat = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=doctor"; return; }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    doctorData = snap.data();
    document.getElementById("doctorName").innerText = "Dr. " + (doctorData.name || "");
    // ডাক্তারের ডিপার্টমেন্ট দেখানো
    const deptEl = document.getElementById("doctorDept");
    if (deptEl) deptEl.innerText = doctorData.department || "General";
  }
});

// ===== CHAT SYSTEM (ডাক্তারের পক্ষ থেকে) =====
async function loadChats() {
  // বাস্তবে এখানে ডাক্তারের কাছে যারা মেসেজ দিয়েছে তাদের লিস্ট লোড হবে
  // ডেমো হিসেবে আমরা সব পেশেন্টকে দেখাবো
  const list = document.getElementById("chatList");
  if (!list) return;
  
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "patient")));
  if (snap.empty) {
    list.innerHTML = '<p class="text-sm text-gray-400">No patients to chat with.</p>';
    return;
  }

  list.innerHTML = snap.docs.map(d => {
    const p = d.data();
    return `
      <div class="border border-gray-200 rounded-xl p-3 flex justify-between items-center mb-2 cursor-pointer hover:bg-gray-50" onclick="startChat('${d.id}', '${p.name}')">
        <div>
          <p class="font-semibold text-sm">${p.name}</p>
          <p class="text-xs text-gray-500">${p.healthId}</p>
        </div>
        <span class="text-blue-500 text-xs font-medium">💬 Open Chat</span>
      </div>
    `;
  }).join("");
}

window.startChat = (patientId, patientName) => {
  document.querySelector('[data-tab="chat"]').click();
  activeChatPatientId = patientId;
  document.getElementById("chatInput").disabled = false;
  document.getElementById("chatSendBtn").disabled = false;
  document.getElementById("chatHeader").innerText = `Chat with ${patientName}`;
  
  if (unsubscribeChat) unsubscribeChat();

  const chatRoomId = [currentUser.uid, patientId].sort().join("_");
  
  unsubscribeChat = onSnapshot(doc(db, "chats", chatRoomId), (docSnap) => {
    const box = document.getElementById("chatMessages");
    if (docSnap.exists()) {
      const msgs = docSnap.data().messages || [];
      box.innerHTML = msgs.map(m => `
        <div class="flex ${m.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[75%] px-3 py-2 rounded-xl text-sm ${m.senderId === currentUser.uid ? 'bg-[#006a4e] text-white' : 'bg-white border text-gray-800'}">
            ${m.text}
          </div>
        </div>
      `).join("");
      box.scrollTop = box.scrollHeight;
    } else {
      box.innerHTML = `<p class="text-center text-xs text-gray-400">No messages yet.</p>`;
    }
  });
};

document.getElementById("chatSendBtn")?.addEventListener("click", async () => {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text || !activeChatPatientId) return;
  input.value = "";
  const chatRoomId = [currentUser.uid, activeChatPatientId].sort().join("_");
  
  try {
    await updateDoc(doc(db, "chats", chatRoomId), {
      messages: arrayUnion({ senderId: currentUser.uid, text: text, timestamp: new Date().toISOString() })
    }).catch(async (e) => {
      if (e.code === 'not-found') {
        const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await setDoc(doc(db, "chats", chatRoomId), {
          messages: [{ senderId: currentUser.uid, text: text, timestamp: new Date().toISOString() }]
        });
      }
    });
  } catch (e) { console.error(e); }
});

// ===== PRESCRIPTION WRITING (আগের মতোই) =====
document.getElementById("rxSaveBtn")?.addEventListener("click", async () => {
  const hid = document.getElementById("rxPatientId").value.trim();
  const date = document.getElementById("rxDate").value;
  const diagnosis = document.getElementById("rxDiagnosis").value.trim();
  const meds = document.getElementById("rxMeds").value.trim();
  const notes = document.getElementById("rxNotes").value.trim();
  const status = document.getElementById("rxStatus");

  if (!hid || !date || !diagnosis || !meds) { status.innerText = "❌ Fill all required fields"; return; }
  status.innerText = "Saving...";

  try {
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);
    if (snap.empty) { status.innerText = "❌ Patient not found"; return; }

    const record = {
      patientName: document.getElementById("rxPatientName").value,
      date, doctor: "Dr. " + doctorData.name, doctorId: currentUser.uid,
      diagnosis, medications: meds, doctorNotes: notes,
      savedAt: new Date().toISOString(), source: "Doctor Portal"
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
  } catch (e) { status.innerText = "❌ " + e.message; }
});

// Initial load
setTimeout(() => loadChats(), 1500);

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});
