// js/ai-scanner.js
import { auth, db, GEMINI_API_KEY } from "./firebase-config.js";
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
  if (file.size > 5 * 1024 * 1024) {
    alert("Max file size 5MB");
    return;
  }
  currentMimeType = file.type;
  const reader = new FileReader();
  reader.onload = ev => {
    if (previewImg) previewImg.src = ev.target.result;
    if (previewBox) previewBox.classList.remove("hidden");
    base64Image = ev.target.result.split(",")[1];
    if (scanStatus) scanStatus.innerText = "✅ Image ready";
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
    scanStatus.innerText = "🤖 AI analyzing prescription...";
    scanStatus.className = "text-xs text-gray-500 mt-2 text-center";
  }

  try {
    const extracted = await callGeminiVision(base64Image);

    if (!extracted.diagnosis && (!extracted.medications || extracted.medications.length === 0)) {
      throw new Error("AI could not read prescription. Please try a clearer image.");
    }

    fillForm(extracted);
    if (scanStatus) {
      scanStatus.innerText = "✅ Extraction complete!";
      scanStatus.className = "text-xs text-green-600 mt-2 text-center font-medium";
    }
  } catch (err) {
    console.error("AI error:", err);
    if (scanStatus) {
      scanStatus.innerText = "❌ " + (err.message || "Failed to read prescription");
      scanStatus.className = "text-xs text-red-600 mt-2 text-center";
      scanStatus.style.whiteSpace = "pre-wrap";
      scanStatus.style.wordBreak = "break-word";
    }
  } finally {
    scanBtn.disabled = false;
  }
});

// =========================================================
// GEMINI VISION API CALL
// =========================================================
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
// একটা না চললে পরেরটা নিজে থেকেই চেষ্টা করবে
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];

async function callGeminiVision(base64) {
  const prompt = `You are a medical prescription data extractor. Analyze this prescription image and extract the information.

Return JSON with this EXACT structure:
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
- pastHistory = any PAST illnesses, diseases, surgeries mentioned in the prescription.
- drugHistory = any DRUG ALLERGIES or adverse reactions mentioned.
- If a section is not visible, return empty array [] or empty string "".
- Frequencies like "1-0-1" mean morning-noon-night.`;

  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: currentMimeType, data: base64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json"
    }
  });

  const attempts = [];

  for (const model of MODELS) {
    for (const mode of ["header", "query"]) {
      const url = `${API_BASE}${model}:generateContent` +
        (mode === "query" ? `?key=${encodeURIComponent(GEMINI_API_KEY)}` : "");
      const headers = { "Content-Type": "application/json" };
      if (mode === "header") headers["x-goog-api-key"] = GEMINI_API_KEY;

      let res;
      try {
        res = await fetch(url, { method: "POST", headers, body });
      } catch (netErr) {
        attempts.push(`${model}: network error (internet/CORS)`);
        break; // পরের model চেষ্টা করো
      }

      if (res.ok) {
        console.log("Gemini OK with", model, mode);
        return parseGeminiResponse(await res.json());
      }

      const info = await readApiError(res);
      console.error("Gemini error:", model, mode, info);
      attempts.push(`${model} (${mode}): ${info}`);

      if (res.status === 429) throw new Error("Too many requests. Please wait 1 minute.");
      // 401/403 হলে অন্য auth পদ্ধতি চেষ্টা করবে; 400/404 হলে সরাসরি পরের model
      if (res.status !== 401 && res.status !== 403) break;
    }
  }

  const all401 = attempts.length && attempts.every(a => a.includes(": 401") || a.includes(": 403"));
  const hint = all401
    ? "\n\n👉 API key রিজেক্ট হচ্ছে। AI Studio-তে নতুন project দিয়ে নতুন key বানাও।"
    : "";
  throw new Error("AI call failed:\n" + attempts.join("\n") + hint);
}

async function readApiError(res) {
  const raw = await res.text();
  try {
    const e = JSON.parse(raw).error || {};
    const reason = (e.details || []).find(d => d.reason)?.reason || "";
    return `${res.status} ${e.status || ""} ${reason} ${(e.message || "").slice(0, 100)}`
      .replace(/\s+/g, " ").trim();
  } catch (_) {
    return `${res.status} ${raw.slice(0, 120)}`;
  }
}

function parseGeminiResponse(data) {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const reason = data?.promptFeedback?.blockReason;
    throw new Error(reason ? `Request blocked: ${reason}` : "Empty AI response");
  }

  const text = (candidate.content?.parts || [])
    .filter(p => !p.thought && typeof p.text === "string")
    .map(p => p.text)
    .join("")
    .trim();

  console.log("Raw AI response:", text, "| finishReason:", candidate.finishReason);
  if (!text) throw new Error("Empty AI response");

  try {
    return JSON.parse(text);
  } catch (e) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end)); } catch (_) { /* fall through */ }
    }
    if (candidate.finishReason === "MAX_TOKENS") throw new Error("AI response was cut off. Try again.");
    throw new Error("AI returned malformed data. Try again.");
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
// SAVE
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

    // খালি array থাকলে arrayUnion crash করে, তাই শর্ত দিয়ে যোগ করা হয়েছে
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
    console.error("Save error:", e);
    if (statusBox) {
      statusBox.innerText = "❌ " + e.message;
      statusBox.className = "text-xs text-red-600 mt-2 text-center";
    }
    saveBtn.disabled = false;
  }
});
