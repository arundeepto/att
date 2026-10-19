// js/ai-scanner.js
import { auth, db, OPENROUTER_API_KEY } from "./firebase-config.js";
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
// UPLOAD & AUTO COMPRESS
// =========================================================
dropZone?.addEventListener("click", () => fileInput?.click());
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

  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      const maxDim = 1000;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
      if (previewImg) previewImg.src = resizedDataUrl;
      if (previewBox) previewBox.classList.remove("hidden");

      base64Image = resizedDataUrl.split(",")[1];
      if (scanStatus) {
        scanStatus.innerText = "✅ Image ready for scanning";
        scanStatus.className = "text-xs text-green-600 mt-2 text-center";
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// =========================================================
// AI EXTRACT
// =========================================================
scanBtn?.addEventListener("click", async () => {
  if (!base64Image) {
    alert("Please upload an image first");
    return;
  }
  scanBtn.disabled = true;
  if (scanStatus) {
    scanStatus.innerText = "🤖 AI scanning prescription...";
    scanStatus.className = "text-xs text-gray-500 mt-2 text-center";
  }

  try {
    const extracted = await callOpenRouterAPI(base64Image);

    fillForm(extracted);
    if (scanStatus) {
      scanStatus.innerText = "✅ Extraction complete!";
      scanStatus.className = "text-xs text-green-600 mt-2 text-center font-medium";
    }
  } catch (err) {
    console.error("Scanning Error:", err);
    if (scanStatus) {
      scanStatus.innerText = "❌ " + (err.message || "Failed to scan");
      scanStatus.className = "text-xs text-red-600 mt-2 text-center";
    }
  } finally {
    scanBtn.disabled = false;
  }
});

// =========================================================
// OPENROUTER API CALL (Vision)
// =========================================================
async function callOpenRouterAPI(base64) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API Key is missing");
  }

  const prompt = `You are a medical prescription data extractor. Analyze this prescription image and extract the information.

Return ONLY valid JSON matching this exact structure:
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
- Do NOT include patient name.
- If a section is not visible, return empty array [] or empty string "".
- Return ONLY raw JSON. No markdown.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY.trim()}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "Medical Prescription Scanner",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5", 
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64}`
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || "Failed to fetch from OpenRouter");
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) throw new Error("Empty response from AI");

  try {
    return JSON.parse(text);
  } catch (e) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end));
    }
    throw new Error("Failed to parse JSON response");
  }
}

// =========================================================
// FILL FORM
// =========================================================
function fillForm(d) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };

  setVal("aiDate", d.date || new Date().toISOString().split("T")[0]);
  setVal("aiDoctor", d.doctorName);
  setVal("aiDiagnosis", d.diagnosis);

  const medsText = (d.medications || [])
    .map(m => `${m.name || ""} | ${m.dosage || ""} | ${m.frequency || ""} | ${m.duration || ""}`)
    .join("\n");
  setVal("aiMeds", medsText);

  const pastText = (d.pastHistory || [])
    .map(p => `${p.condition || ""} | ${p.year || ""} | ${p.notes || ""}`)
    .join("\n");
  setVal("aiPastHistory", pastText);

  const drugText = (d.drugHistory || [])
    .map(x => `${x.drug || ""} | ${x.reaction || ""} | ${x.severity || ""}`)
    .join("\n");
  setVal("aiDrugHistory", drugText);

  setVal("aiNotes", d.doctorNotes);
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
  if (statusBox) statusBox.innerText = "Saving...";

  try {
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (!userSnap.exists()) throw new Error("Profile not found");
    const patientProfile = userSnap.data();

    const medsText = document.getElementById("aiMeds")?.value || "";
    const pastText = document.getElementById("aiPastHistory")?.value || "";
    const drugText = document.getElementById("aiDrugHistory")?.value || "";
    const diagText = document.getElementById("aiDiagnosis")?.value || "";

    if (!medsText.trim() && !diagText.trim()) {
      if (statusBox) statusBox.innerText = "❌ Nothing to save — extract first";
      saveBtn.disabled = false;
      return;
    }

    const record = {
      patientName: patientProfile.name || "Patient",
      patientId: patientProfile.healthId || auth.currentUser.uid,
      date: document.getElementById("aiDate")?.value || new Date().toISOString().split("T")[0],
      doctor: document.getElementById("aiDoctor")?.value || "Unknown",
      diagnosis: diagText,
      medications: medsText,
      doctorNotes: document.getElementById("aiNotes")?.value || "",
      savedAt: new Date().toISOString(),
      source: "AI Scanner (Self)"
    };

    const parsedMeds = medsText.split("\n").filter(line => line.trim()).map(line => {
      const [name, dosage, frequency, duration] = line.split("|").map(s => s ? s.trim() : "");
      return { name: name || "", dosage: dosage || "", frequency: frequency || "", duration: duration || "", taken: false };
    });

    const parsedPast = pastText.split("\n").filter(line => line.trim()).map(line => {
      const [condition, year, notes] = line.split("|").map(s => s ? s.trim() : "");
      return { condition: condition || "", year: year || "", notes: notes || "", addedAt: new Date().toISOString() };
    });

    const parsedDrug = drugText.split("\n").filter(line => line.trim()).map(line => {
      const [drug, reaction, severity] = line.split("|").map(s => s ? s.trim() : "");
      return { drug: drug || "", reaction: reaction || "", severity: severity || "", addedAt: new Date().toISOString() };
    });

    const updatePayload = {
      medicalHistory: arrayUnion(record)
    };

    if (parsedMeds.length > 0) updatePayload.medications = arrayUnion(...parsedMeds);
    if (parsedPast.length > 0) updatePayload.pastHistory = arrayUnion(...parsedPast);
    if (parsedDrug.length > 0) updatePayload.drugHistory = arrayUnion(...parsedDrug);

    await updateDoc(doc(db, "users", auth.currentUser.uid), updatePayload);

    if (statusBox) {
      statusBox.innerText = "✅ Saved to your health card!";
      statusBox.className = "text-xs text-green-700 mt-2 text-center font-medium";
    }
    setTimeout(() => window.location.reload(), 1200);

  } catch (e) {
    if (statusBox) {
      statusBox.innerText = "❌ " + e.message;
      statusBox.className = "text-xs text-red-600 mt-2 text-center";
    }
    saveBtn.disabled = false;
  }
});
