// js/ai-scanner.js
import { auth, db, GEMINI_API_KEY, GEMINI_ENDPOINT } from "./firebase-config.js";
import {
  doc, updateDoc, arrayUnion, getDoc
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

// =========================================================
// UPLOAD
// =========================================================
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

// =========================================================
// AI EXTRACT (NO patient name — logged-in patient uses own)
// =========================================================
scanBtn?.addEventListener("click", async () => {
  if (!base64Image) {
    alert("Please upload an image first");
    return;
  }
  scanBtn.disabled = true;
  scanStatus.innerText = "🤖 AI analyzing prescription...";
  scanStatus.className = "text-xs text-gray-500 mt-2 text-center";

  try {
    const extracted = await callGeminiVision(base64Image);

    // Validate response — must have at least diagnosis or medications
    if (!extracted.diagnosis && (!extracted.medications || extracted.medications.length === 0)) {
      throw new Error("AI could not read prescription. Please try a clearer image.");
    }

    fillForm(extracted);
    scanStatus.innerText = "✅ Extraction complete!";
    scanStatus.className = "text-xs text-green-600 mt-2 text-center font-medium";
  } catch (err) {
    console.error("AI error:", err);
    scanStatus.innerText = "❌ " + (err.message || "Failed to read prescription");
    scanStatus.className = "text-xs text-red-600 mt-2 text-center";
    // NO fallback demo — show error clearly
  } finally {
    scanBtn.disabled = false;
  }
});

// =========================================================
// GEMINI VISION API CALL — No patient name
// =========================================================
async function callGeminiVision(base64) {
  const prompt = `You are a medical prescription data extractor. Analyze this prescription image and extract the information.

Return ONLY valid JSON with this EXACT structure:
{
  "date": "YYYY-MM-DD",
  "doctorName": "string",
  "diagnosis": "string",
  "medications": [
    {"name":"","dosage":"","frequency":"","duration":""}
  ],
  "pastHistory": [
    {"condition":"", "year":"", "notes":""}
  ],
  "drugHistory": [
    {"drug":"", "reaction":"", "severity":""}
  ],
  "doctorNotes": "string"
}

IMPORTANT:
- Do NOT include patient name (the scanning user IS the patient)
- pastHistory = any PAST illnesses, diseases, surgeries mentioned in the prescription
- drugHistory = any DRUG ALLERGIES or adverse reactions mentioned
- If a section is not visible, return empty array [] or empty string ""
- Frequencies like "1-0-1" mean morning-noon-night
- Return ONLY raw JSON. No markdown, no explanations, no code blocks.`;

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: currentMimeType, data: base64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini API error response:", errText);

    if (res.status === 400) throw new Error("Image unclear or invalid. Please try a better photo.");
    if (res.status === 403) throw new Error("API key invalid or restricted. Check Firebase config.");
    if (res.status === 404) throw new Error("AI model not found. Check endpoint URL.");
    if (res.status === 429) throw new Error("Too many requests. Please wait 1 minute.");
    throw new Error(`API error ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  console.log("Raw AI response:", text);

  if (!text) throw new Error("Empty AI response");

  // Robust JSON extraction
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  if (start === -1 || end === 0) {
    console.error("No JSON in response:", text);
    throw new Error("AI did not return valid JSON. Try again.");
  }

  const jsonStr = text.slice(start, end);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("JSON parse error:", jsonStr);
    throw new Error("AI returned malformed data. Try again.");
  }
}

// =========================================================
// FILL FORM (no patient name)
// =========================================================
function fillForm(d) {
  document.getElementById("aiDate").value = d.date || new Date().toISOString().split("T")[0];
  document.getElementById("aiDoctor").value = d.doctorName || "";
  document.getElementById("aiDiagnosis").value = d.diagnosis || "";
  document.getElementById("aiMeds").value = (d.medications || [])
    .map(m => `${m.name} | ${m.dosage} | ${m.frequency} | ${m.duration}`)
    .join("\n");

  const pastEl = document.getElementById("aiPastHistory");
  if (pastEl) {
    pastEl.value = (d.pastHistory || [])
      .map(p => `${p.condition} | ${p.year || ""} | ${p.notes || ""}`)
      .join("\n");
  }

  const drugEl = document.getElementById("aiDrugHistory");
  if (drugEl) {
    drugEl.value = (d.drugHistory || [])
      .map(x => `${x.drug} | ${x.reaction} | ${x.severity || ""}`)
      .join("\n");
  }

  document.getElementById("aiNotes").value = d.doctorNotes || "";
}

// =========================================================
// SAVE — auto-uses logged-in user's name
// =========================================================
saveBtn?.addEventListener("click", async () => {
  if (!auth.currentUser) {
    alert("Please login first");
    return;
  }

  saveBtn.disabled = true;
  const statusBox = document.getElementById("saveStatus");
  statusBox.innerText = "Saving...";

  try {
    // Get patient's own name from their profile
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (!userSnap.exists()) throw new Error("Profile not found");
    const patientProfile = userSnap.data();

    const medsText = document.getElementById("aiMeds").value;
    const pastText = document.getElementById("aiPastHistory")?.value || "";
    const drugText = document.getElementById("aiDrugHistory")?.value || "";

    if (!medsText.trim() && !document.getElementById("aiDiagnosis").value.trim()) {
      statusBox.innerText = "❌ Nothing to save — extract first";
      saveBtn.disabled = false;
      return;
    }

    const record = {
      patientName: patientProfile.name,           // ← auto from profile
      patientId: patientProfile.healthId,          // ← auto from profile
      date: document.getElementById("aiDate").value,
      doctor: document.getElementById("aiDoctor").value || "Unknown",
      diagnosis: document.getElementById("aiDiagnosis").value,
      medications: medsText,
      doctorNotes: document.getElementById("aiNotes").value,
      savedAt: new Date().toISOString(),
      source: "AI Scanner (Self)"
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

    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      medicalHistory: arrayUnion(record),
      medications: arrayUnion(...parsedMeds),
      pastHistory: arrayUnion(...parsedPast),
      drugHistory: arrayUnion(...parsedDrug)
    });

    statusBox.innerText = "✅ Saved to your health card!";
    statusBox.className = "text-xs text-green-700 mt-2 text-center font-medium";
    setTimeout(() => window.location.reload(), 1200);

  } catch (e) {
    statusBox.innerText = "❌ " + e.message;
    statusBox.className = "text-xs text-red-600 mt-2 text-center";
    saveBtn.disabled = false;
  }
});
