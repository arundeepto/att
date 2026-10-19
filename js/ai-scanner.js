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

// =========================================================
// 1. IMAGE UPLOAD HANDLER
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
    base64Image = ev.target.result; // Base64 Data URI
    scanStatus.innerText = "✅ Image ready";
    scanStatus.className = "text-xs text-green-600 mt-2 text-center font-medium";
  };
  reader.readAsDataURL(file);
}

// =========================================================
// 2. AI EXTRACT (OpenRouter with Live Free Vision Models)
// =========================================================
scanBtn?.addEventListener("click", async () => {
  if (!base64Image) {
    alert("Please upload an image first");
    return;
  }

  scanBtn.disabled = true;
  scanStatus.innerText = "🤖 AI analyzing... (wait 10-20 sec)";
  scanStatus.className = "text-xs text-blue-600 mt-2 text-center font-medium";

  try {
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
Do not include patient name.
If a section is empty, return an empty array [].
Return ONLY the JSON object, nothing else.`;

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: base64Image } }
        ]
      }
    ];

    // 🌟 তোমার OpenRouter API Key (আগেরটা)
    const OPENROUTER_API_KEY = "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"; 

    // 🌟 বর্তমানে লাইভ থাকা ফ্রি ভিশন মডেলের লিস্ট
    const modelList = [
      "google/gemma-4-26b-a4b-it:free",
      "google/gemma-4-31b-it:free",
      "nvidia/nemotron-nano-12b-v2-vl:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "allenai/molmo-2-8b:free",
      "nvidia/nemotron-3.5-super-vl:free"
    ];

    let lastError = "No models available";
    let extracted = null;

    // 🔄 একটার পর একটা মডেল ট্রাই করবে
    for (const modelId of modelList) {
      try {
        console.log(`Trying model: ${modelId}`);
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ihms-bd.web.app",
            "X-Title": "IHMS Health App"
          },
          body: JSON.stringify({
            model: modelId,
            messages: messages,
            temperature: 0.1
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.warn(`❌ ${modelId} failed:`, errorData);
          lastError = errorData.error?.message || response.status;
          continue; // পরের মডেলে যাবে
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content || "";
        
        if (!text) {
          lastError = "Empty response";
          continue;
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          lastError = "Invalid JSON format";
          continue;
        }

        extracted = JSON.parse(jsonMatch[0]);
        console.log(`✅ Success with: ${modelId}`);
        break; // সফল হলে লুপ থেকে বের হয়ে যাবে

      } catch (e) {
        console.warn(`❌ ${modelId} error:`, e.message);
        lastError = e.message;
      }
    }

    if (!extracted) {
      throw new Error(`All models failed. Last error: ${lastError}`);
    }

    if (!extracted.diagnosis && (!extracted.medications || extracted.medications.length === 0)) {
      throw new Error("AI couldn't read the text. Please try a clearer image.");
    }

    fillForm(extracted);
    scanStatus.innerText = "✅ Extraction complete!";
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
// 3. FILL FORM
// =========================================================
function fillForm(d) {
  document.getElementById("aiDate").value = d.date || new Date().toISOString().split("T")[0];
  document.getElementById("aiDoctor").value = d.doctorName || "";
  document.getElementById("aiDiagnosis").value = d.diagnosis || "";
  document.getElementById("aiMeds").value = (d.medications || [])
    .map(m => `${m.name} | ${m.dosage} | ${m.frequency} | ${m.duration}`)
    .join("\n");

  const pastEl = document.getElementById("aiPastHistory");
  if (pastEl) {
    pastEl.value = (d.pastHistory || [])
      .map(p => `${p.condition} | ${p.year || ""} | ${p.notes || ""}`)
      .join("\n");
  }

  const drugEl = document.getElementById("aiDrugHistory");
  if (drugEl) {
    drugEl.value = (d.drugHistory || [])
      .map(x => `${x.drug} | ${x.reaction} | ${x.severity || ""}`)
      .join("\n");
  }

  document.getElementById("aiNotes").value = d.doctorNotes || "";
}

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
