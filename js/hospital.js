// js/hospital.js

// ===== DEMO BED DATA =====
const beds = [
  { id: "101", patient: "Rahul Verma", status: "stable", bp: "118/76", pulse: 82, temp: 37.1, spo2: 98 },
  { id: "102", patient: "S. Nair", status: "critical", bp: "90/60", pulse: 110, temp: 38.9, spo2: 89 },
  { id: "103", patient: "M. Kaur", status: "observation", bp: "130/85", pulse: 92, temp: 37.8, spo2: 94 },
  { id: "104", patient: "A. Joshi", status: "stable", bp: "118/78", pulse: 76, temp: 36.9, spo2: 97 },
  { id: "105", patient: "P. Singh", status: "stable", bp: "122/80", pulse: 80, temp: 37.0, spo2: 98 },
  { id: "106", patient: "K. Roy", status: "observation", bp: "135/88", pulse: 95, temp: 37.5, spo2: 93 }
];

const statusMap = {
  stable: { cls: "bed-stable", label: "Stable", color: "text-green-700" },
  observation: { cls: "bed-observation", label: "Observation", color: "text-yellow-700" },
  critical: { cls: "bed-critical", label: "Critical", color: "text-red-700" }
};

// ===== RENDER BED GRID =====
function renderBeds() {
  const grid = document.getElementById("bedGrid");
  if (!grid) return;

  grid.innerHTML = beds.map(b => {
    const s = statusMap[b.status];
    return `
      <div class="bed-card ${s.cls}">
        <div class="flex justify-between items-start">
          <p class="font-bold text-sm">Bed ${b.id}</p>
          <span class="text-[10px] font-semibold ${s.color}">${s.label}</span>
        </div>
        <p class="text-xs text-gray-700 mt-1 font-medium">${b.patient}</p>
        <p class="text-[11px] text-gray-600 mt-1">BP ${b.bp} · SpO₂ ${b.spo2}%</p>
        <p class="text-[11px] text-gray-600">Pulse ${b.pulse} · ${b.temp}°C</p>
      </div>
    `;
  }).join("");

  // Update nurse dropdown
  const sel = document.getElementById("nurseBed");
  if (sel) {
    sel.innerHTML = beds.map(b =>
      `<option value="${b.id}">${b.patient} (Bed ${b.id})</option>`
    ).join("");
  }
}

// ===== LOG VITALS =====
document.getElementById("logVitalsBtn")?.addEventListener("click", () => {
  const bedId = document.getElementById("nurseBed").value;
  const bed = beds.find(b => b.id === bedId);
  if (!bed) return;

  const bp = document.getElementById("vBP").value.trim();
  const pulse = document.getElementById("vPulse").value.trim();
  const temp = document.getElementById("vTemp").value.trim();
  const spo2 = document.getElementById("vSpo2").value.trim();
  const status = document.getElementById("vStatus").value;

  if (bp) bed.bp = bp;
  if (pulse) bed.pulse = Number(pulse);
  if (temp) bed.temp = Number(temp);
  if (spo2) bed.spo2 = Number(spo2);
  bed.status = status;

  renderBeds();

  const msg = document.getElementById("vitalsMsg");
  msg.innerText = `✅ ${bed.patient}'s vitals updated!`;

  // Clear inputs
  document.getElementById("vBP").value = "";
  document.getElementById("vPulse").value = "";
  document.getElementById("vTemp").value = "";
  document.getElementById("vSpo2").value = "";

  setTimeout(() => msg.innerText = "", 3000);
});

// ===== INIT =====
renderBeds();
