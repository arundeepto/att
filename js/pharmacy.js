// js/pharmacy.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, arrayUnion,
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =========================================================
// TABS
// =========================================================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");

    if (btn.dataset.tab === "history") loadHistory();
  });
});

// =========================================================
// AUTH
// =========================================================
let currentUser = null;
let pharmacyData = null;
let scanPatient = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=pharmacy"; return; }
  currentUser = user;

  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    pharmacyData = snap.data();
    if (pharmacyData.role !== "pharmacy") {
      alert("Access denied. Pharmacy portal only.");
      window.location.href = "index.html";
      return;
    }
    document.getElementById("pharmacyName").innerText = pharmacyData.name || "Pharmacy";
  }

  initStock();
  renderStock();
  loadStats();
});

// =========================================================
// STOCK MANAGEMENT (localStorage per pharmacy)
// =========================================================
const STOCK_KEY = "ihms_stock_" + (currentUser?.uid || "default");
let stock = [];

function initStock() {
  const saved = localStorage.getItem(STOCK_KEY);
  if (saved) {
    stock = JSON.parse(saved);
  } else {
    stock = [
      { name: "Paracetamol 500mg", qty: 500, price: 1 },
      { name: "Amoxicillin 500mg", qty: 200, price: 8 },
      { name: "Azithromycin 500mg", qty: 80, price: 25 },
      { name: "Metformin 850mg", qty: 150, price: 6 },
      { name: "Omeprazole 20mg", qty: 300, price: 5 },
      { name: "Cetirizine 10mg", qty: 400, price: 2 }
    ];
    localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
  }
}

function saveStock() {
  localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
  renderStock();
  loadStats();
  fillDatalist();
}

