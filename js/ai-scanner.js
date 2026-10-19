// js/ai-scanner.js
import { auth, db } from "./firebase-config.js";
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
let currentFile = null;

// =========================================================
// 1. IMAGE UPLOAD
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
  currentFile = file; // ফাইলটা সেভ করে রাখছি OCR-এ পাঠানোর জন্য
  
  const reader = new FileReader();
  reader.onload = ev => {
    previewImg.src = ev.target.result;
    previewBox.classList.remove("hidden");
    base64Image = ev.target.result;
    scanStatus.innerText = "✅ Image ready";
    scanStatus.className = "text-xs text-green-600 mt-2 text-center font-medium";
  };
  reader.readAsDataURL(file);
}

// =========================================================
// 2. AI EXTRACT (OCR.space API - 100% Free & Reliable)
// =========================================================
scanBtn?.addEventListener("click", async () => {
  if (!currentFile) {
    alert("Please upload an image first");
    return;
  }

  scanBtn.disabled = true;
  scanStatus.innerText = "🤖 Reading text from image... (5-10 sec)";
  scanStatus.className = "text-xs text-blue-600 mt-2 text-center font-medium";

  try {
    // 🌟 ধাপ ১: OCR.space API দিয়ে ছবি থেকে টেক্সট বের করা
    const formData = new FormData();
    formData.append("file", currentFile);
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("apikey", "K82748895688957"); // ফ্রি টেস্ট কী

    const ocrResponse = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData
    });

    if (!ocrResponse.ok) throw new Error("OCR Server Error");
    
    const ocrData = await ocrResponse.json();
    
    if (ocrData.IsErroredOnProcessing) {
      throw new Error(ocrData.ErrorMessage?.[0] || "Failed to read image");
    }

    const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || "";
    console.log("Extracted Text from OCR:", extractedText);

    if (!extractedText.trim()) {
      throw new Error("No text found in image. Please try a clearer photo.");
    }

    scanStatus.innerText = "🧠 Analyzing prescription data...";

    // 🌟 ধাপ ২: টেক্সট থেকে ডেটা ফরম্যাট করা (Regex ও কী-ওয়ার্ড দিয়ে)
    // যেহেতু আমরা ফ্রি OCR ব্যবহার করছি, তাই AI দিয়ে স্ট্রাকচার করছি না, বরং টেক্সটটা সরাসরি বসিয়ে দিচ্ছি।
    
    // ডেমো হিসেবে আমরা টেক্সটটা নোটে ঢুকিয়ে দিচ্ছি, ইউজার নিজে এডিট করতে পারবে
    document.getElementById("aiNotes").value = extractedText;
    
    // ডিফল্ট কিছু ভ্যালু বসিয়ে দিচ্ছি যাতে ফর্ম খালি না থাকে
    document.getElementById("aiDate").value = new Date().toISOString().split("T")[0];
    
    // মেডিসিন লাইনগুলো খোঁজার চেষ্টা (সাধারণ কী-ওয়ার্ড দিয়ে)
    const lines = extractedText.split("\n");
    let medsFound = [];
    
    lines.forEach(line => {
      // যদি লাইনে mg, ml, tab, cap, ১-০-১ ইত্যাদি থাকে
      if (line.match(/\d+\s*(mg|ml|tab|cap)/i) || line.match(/\d-\d-\d/)) {
        medsFound.push(line.trim());
      }
    });

    if (medsFound.length > 0) {
      document.getElementById("aiMeds").value = medsFound.join("\n");
    }

    scanStatus.innerText = "✅ Text extracted! Please review the Notes.";
    scanStatus.className = "text-xs text-green-600 mt-2 text-center font-medium";

  } catch (err) {
    console.error("AI Error:", err);
    scanStatus.innerText = "❌ " + (err.message || "Failed to read. Try again.");
    scanStatus.className = "text-xs text-red-600 mt-2 text-center";
  } finally {
    scanBtn.disabled = false;
  }
});

// =========================================================
// 3. FILL FORM (Manual Inputs)
// =========================================================
// ইউজার নিজে ডেটা এডিট করবে, তাই এখানে আলাদা ফাংশনের দরকার নেই

// =========================================================
// 4. SAVE TO FIRESTORE
// =========================================================
saveBtn?.addEventListener("click", async () => {
  if (!auth.currentUser) {
    alert("Please login first");
    return;
  }

  saveBtn.disabled = true;
  const statusBox = document.getElementById("saveStatus");
  statusBox.innerText = "Saving...";
  statusBox.className = "text-xs text-gray-500 mt-2 text-center";

  try {
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (!userSnap.exists()) throw new Error("Profile not found");
    const patientProfile = userSnap.data();

    const medsText = document.getElementById("aiMeds").value;
    const pastText = document.getElementById("aiPastHistory")?.value || "";
    const drugText = document.getElementById("aiDrugHistory")?.value || "";

    if (!medsText.trim() && !document.getElementById("aiDiagnosis").value.trim()) {
      statusBox.innerText = "❌ Nothing to save";
      statusBox.className = "text-xs text-red-600 mt-2 text-center";
      saveBtn.disabled = false;
      return;
    }

    const record = {
      patientName: patientProfile.name,
      patientId: patientProfile.healthId,
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

    statusBox.innerText = "✅ Saved to health card!";
    statusBox.className = "text-xs text-green-700 mt-2 text-center font-medium";
    setTimeout(() => window.location.reload(), 1200);

  } catch (e) {
    statusBox.innerText = "❌ " + e.message;
    statusBox.className = "text-xs text-red-600 mt-2 text-center";
    saveBtn.disabled = false;
  }
});
