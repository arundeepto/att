import { auth, db, ai } from "./firebase-config.js";
import { getGenerativeModel } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-ai.js";
import { doc, updateDoc, arrayUnion, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// UI Elements
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const previewBox = document.getElementById("previewBox");
const previewImg = document.getElementById("previewImg");
const scanBtn = document.getElementById("scanBtn");
const saveBtn = document.getElementById("saveBtn");
const scanStatus = document.getElementById("scanStatus");

let base64Image = null;

// Image Upload
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
  if (!file.type.startsWith("image/")) return alert("Only images allowed");
  if (file.size > 5 * 1024 * 1024) return alert("Max 5MB");
  
  const reader = new FileReader();
  reader.onload = ev => {
    previewImg.src = ev.target.result;
    previewBox.classList.remove("hidden");
    base64Image = ev.target.result.split(",")[1];
    scanStatus.innerText = "✅ Image ready";
    scanStatus.className = "text-xs text-green-600 mt-2 text-center";
  };
  reader.readAsDataURL(file);
}

// AI Extract
scanBtn?.addEventListener("click", async () => {
  if (!base64Image) return alert("Upload an image first");
  scanBtn.disabled = true;
  scanStatus.innerText = "🤖 AI analyzing...";
  scanStatus.className = "text-xs text-blue-600 mt-2 text-center";

  try {
    const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
    const prompt = `Return ONLY valid JSON for this prescription: {"date":"", "doctorName":"", "diagnosis":"", "medications":[{"name":"","dosage":"","frequency":"","duration":""}], "pastHistory":[{"condition":"","year":""}], "drugHistory":[{"drug":"","reaction":""}], "doctorNotes":""}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI couldn't read properly. Try again.");
    
    const data = JSON.parse(jsonMatch[0]);
    
    // Fill Form
    document.getElementById("aiDate").value = data.date || "";
    document.getElementById("aiDoctor").value = data.doctorName || "";
    document.getElementById("aiDiagnosis").value = data.diagnosis || "";
    document.getElementById("aiMeds").value = (data.medications || []).map(m => `${m.name} | ${m.dosage} | ${m.frequency} | ${m.duration}`).join("\n");
    
    scanStatus.innerText = "✅ Extraction complete!";
    scanStatus.className = "text-xs text-green-600 mt-2 text-center";

  } catch (err) {
    console.error(err);
    scanStatus.innerText = "❌ " + err.message;
    scanStatus.className = "text-xs text-red-600 mt-2 text-center";
  } finally {
    scanBtn.disabled = false;
  }
});

// Save to Firestore
saveBtn?.addEventListener("click", async () => {
  if (!auth.currentUser) return alert("Login first");
  saveBtn.disabled = true;
  const statusBox = document.getElementById("saveStatus");
  statusBox.innerText = "Saving...";

  try {
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const profile = userSnap.data();
    const medsText = document.getElementById("aiMeds").value;

    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      medicalHistory: arrayUnion({
        patientName: profile.name,
        patientId: profile.healthId,
        date: document.getElementById("aiDate").value,
        doctor: document.getElementById("aiDoctor").value,
        diagnosis: document.getElementById("aiDiagnosis").value,
        medications: medsText,
        doctorNotes: document.getElementById("aiNotes").value,
        savedAt: new Date().toISOString()
      })
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