function renderStock() {
  const tbody = document.getElementById("stockTable");
  if (!tbody) return;

  tbody.innerHTML = stock.map((m, i) => {
    const low = m.qty < 50;
    return `
      <tr class="border-b border-gray-50">
        <td class="p-2 font-medium">${m.name}</td>
        <td class="p-2">${m.qty}</td>
        <td class="p-2">৳${m.price}</td>
        <td class="p-2">
          <span class="text-[10px] px-2 py-1 rounded-full ${low ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}">
            ${low ? "Low" : "OK"}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

function fillDatalist() {
  const dl = document.getElementById("stockList");
  if (!dl) return;
  dl.innerHTML = stock.map(m => `<option value="${m.name}">`).join("");
}

function loadStats() {
  document.getElementById("statTotalMeds").innerText = stock.length;
  document.getElementById("statLowStock").innerText = stock.filter(m => m.qty < 50).length;
  // Load dispense stats from localStorage
  const hist = JSON.parse(localStorage.getItem("ihms_dispense_" + currentUser.uid) || "[]");
  const today = new Date().toISOString().split("T")[0];
  const todayHist = hist.filter(h => h.date.startsWith(today));
  document.getElementById("statDispensed").innerText = todayHist.length;
  document.getElementById("statRevenue").innerText =
    "৳" + todayHist.reduce((sum, h) => sum + (h.total || 0), 0);
}

// =========================================================
// SCAN PATIENT
// =========================================================
document.getElementById("scanBtn").addEventListener("click", scanPatientById);
document.getElementById("scanHealthId").addEventListener("keypress", (e) => {
  if (e.key === "Enter") scanPatientById();
});

async function scanPatientById() {
  const hid = document.getElementById("scanHealthId").value.trim();
  const status = document.getElementById("scanStatus");
  const result = document.getElementById("scanResult");

  if (!hid) { alert("Enter Health ID"); return; }

  status.innerText = "🔎 Searching...";
  result.classList.add("hidden");

  try {
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);

    if (snap.empty) {
      status.innerText = "❌ Patient not found";
      return;
    }

    scanPatient = snap.docs[0].data();
    status.innerText = "✅ Patient found";
    result.classList.remove("hidden");

    // Latest prescriptions
    const latestRx = (scanPatient.medicalHistory || []).slice(-1)[0];

    result.innerHTML = `
      <div class="bg-green-50 border border-green-100 rounded-2xl p-4">
        <div class="flex justify-between items-start mb-3">
          <div>
            <p class="font-bold text-gray-800">${scanPatient.name}</p>
            <p class="text-xs text-gray-500 font-mono">${scanPatient.healthId}</p>
          </div>
          <span class="text-xs bg-green-500 text-white px-2 py-1 rounded-full">Verified</span>
        </div>

        <div class="text-xs text-gray-600 space-y-1">
          <p>👤 ${scanPatient.age}y · ${scanPatient.gender} · Blood ${scanPatient.bloodGroup}</p>
          <p>📞 ${scanPatient.phone || "No phone"}</p>
          <p>⚠️ Chronic: ${(scanPatient.chronicDiseases || []).join(", ") || "None"}</p>
        </div>

        <div class="mt-4 bg-white rounded-xl p-3 border border-gray-100">
          <p class="text-xs font-semibold text-gray-700 mb-2">📋 Latest Prescription</p>
          ${latestRx ? `
            <p class="text-xs text-gray-600">${latestRx.date} · ${latestRx.doctor || ""}</p>
            <p class="text-xs text-[#006a4e] mt-1 whitespace-pre-line">${latestRx.medications || "—"}</p>
          ` : '<p class="text-xs text-gray-400">No prescriptions</p>'}
        </div>

        <button id="usePatientBtn" class="mt-3 w-full bg-[#006a4e] text-white py-2.5 rounded-xl text-sm font-medium">
          💊 Use for Dispensing
        </button>
      </div>
    `;

    // Pre-fill dispense form
    document.getElementById("usePatientBtn").addEventListener("click", () => {
      document.getElementById("dispHealthId").value = scanPatient.healthId;
      document.getElementById("dispPrescribed").innerHTML = latestRx
        ? `<p class="font-medium text-gray-700 mb-1">${latestRx.date}</p><p class="whitespace-pre-line">${latestRx.medications || "—"}</p>`
        : '<p class="text-gray-400">No prescriptions</p>';
      document.querySelector('[data-tab="dispense"]').click();
    });

  } catch (e) {
    status.innerText = "❌ " + e.message;
  }
}

// =========================================================
// DISPENSE
// =========================================================
document.getElementById("dispSaveBtn").addEventListener("click", async () => {
  const hid = document.getElementById("dispHealthId").value.trim();
  const medName = document.getElementById("dispMedName").value.trim();
  const qty = Number(document.getElementById("dispQty").value);
  const price = Number(document.getElementById("dispPrice").value);
  const status = document.getElementById("dispStatus");

  if (!hid || !medName || !qty || !price) {
    status.innerText = "❌ Fill all fields";
    return;
  }

  status.innerText = "Processing...";

  try {
    // Find patient
    const q = query(collection(db, "users"), where("healthId", "==", hid));
    const snap = await getDocs(q);
    if (snap.empty) { status.innerText = "❌ Patient not found"; return; }

    const patientUid = snap.docs[0].id;

    const dispenseRecord = {
      medicine: medName,
      quantity: qty,
      unitPrice: price,
      total: qty * price,
      pharmacy: pharmacyData.name || "IHMS Pharmacy",
      date: new Date().toISOString()
    };

    // 1. Save to patient's Firestore
    await updateDoc(doc(db, "users", patientUid), {
      dispensedMeds: arrayUnion(dispenseRecord)
    });

    // 2. Save to pharmacy local history
    const histKey = "ihms_dispense_" + currentUser.uid;
    const hist = JSON.parse(localStorage.getItem(histKey) || "[]");
    hist.push({ ...dispenseRecord, patientName: snap.docs[0].data().name, patientId: hid });
    localStorage.setItem(histKey, JSON.stringify(hist));

    // 3. Deduct from stock
    const stockItem = stock.find(s => s.name.toLowerCase() === medName.toLowerCase());
    if (stockItem) {
      stockItem.qty = Math.max(0, stockItem.qty - qty);
      saveStock();
    }

    status.innerText = `✅ Dispensed ${qty}× ${medName} — ৳${qty * price}`;
    loadStats();

    // Clear
    document.getElementById("dispMedName").value = "";
    document.getElementById("dispQty").value = "";
    document.getElementById("dispPrice").value = "";
    setTimeout(() => status.innerText = "", 4000);

  } catch (e) {
    status.innerText = "❌ " + e.message;
  }
});

// =========================================================
// HISTORY
// =========================================================
function loadHistory() {
  const list = document.getElementById("historyList");
  const histKey = "ihms_dispense_" + currentUser.uid;
  const hist = JSON.parse(localStorage.getItem(histKey) || "[]");

  if (hist.length === 0) {
    list.innerHTML = '<p class="text-gray-400">No records yet</p>';
    return;
  }

  list.innerHTML = hist.reverse().map(h => `
    <div class="bg-slate-50 rounded-xl p-3 flex justify-between items-start">
      <div>
        <p class="font-semibold text-sm">${h.medicine} × ${h.quantity}</p>
        <p class="text-xs text-gray-500 mt-0.5">${h.patientName} (${h.patientId})</p>
        <p class="text-[10px] text-gray-400 mt-0.5">${new Date(h.date).toLocaleString()}</p>
      </div>
      <p class="font-bold text-[#006a4e]">৳${h.total}</p>
    </div>
  `).join("");
}

// =========================================================
// ADD MEDICINE MODAL
// =========================================================
const modal = document.getElementById("addMedModal");

document.getElementById("addMedBtn").addEventListener("click", () => {
  modal.classList.remove("hidden");
});

document.getElementById("modalCancel").addEventListener("click", () => {
  modal.classList.add("hidden");
});

document.getElementById("modalSave").addEventListener("click", () => {
  const name = document.getElementById("newMedName").value.trim();
  const qty = Number(document.getElementById("newMedStock").value);
  const price = Number(document.getElementById("newMedPrice").value);

  if (!name || !qty || !price) { alert("Fill all fields"); return; }

  stock.push({ name, qty, price });
  saveStock();
  fillDatalist();

  document.getElementById("newMedName").value = "";
  document.getElementById("newMedStock").value = "";
  document.getElementById("newMedPrice").value = "";
  modal.classList.add("hidden");
});

// =========================================================
// LOGOUT
// =========================================================
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
