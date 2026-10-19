// js/ai-scanner.js
import { auth, db, GROQ_API_KEY, GROQ_ENDPOINT } from "./firebase-config.js";
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
// AI EXTRACT (Groq Vision)
// =========================================================
scanBtn?.addEventListener("click", async () => {
  if (!base64Image) {
    alert("Please upload an image first");
    return;
  }
  scanBtn.disabled = true;
  if (scanStatus) {
    scanStatus.innerText = "🤖 AI analyzing prescription via Groq...";
    scanStatus.className = "text-xs text-gray-500 mt-2 text-center";
  }

  try {
    const extracted = await callGroqVision(base64Image);

    // Validate response — must have at least diagnosis or medications
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
    }
  } finally {
    scanBtn.disabled = false;
  }
});

// =========================================================
// GROQ VISION API CALL
// =========================================================
async function callGroqVision(base64) {
  const prompt = `You are a medical prescription data extractor. Analyze this prescription image and extract the information.

Return ONLY valid JSON matching this exact schema:
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
- Do NOT include patient name (the scanning user IS the patient).
- pastHistory = any PAST illnesses, diseases, surgeries mentioned in the prescription.
- drugHistory = any DRUG ALLERGIES or adverse reactions mentioned.
- If a section is not visible, return empty array [] or empty string "".
- Frequencies like "1-0-1" mean morning-noon-night.
- Output pure JSON only.`;

  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.2-90b-vision-preview", // Groq-এর সেরা Vision মডেল
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${currentMimeType};base64,${base64}`
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" } // নিশ্চিত ১০০% সঠিক JSON আউটপুট
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Groq API error response:", errText);

    if (res.status === 401) throw new Error("Invalid Groq API Key. Check firebase-config.js.");
    if (res.status === 429) throw new Error("Rate limit exceeded. Try again in a minute.");
    throw new Error(`Groq API error ${res.status}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";

  console.log("Raw AI response:", text);

  if (!text) throw new Error("Empty AI response");

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON parse error:", text);
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
// SAVE (Self / Auto Profile Name)
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

    // Firestore Update Payload (খালি array এরর রোধের জন্য)
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
