// js/ai-scanner.js
import * as cfg from "./firebase-config.js";
const { auth, db } = cfg;
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
  if (file.size > 15 * 1024 * 1024) {
    alert("Max file size 15MB");
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      // ছবি ছোট করা হয় (সর্বোচ্চ 2000px) — API-র size limit এড়াতে
      const MAX = 2000;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.9);
      currentMimeType = "image/jpeg";
      base64Image = dataUrl.split(",")[1];
      if (previewImg) previewImg.src = dataUrl;
      if (previewBox) previewBox.classList.remove("hidden");
      if (scanStatus) scanStatus.innerText = "✅ Image ready";
    };
    img.onerror = () => alert("Could not read this image");
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
// VISION API CALL — Firebase AI Logic (Gemini)
// কোডে কোনো Gemini API key নেই, তাই GitHub-এ দিলেও key delete হবে না
// =========================================================
const SDK_VERSIONS = ["12.0.0", "11.10.0"];
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];

const PROMPT = `You are an expert at reading medical prescriptions (printed and handwritten, English and Bengali). Read the image very carefully, zoom into every line, and extract the information.

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

RULES:
- Do NOT include patient name.
- Copy drug names and strengths EXACTLY as written (e.g. "Tab. Napa 500 mg"). Never replace them with a different drug.
- If a word or number is unclear, write your best reading followed by (?). NEVER invent or guess a dose.
- pastHistory = PAST illnesses, diseases, surgeries mentioned in the prescription.
- drugHistory = DRUG ALLERGIES or adverse reactions mentioned.
- If a section is not visible, return empty array [] or empty string "".
- Frequencies like "1-0-1" mean morning-noon-night. Keep the original form.
- Dates: convert to YYYY-MM-DD. If no date is visible, return "".`;

let _mods = null;
let _ai = null;

async function loadAiModules() {
  if (_mods) return _mods;
  let lastErr;
  for (const v of SDK_VERSIONS) {
    try {
      const base = `https://www.gstatic.com/firebasejs/${v}/`;
      const [appMod, aiMod] = await Promise.all([
        import(base + "firebase-app.js"),
        import(base + "firebase-ai.js")
      ]);
      _mods = { appMod, aiMod };
      return _mods;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Firebase AI library load হয়নি: " + (lastErr?.message || lastErr));
}

async function getAiInstance() {
  if (_ai) return _ai;
  const { appMod, aiMod } = await loadAiModules();
  const opts = cfg.firebaseConfig || cfg.app?.options;
  if (!opts) {
    throw new Error("firebase-config.js থেকে firebaseConfig export করা নেই। `const firebaseConfig` এর সামনে `export` বসাও।");
  }
  let app;
  try { app = appMod.getApp("ai-scanner"); }
  catch (_) { app = appMod.initializeApp(opts, "ai-scanner"); }
  _ai = aiMod.getAI(app, { backend: new aiMod.GoogleAIBackend() });
  return _ai;
}

async function callGeminiVision(base64) {
  const ai = await getAiInstance();
  const { aiMod } = await loadAiModules();
  const attempts = [];

  for (const model of MODELS) {
    try {
      const m = aiMod.getGenerativeModel(ai, {
        model,
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          responseMimeType: "application/json"
        }
      });
      const result = await m.generateContent([
        PROMPT,
        { inlineData: { mimeType: currentMimeType, data: base64 } }
      ]);
      const text = result.response.text();
      console.log("Gemini OK with", model, text);
      return parseJsonText(text);
    } catch (e) {
      const msg = String(e?.message || e).replace(/\s+/g, " ").slice(0, 160);
      console.error("Gemini error:", model, e);
      attempts.push(`${model}: ${msg}`);
      if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) break;
    }
  }

  throw new Error(
    "AI call failed:\n" + attempts.join("\n") +
    "\n\n👉 Firebase console → AI Logic → Get started (Gemini Developer API) চালু আছে কি না দেখো।"
  );
}

function parseJsonText(raw) {
  let text = (raw || "").trim();
  if (!text) throw new Error("Empty AI response");
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end)); } catch (_) { /* fall through */ }
    }
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
