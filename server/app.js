import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = 5000;
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");

    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, ".env"));

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

  if (normalized === "yes") {
    return "yes";
  }

  if (normalized === "si") {
    return "yes";
  }

  if (normalized === "no") {
    return "no";
  }

  return "no";
}

function extractVideoIdFromUrl(urlValue) {
  try {
    const parsed = new URL(urlValue);

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.replace(/^\//, "").split("/")[0] || null;
    }

    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch?.[1]) {
      return shortsMatch[1];
    }

    const watchId = parsed.searchParams.get("v");
    if (watchId) {
      return watchId;
    }

    return null;
  } catch {
    return null;
  }
}

async function downloadVideoThumbnailBase64(urlValue) {
  const videoId = extractVideoIdFromUrl(urlValue);
  if (!videoId) {
    throw new Error("Unable to extract video id from url");
  }

  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const response = await fetch(thumbnailUrl);
  if (!response.ok) {
    throw new Error(`Failed to download thumbnail: ${response.status}`);
  }

  const thumbnailBuffer = Buffer.from(await response.arrayBuffer());
  return thumbnailBuffer.toString("base64");
}

function extractJsonObject(rawText) {
  const text = String(rawText || "").trim();
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : text;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in model response");
  }

  const jsonString = candidate.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonString);
}

function normalizeDetector(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (normalized === "ai-generated" || normalized === "likely-real" || normalized === "uncertain") {
    return normalized;
  }

  if (normalized.includes("real") || normalized.includes("human")) {
    return "likely-real";
  }

  if (normalized.includes("ai") || normalized.includes("synthetic") || normalized.includes("generated")) {
    return "ai-generated";
  }

  return "uncertain";
}

async function analyzeVideoWithGemini(videoUrl, apiKey, thumbnailBase64) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = [
    "Analyze this YouTube thumbnail for two tasks and return only JSON.",
    "Task 1 (ai detector): determine if the thumbnail appears ai-generated.",
    "Task 2 (context giver): provide a short plain-language context summary about potential misinformation risk.",
    "Use this exact schema:",
    "{",
    '  "status": "yes|no",',
    '  "detector": "ai-generated|likely-real|uncertain",',
    '  "context": "1-2 sentence explanation"',
    "}",
    "status=yes means likely safe/credible.",
    "status=no means likely misleading/manipulative or unsafe.",
    `Video URL: ${videoUrl}`
  ].join("\n");

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: thumbnailBase64
      }
    }
  ]);

  const modelReply = result?.response?.text?.() ?? "";
  const parsed = extractJsonObject(modelReply);

  return {
    status: normalizeStatus(parsed.status),
    detector: normalizeDetector(parsed.detector),
    context: String(parsed.context || "").trim() || "No additional context available."
  };
}

app.post("/verify-video", async (req, res) => {
  const { url } = req.body || {};
  console.log("[verify-video] Incoming url:", url);

  if (!url || typeof url !== "string" || !isValidVideoUrl(url)) {
    res.status(400).json({ status: "no", reason: "No context found" });
    return;
  }

  const activeApiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!activeApiKey) {
    res.status(400).json({ status: "no", reason: "Missing GEMINI_API_KEY in server/.env" });
    return;
  }

  try {
    const thumbnailBase64 = await downloadVideoThumbnailBase64(url);
    const analysis = await analyzeVideoWithGemini(url, activeApiKey, thumbnailBase64);
    res.json(analysis);
  } catch (error) {
    console.error("verify-video error:", error.message);
    res.status(500).json({ status: "no", reason: "No context found" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
