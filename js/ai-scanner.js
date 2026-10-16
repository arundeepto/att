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

// ===== UPLOAD HANDLERS =====
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", e => e.preventDefault());
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", e => {
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

// ===== AI EXTRACTION =====
scanBtn.addEventListener("click", async () => {
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

// ===== GEMINI VISION API CALL =====
async function callGeminiVision(base64) {
  const prompt = `You are a medical data extractor. Analyze this prescription image and return ONLY valid JSON with this structure:
{
  "patientName": "string",
  "date": "YYYY-MM-DD",
  "diagnosis": "string",
  "medications": [{"name":"","dosage":"","frequency":"","duration":""}],
  "doctorNotes": "string"
}
Do NOT include markdown, code blocks, or explanations. Only raw JSON.`;

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

  if (!res.ok) {
    throw new Error("Vision API error: " + res.status);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  // Robust JSON extraction
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  if (start === -1 || end === 0) throw new Error("No JSON found in response");

  return JSON.parse(text.slice(start, end));
}

// ===== FILL FORM =====
function fillForm(d) {
  document.getElementById("aiName").value = d.patientName || "";
  document.getElementById("aiDate").value = d.date || "";
  document.getElementById("aiDiagnosis").value = d.diagnosis || "";
  document.getElementById("aiMeds").value = (d.medications || [])
    .map(m => `${m.name} | ${m.dosage} | ${m.frequency} | ${m.duration}`)
    .join("\n");
  document.getElementById("aiNotes").value = d.doctorNotes || "";
}

// ===== SAVE TO FIRESTORE =====
saveBtn.addEventListener("click", async () => {
  if (!auth.currentUser) {
    alert("Please login first");
    return;
  }

  saveBtn.disabled = true;
  const statusBox = document.getElementById("saveStatus");
  statusBox.innerText = "Saving...";

  const record = {
    patientName: document.getElementById("aiName").value,
    date: document.getElementById("aiDate").value,
    diagnosis: document.getElementById("aiDiagnosis").value,
    medications: document.getElementById("aiMeds").value,
    doctorNotes: document.getElementById("aiNotes").value,
    savedAt: new Date().toISOString(),
    source: "AI Scanner"
  };

  try {
    await updateDoc(doc(db, "patients", auth.currentUser.uid), {
      medicalHistory: arrayUnion(record)
    });

    statusBox.innerText = "✅ Saved to Health Card!";

    // Refresh history
    const snap = await getDoc(doc(db, "patients", auth.currentUser.uid));
    if (snap.exists()) {
      const data = snap.data();
      const list = document.getElementById("historyList");
      const history = (data.medicalHistory || []).slice().reverse();
      list.innerHTML = history.map(r => `
        <div class="bg-blue-50 p-3 rounded-lg">
          <p class="font-semibold text-sm text-gray-700">${r.date || "—"}</p>
          <p class="text-xs text-gray-600 mt-1"><b>Diagnosis:</b> ${r.diagnosis || "—"}</p>
          <p class="text-xs text-teal-700 mt-1"><b>Meds:</b> ${r.medications || "—"}</p>
        </div>
      `).join("");
    }
  } catch (e) {
    statusBox.innerText = "❌ " + e.message;
  } finally {
    saveBtn.disabled = false;
    setTimeout(() => statusBox.innerText = "", 4000);
  }
});
