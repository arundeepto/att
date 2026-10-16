// js/authority.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =========================================================
// AUTH
// =========================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html?role=authority"; return; }

  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists() && snap.data().role !== "authority") {
    alert("Access denied. Authority portal only.");
    window.location.href = "index.html";
    return;
  }

  loadAllData();
});

// =========================================================
// LOAD EVERYTHING
// =========================================================
async function loadAllData() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const allUsers = [];
    usersSnap.forEach(d => allUsers.push(d.data()));

    // Role counts
    const roles = { patient: 0, doctor: 0, hospital: 0, nurse: 0, pharmacy: 0, authority: 0 };
    allUsers.forEach(u => { roles[u.role] = (roles[u.role] || 0) + 1; });

    document.getElementById("statPatients").innerText = roles.patient;
    document.getElementById("statDoctors").innerText = roles.doctor;
    document.getElementById("statHospitals").innerText = roles.hospital;
    document.getElementById("statPharmacies").innerText = roles.pharmacy;

    // Tax revenue (sum of all dispensed meds + treatments)
    let totalRevenue = 0;
    allUsers.forEach(u => {
      if (u.role === "patient") {
        (u.dispensedMeds || []).forEach(d => totalRevenue += (d.total || 0));
        (u.treatments || []).forEach(t => totalRevenue += (t.cost || 0));
        (u.payments || []).forEach(p => totalRevenue += (p.amount || 0));
      }
    });
    // Tax = 15% of total
    const tax = Math.round(totalRevenue * 0.15);
    document.getElementById("taxRevenue").innerText = "৳" + tax.toLocaleString();

    // AI Scans today
    const today = new Date().toISOString().split("T")[0];
    let aiScansToday = 0;
    let refsToday = 0;
    let activeCallsCount = 0;

    allUsers.forEach(u => {
      if (u.role === "patient") {
        (u.medicalHistory || []).forEach(r => {
          if (r.source === "AI Scanner" && r.savedAt?.startsWith(today)) aiScansToday++;
        });
        (u.referrals || []).forEach(r => {
          if (r.date?.startsWith(today)) refsToday++;
        });
        (u.nurseCalls || []).forEach(c => {
          if (c.status === "pending" || c.status === "critical") activeCallsCount++;
        });
      }
    });

    document.getElementById("aiScansToday").innerText = aiScansToday;
    document.getElementById("activeCalls").innerText = activeCallsCount;
    document.getElementById("refsToday").innerText = refsToday;

    // BMDC verified doctors
    const verifiedDoctors = allUsers.filter(u => u.role === "doctor" && u.bmdcId);
    document.getElementById("verifiedDoctors").innerText = verifiedDoctors.length;

    // Role breakdown
    const roleLabels = { patient: "👤 Patients", doctor: "🩺 Doctors", hospital: "🏥 Hospitals", nurse: "👩‍⚕️ Nurses", pharmacy: "💊 Pharmacies", authority: "🏛️ Authority" };
    document.getElementById("roleBreakdown").innerHTML = Object.entries(roles).map(([k, v]) => `
      <div class="bg-slate-50 rounded-xl p-3 text-center">
        <p class="text-2xl font-bold text-[#006a4e]">${v}</p>
        <p class="text-xs text-gray-600 mt-1">${roleLabels[k]}</p>
      </div>
    `).join("");

    // Top diagnoses
    const diagnosisCount = {};
    allUsers.forEach(u => {
      if (u.role === "patient") {
        (u.medicalHistory || []).forEach(r => {
          if (r.diagnosis) {
            diagnosisCount[r.diagnosis] = (diagnosisCount[r.diagnosis] || 0) + 1;
          }
        });
      }
    });

    const topDiagnoses = Object.entries(diagnosisCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topDiagnoses.length === 0) {
      document.getElementById("diseaseList").innerHTML = '<p class="text-gray-400">No diagnosis data yet</p>';
    } else {
      const max = topDiagnoses[0][1];
      document.getElementById("diseaseList").innerHTML = topDiagnoses.map(([name, count]) => {
        const pct = Math.round((count / max) * 100);
        return `
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="font-medium text-gray-700">${name}</span>
              <span class="text-gray-500">${count} cases</span>
            </div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-[#006a4e] to-[#00875a] rounded-full" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join("");
    }

    // BMDC list
    if (verifiedDoctors.length === 0) {
      document.getElementById("bmdcList").innerHTML = '<p class="text-gray-400">No verified doctors yet</p>';
    } else {
      document.getElementById("bmdcList").innerHTML = verifiedDoctors.map(d => `
        <div class="flex justify-between items-center bg-slate-50 rounded-xl p-3">
          <div>
            <p class="font-medium text-sm">Dr. ${d.name}</p>
            <p class="text-xs text-gray-500 font-mono">BMDC: ${d.bmdcId}</p>
          </div>
          <span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">✅ Verified</span>
        </div>
      `).join("");
    }

  } catch (e) {
    console.error("Authority load error:", e);
    alert("Error loading data: " + e.message);
  }
}

// =========================================================
// LOGOUT
// =========================================================
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
