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
let doctorData = null;
let activeChatPatientId = null;
let unsubscribeChat = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=doctor"; return; }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    doctorData = snap.data();
    if (document.getElementById("doctorName")) document.getElementById("doctorName").innerText = "Dr. " + (doctorData.name || "");
    if (document.getElementById("doctorDept")) {
      document.getElementById("doctorDept").innerText = doctorData.department || "General";
      document.getElementById("doctorDept").classList.remove("hidden");
    }
  }
  loadChatPatients(); 
});

// ===== SEARCH =====
document.getElementById("searchBtn")?.addEventListener("click", async () => {
  const id = document.getElementById("searchId").value.trim();
  const status = document.getElementById("searchStatus");
  const result = document.getElementById("patientResult");
  if (!id) return alert("Enter Health ID");
  
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
            <p class="text-xs text-gray-500">ID: ${p.healthId} · Age: ${p.age || "—"} · ${p.gender || "—"}</p>
            <p class="text-xs text-gray-500">Blood: ${p.bloodGroup || "—"}</p>
          </div>
          <button data-uid="${uid}" data-name="${p.name}" data-hid="${p.healthId}" class="usePatientBtn bg-[#006a4e] text-white text-xs px-3 py-2 rounded-lg font-medium">✍️ Prescribe</button>
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
});

// ===== QR SCANNER =====
let html5QrcodeScanner = null;
document.getElementById("scanQrBtn")?.addEventListener("click", () => {
  const readerDiv = document.getElementById("reader");
  readerDiv.classList.toggle("hidden");

  if (!readerDiv.classList.contains("hidden")) {
    if (!html5QrcodeScanner) {
      html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
      html5QrcodeScanner.render(
        (decodedText) => {
          html5QrcodeScanner.clear();
          html5QrcodeScanner = null;
          readerDiv.classList.add("hidden");
          document.getElementById("searchId").value = decodedText;
          document.getElementById("searchBtn").click();
        },
        (error) => {}
      );
    }
  } else {
    if (html5QrcodeScanner) { html5QrcodeScanner.clear(); html5QrcodeScanner = null; }
  }
});

// ===== CHAT =====
async function loadChatPatients() {
  const list = document.getElementById("chatList");
  if (!list) return;
  
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "patient")));
  if (snap.empty) { list.innerHTML = '<p class="text-sm text-gray-400">No patients.</p>'; return; }

  list.innerHTML = snap.docs.map(d => {
    const p = d.data();
    return `
      <div class="border border-gray-200 rounded-xl p-3 flex justify-between items-center mb-2 cursor-pointer hover:bg-gray-50" onclick="startChat('${d.id}', '${p.name}')">
        <div>
          <p class="font-semibold text-sm">${p.name}</p>
          <p class="text-xs text-gray-500">${p.healthId}</p>
        </div>
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
        await setDoc(doc(db, "chats", chatRoomId), { messages: [{ senderId: currentUser.uid, text: text, timestamp: new Date().toISOString() }] });
      }
    });
  } catch (e) { console.error(e); }
});

// ===== PRESCRIPTION =====
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

// ===== PRINT =====
document.getElementById("rxPrintBtn")?.addEventListener("click", () => {
  const patientName = document.getElementById("rxPatientName").value.trim() || "—";
  const patientId = document.getElementById("rxPatientId").value.trim() || "—";
  const date = document.getElementById("rxDate").value || "—";
  const diagnosis = document.getElementById("rxDiagnosis").value.trim() || "—";
  const meds = document.getElementById("rxMeds").value.trim();
  const notes = document.getElementById("rxNotes").value.trim();

  if (!patientName || !diagnosis || !meds) return alert("Please fill Patient ID, Name, Diagnosis and Medications before printing");

  document.getElementById("printDate").innerText = date;
  document.getElementById("printPatientName").innerText = patientName;
  document.getElementById("printPatientId").innerText = patientId;
  document.getElementById("printDiagnosis").innerText = diagnosis;
  document.getElementById("printNotes").innerText = notes || "No additional notes";
  document.getElementById("printDoctorName").innerText = "Dr. " + (doctorData.name || "—");
  document.getElementById("printDoctorBmdc").innerText = doctorData.bmdcId ? "BMDC: " + doctorData.bmdcId : "";

  const tbody = document.getElementById("printMedTable");
  const medsList = meds.split("\n").filter(Boolean);
  tbody.innerHTML = medsList.map((line) => {
    const [name, dosage, frequency, duration] = line.split("|").map(s => s.trim());
    return `<tr><td style="padding: 8px; border: 1px solid #cbd5e1;">${name || "—"}</td><td style="padding: 8px; border: 1px solid #cbd5e1;">${dosage || "—"}</td><td style="padding: 8px; border: 1px solid #cbd5e1;">${frequency || "—"}</td><td style="padding: 8px; border: 1px solid #cbd5e1;">${duration || "—"}</td></tr>`;
  }).join("");

  document.getElementById("printArea").classList.remove("hidden");
  document.getElementById("printArea").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => window.print(), 500);
});

document.getElementById("rxClearBtn")?.addEventListener("click", () => {
  ["rxPatientId", "rxPatientName", "rxDiagnosis", "rxMeds", "rxNotes"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("rxDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("rxStatus").innerText = "";
  document.getElementById("printArea").classList.add("hidden");
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});
