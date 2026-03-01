import express from "express";
import { spawn } from "node:child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = 5000;

app.use(express.json());

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

function isValidVideoUrl(urlValue) {
  try {
    const parsed = new URL(urlValue);

    if (parsed.protocol !== "https:") {
      return false;
    }

    const allowedHosts = new Set([
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be"
    ]);

    return allowedHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeStatus(rawText) {
  const normalized = String(rawText || "")
    .trim()
    .toLowerCase();

  if (normalized === "si") {
    return "yes";
  }

  if (normalized === "no") {
    return "no";
  }

  return "no";
}

function runScraper(url) {
  return new Promise((resolve, reject) => {
    const pythonArgs = ["scraper.py", url];
    const pythonProcess = spawn("python", pythonArgs, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let transcript = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (chunk) => {
      transcript += chunk.toString();
    });

    pythonProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    pythonProcess.on("error", (error) => {
      reject(new Error(`Python spawn failed: ${error.message}`));
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed with code ${code}: ${stderr.trim()}`));
        return;
      }

      const cleanedTranscript = transcript.trim();
      if (!cleanedTranscript) {
        reject(new Error("No transcript found"));
        return;
      }

      resolve(cleanedTranscript);
    });
  });
}

async function analyzeTranscript(transcript) {
  if (!genAI) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const prompt = "Analyze this transcript for misinformation or dangerous context. If it is safe/true, reply with 'si'. If it is misleading/fake, reply with 'no'. Reply with only one word.";
  const result = await model.generateContent(`${prompt}\n\nTranscript:\n${transcript}`);
  const modelReply = result?.response?.text?.() ?? "";

  return normalizeStatus(modelReply);
}

app.post("/verify-video", async (req, res) => {
  const { url } = req.body || {};
  console.log("[verify-video] Incoming url:", url);

  if (!url || typeof url !== "string" || !isValidVideoUrl(url)) {
    res.status(400).json({ status: "no", reason: "No context found" });
    return;
  }

  try {
    const transcript = await runScraper(url);
    const status = await analyzeTranscript(transcript);
    res.json({ status });
  } catch (error) {
    console.error("verify-video error:", error.message);
    res.status(500).json({ status: "no", reason: "No context found" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
