// js/ai-scanner.js
import { auth, db, GEMINI_API_KEY } from "./firebase-config.js"; // OPENROUTER_API_KEY এর জায়গায় GEMINI_API_KEY ইমপোর্ট করুন
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
    const extracted = await callGeminiAPI(base64Image);

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
// GEMINI API CALL (Official REST API)
// =========================================================
async function callGeminiAPI(base64) {
  // নিশ্চিত করুন firebase-config.js ফাইলে GEMINI_API_KEY এক্সপোর্ট করা আছে
  if (!window.GEMINI_API_KEY && typeof GEMINI_API_KEY === 'undefined') {
    throw new Error("Gemini API Key is missing");
  }
  const apiKey = typeof GEMINI_API_KEY !== 'undefined' ? GEMINI_API_KEY : window.GEMINI_API_KEY;

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
- Return ONLY raw JSON. No markdown formatting or code blocks.`;

  // Gemini 2.5 Flash বা 1.5 Flash মডেল ব্যবহার করা হলো
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || "Failed to fetch from Gemini API");
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error("Empty response from AI");

  // ক্লিন করার জন্য যদি Markdown কোড ব্লক (```json ... ```) থাকে তা সরিয়ে ফেলা
  let cleanText = text.trim();
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```(json)?/, "").replace(/```$/, "").trim();
  }

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const start = cleanText.indexOf("{");
    const end = cleanText.lastIndexOf("}") + 1;
    if (start !== -1 && end > start) {
      return JSON.parse(cleanText.slice(start, end));
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
