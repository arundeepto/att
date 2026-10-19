// js/ai-scanner.js
import { auth, db, GEMINI_API_KEY, GEMINI_ENDPOINT } from "./firebase-config.js";
import {
  doc, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const previewBox = document.getElementById("previewBox");
const previewImg = document.getElementById("previewImg");
const scanBtn = document.getElementById("scanBtn");
const saveBtn = document.getElementById("saveBtn");
const scanStatus = document.getElementById("scanStatus");

let base64Image = null;
let currentMimeType = "image/jpeg";

// UPLOAD
dropZone?.addEventListener("click", () => fileInput.click());
dropZone?.addEventListener("dragover", e => e.preventDefault());
dropZone?.addEventListener("drop", e => {
  e.preventDefault();
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput?.addEventListener("change", e => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("Only image files allowed");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("Max file size 5MB");
    return;
  }
  currentMimeType = file.type;
  const reader = new FileReader();
  reader.onload = ev => {
    previewImg.src = ev.target.result;
    previewBox.classList.remove("hidden");
    base64Image = ev.target.result.split(",")[1];
    scanStatus.innerText = "✅ Image ready";
  };
  reader.readAsDataURL(file);
}

// AI EXTRACT
scanBtn?.addEventListener("click", async () => {
  if (!base64Image) {
    alert("Please upload an image first");
    return;
  }
  scanBtn.disabled = true;
  scanStatus.innerText = "🤖 AI analyzing prescription...";
  try {
    const extracted = await callGeminiVision(base64Image);
    fillForm(extracted);
    scanStatus.innerText = "✅ Extraction complete!";
  } catch (err) {
    console.error("AI error:", err);
    scanStatus.innerText = "⚠️ Using demo data (API error)";
    fillForm(getDemoData());
  } finally {
    scanBtn.disabled = false;
  }
});

async function callGeminiVision(base64) {
  const prompt = `You are a medical prescription data extractor for a Bangladeshi hospital system.
Analyze this prescription image and extract ALL information, including past medical history and drug history mentioned in the prescription.

Return ONLY valid JSON with this EXACT structure:
{
  "patientName": "string",
  "date": "YYYY-MM-DD",
  "doctorName": "string",
  "diagnosis": "string",
  "medications": [{"name":"","dosage":"","frequency":"","duration":""}],
  "pastHistory": [{"condition":"", "year":"", "notes":""}],
  "drugHistory": [{"drug":"", "reaction":"", "severity":""}],
  "doctorNotes": "string"
}

Rules:
- pastHistory = any PAST illnesses/diseases/surgeries mentioned
- drugHistory = any DRUG ALLERGIES or previous adverse reactions
- If a section is empty, return an empty array []
- Do NOT include markdown, code blocks, or explanations. Only raw JSON.`;

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: currentMimeType, data: base64 } }
        ]
      }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  if (start === -1 || end === 0) throw new Error("No JSON found");
  return JSON.parse(text.slice(start, end));
}

function getDemoData() {
  return {
    patientName: "Demo Patient",
    date: new Date().toISOString().split("T")[0],
    doctorName: "Dr. A. Rahman",
    diagnosis: "Acute pharyngitis",
    medications: [{ name: "Amoxicillin", dosage: "500mg", frequency: "1-0-1", duration: "5 days" }],
    pastHistory: [{ condition: "Hypertension", year: "2020", notes: "On medication" }],
    drugHistory: [{ drug: "Penicillin", reaction: "Skin rash", severity: "Moderate" }],
    doctorNotes: "Warm water gargle, rest."
  };
}

function fillForm(d) {
  document.getElementById("aiName").value = d.patientName || "";
  document.getElementById("aiDate").value = d.date || "";
  document.getElementById("aiDoctor").value = d.doctorName || "";
  document.getElementById("aiDiagnosis").value = d.diagnosis || "";
  document.getElementById("aiMeds").value = (d.medications || [])
    .map(m => `${m.name} | ${m.dosage} | ${m.frequency} | ${m.duration}`).join("\n");

  const pastEl = document.getElementById("aiPastHistory");
  if (pastEl) {
    pastEl.value = (d.pastHistory || [])
      .map(p => `${p.condition} | ${p.year || ""} | ${p.notes || ""}`).join("\n");
  }
  const drugEl = document.getElementById("aiDrugHistory");
  if (drugEl) {
    drugEl.value = (d.drugHistory || [])
      .map(x => `${x.drug} | ${x.reaction} | ${x.severity || ""}`).join("\n");
  }
  document.getElementById("aiNotes").value = d.doctorNotes || "";
}

// SAVE
saveBtn?.addEventListener("click", async () => {
  if (!auth.currentUser) {
    alert("Please login first");
    return;
  }
  saveBtn.disabled = true;
  const statusBox = document.getElementById("saveStatus");
  statusBox.innerText = "Saving...";

  const medsText = document.getElementById("aiMeds").value;
  const pastText = document.getElementById("aiPastHistory")?.value || "";
  const drugText = document.getElementById("aiDrugHistory")?.value || "";

  const record = {
    patientName: document.getElementById("aiName").value,
    date: document.getElementById("aiDate").value,
    doctor: document.getElementById("aiDoctor").value,
    diagnosis: document.getElementById("aiDiagnosis").value,
    medications: medsText,
    doctorNotes: document.getElementById("aiNotes").value,
    savedAt: new Date().toISOString(),
    source: "AI Scanner"
  };

  const parsedMeds = medsText.split("\n").filter(Boolean).map(line => {
    const [name, dosage, frequency, duration] = line.split("|").map(s => s.trim());
    return { name, dosage, frequency, duration, taken: false };
  });

  const parsedPast = pastText.split("\n").filter(Boolean).map(line => {
    const [condition, year, notes] = line.split("|").map(s => s.trim());
    return { condition, year, notes, addedAt: new Date().toISOString() };
  });

  const parsedDrug = drugText.split("\n").filter(Boolean).map(line => {
    const [drug, reaction, severity] = line.split("|").map(s => s.trim());
    return { drug, reaction, severity, addedAt: new Date().toISOString() };
  });

  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      medicalHistory: arrayUnion(record),
      medications: arrayUnion(...parsedMeds),
      pastHistory: arrayUnion(...parsedPast),
      drugHistory: arrayUnion(...parsedDrug)
    });
    statusBox.innerText = "✅ Saved with Past + Drug History!";
    setTimeout(() => window.location.reload(), 1200);
  } catch (e) {
    statusBox.innerText = "❌ " + e.message;
    saveBtn.disabled = false;
  }
});
