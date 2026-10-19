// js/ai-scanner.js
import { auth, db } from "./firebase-config.js";
import { doc, updateDoc, arrayUnion, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const previewBox = document.getElementById("previewBox");
const previewImg = document.getElementById("previewImg");
const scanBtn = document.getElementById("scanBtn");
const saveBtn = document.getElementById("saveBtn");
const scanStatus = document.getElementById("scanStatus");

let base64Image = null;
let currentMimeType = "image/jpeg";

// 🔧 এখানে তোমার নতুন Gemini API Key বসাও
const GEMINI_API_KEY = "AQ.Ab8RN6IoY1DWyjA6IZgz47GcnYHJ65DPD5F5RXLSouYEhXZvvA"; 

// 1. IMAGE UPLOAD
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
  if (!file.type.startsWith("image/")) return alert("Only image files allowed");
  if (file.size > 5 * 1024 * 1024) return alert("Max file size 5MB");
  
  currentMimeType = file.type;
  const reader = new FileReader();
  reader.onload = ev => {
    previewImg.src = ev.target.result;
    previewBox.classList.remove("hidden");
    base64Image = ev.target.result.split(",")[1];
    scanStatus.innerText = "✅ Image ready";
    scanStatus.className = "text-xs text-green-600 mt-2 text-center font-medium";
  };
  reader.readAsDataURL(file);
}

// 2. AI EXTRACT (Official Google SDK with Dynamic Model)
scanBtn?.addEventListener("click", async () => {
  if (!base64Image) return alert("Upload an image first");
  
  scanBtn.disabled = true;
  scanStatus.innerText = "🤖 AI analyzing... (5-10 sec)";
  scanStatus.className = "text-xs text-blue-600 mt-2 text-center font-medium";

  try {
    const { GoogleGenerativeAI } = await import("https://esm.sh/@google/generative-ai");
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    
    // 🌟 গুগলের নতুন ও সাপোর্টেড মডেল (১.৫ বন্ধ হয়ে গেছে)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are a medical prescription reader.
Extract information from this image and return ONLY valid JSON in this exact format:
{
  "date": "YYYY-MM-DD",
  "doctorName": "string",
  "diagnosis": "string",
  "medications": [{"name":"","dosage":"","frequency":"","duration":""}],
  "pastHistory": [{"condition":"", "year":"", "notes":""}],
  "drugHistory": [{"drug":"", "reaction":"", "severity":""}],
  "doctorNotes": "string"
}
Do not include patient name. Return ONLY the JSON object.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Image, mimeType: currentMimeType } }
    ]);

    const text = result.response.text();
    console.log("Raw Response:", text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI returned invalid format.");
    
    const extracted = JSON.parse(jsonMatch[0]);

    // ফর্ম ফিল করা
    document.getElementById("aiDate").value = extracted.date || new Date().toISOString().split("T")[0];
    document.getElementById("aiDoctor").value = extracted.doctorName || "";
    document.getElementById("aiDiagnosis").value = extracted.diagnosis || "";
    document.getElementById("aiMeds").value = (extracted.medications || [])
      .map(m => `${m.name} | ${m.dosage} | ${m.frequency} | ${m.duration}`).join("\n");
    
    const pastEl = document.getElementById("aiPastHistory");
    if (pastEl) pastEl.value = (extracted.pastHistory || []).map(p => `${p.condition} | ${p.year || ""} | ${p.notes || ""}`).join("\n");
    
    const drugEl = document.getElementById("aiDrugHistory");
    if (drugEl) drugEl.value = (extracted.drugHistory || []).map(x => `${x.drug} | ${x.reaction} | ${x.severity || ""}`).join("\n");

    document.getElementById("aiNotes").value = extracted.doctorNotes || "";

    scanStatus.innerText = "✅ Extraction complete!";
    scanStatus.className = "text-xs text-green-600 mt-2 text-center font-medium";

  } catch (err) {
    console.error("AI Error:", err);
    scanStatus.innerText = "❌ " + (err.message || "Check API Key and Internet");
    scanStatus.className = "text-xs text-red-600 mt-2 text-center";
  } finally {
    scanBtn.disabled = false;
  }
});

// 3. SAVE TO FIRESTORE
saveBtn?.addEventListener("click", async () => {
  if (!auth.currentUser) return alert("Login first");
  saveBtn.disabled = true;
  const statusBox = document.getElementById("saveStatus");
  statusBox.innerText = "Saving...";

  try {
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const patientProfile = userSnap.data();
    const medsText = document.getElementById("aiMeds").value;

    const record = {
      patientName: patientProfile.name,
      patientId: patientProfile.healthId,
      date: document.getElementById("aiDate").value,
      doctor: document.getElementById("aiDoctor").value || "Unknown",
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

    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      medicalHistory: arrayUnion(record),
      medications: arrayUnion(...parsedMeds)
    });
    
    statusBox.innerText = "✅ Saved!";
    statusBox.className = "text-xs text-green-700 mt-2 text-center";
    setTimeout(() => window.location.reload(), 1000);
  } catch (e) {
    statusBox.innerText = "❌ " + e.message;
    statusBox.className = "text-xs text-red-600 mt-2 text-center";
    saveBtn.disabled = false;
  }
});
