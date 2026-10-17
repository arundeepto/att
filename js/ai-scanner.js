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

// =========================================================
// UPLOAD HANDLERS
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
// AI EXTRACTION
// =========================================================
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
    fillForm({
      patientName: "Demo Patient",
      date: new Date().toISOString().split("T")[0],
      doctorName: "Dr. A. Rahman",
      diagnosis: "Acute pharyngitis",
      medications: [
        { name: "Amoxicillin", dosage: "500mg", frequency: "1-0-1", duration: "5 days" }
      ],
      doctorNotes: "Warm water gargle, rest, follow-up if fever persists."
    });
  } finally {
    scanBtn.disabled = false;
  }
});

// =========================================================
// GEMINI VISION API CALL
// =========================================================
async function callGeminiVision(base64) {
  const prompt = `You are a medical prescription data extractor for a Bangladeshi hospital system.
Analyze this prescription image and return ONLY valid JSON with this exact structure:
{
  "patientName": "string",
  "date": "YYYY-MM-DD",
  "doctorName": "string",
  "diagnosis": "string",
  "medications": [{"name":"","dosage":"","frequency":"","duration":""}],
  "doctorNotes": "string"
}
Do NOT include markdown, code blocks, or explanations. Only raw JSON.
If any field is not visible, use empty string "".`;

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/jpeg", data: base64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || "Vision API error status: " + res.status);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  if (start === -1 || end === 0) throw new Error("No JSON found in response");

  return JSON.parse(text.slice(start, end));
}

// =========================================================
// FILL FORM
// =========================================================
function fillForm(d) {
  document.getElementById("aiName").value = d.patientName || "";
  document.getElementById("aiDate").value = d.date || "";
  document.getElementById("aiDoctor").value = d.doctorName || "";
  document.getElementById("aiDiagnosis").value = d.diagnosis || "";
  document.getElementById("aiMeds").value = (d.medications || [])
    .map(m => `${m.name} | ${m.dosage} | ${m.frequency} | ${m.duration}`)
    .join("\n");
  document.getElementById("aiNotes").value = d.doctorNotes || "";
}

// =========================================================
// SAVE TO FIRESTORE
// =========================================================
saveBtn?.addEventListener("click", async () => {
  if (!auth.currentUser) {
    alert("Please login first");
    return;
  }

  saveBtn.disabled = true;
  const statusBox = document.getElementById("saveStatus");
  statusBox.innerText = "Saving...";

  const medsText = document.getElementById("aiMeds").value;

  const record = {
    patientName: document.getElementById("aiName").value,
    date: document.getElementById("aiDate").value,
    doctor: document.getElementById("aiDoctor").value, // ঠিক করা হয়েছে
    diagnosis: document.getElementById("aiDiagnosis").value,
    medications: medsText,
    doctorNotes: document.getElementById("aiNotes").value,
    savedAt: new Date().toISOString(),
    source: "AI Scanner"
  };

  // Parse medications into structured array for reminder
  const parsedMeds = medsText.split("\n").filter(Boolean).map(line => {
    const [name, dosage, frequency, duration] = line.split("|").map(s => s.trim());
    return { name, dosage, frequency, duration, taken: false };
  });

  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      medicalHistory: arrayUnion(record),
      medications: arrayUnion(...parsedMeds)
    });

    statusBox.innerText = "✅ Saved to Health Card!";

    // Reload page data after 1s
    setTimeout(() => {
      window.location.reload();
    }, 1200);

  } catch (e) {
    statusBox.innerText = "❌ " + e.message;
    saveBtn.disabled.value = false; // ঠিক করা হয়েছে
    saveBtn.disabled = false;
  }
});
