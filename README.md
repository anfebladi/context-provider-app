<div align="center">

# 🔎 TraceX

### Real-time misinformation & brainrot detection for the modern web.

[![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Gemini AI](https://img.shields.io/badge/AI-Gemini%20API-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![JavaScript](https://img.shields.io/badge/Language-JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

> **TraceX** is a Chrome extension that scans videos and posts in real time, warning users about misinformation, AI-generated media, triggering content, and addictive "brainrot" patterns — before they fall for it.

</div>

---

## 📖 Table of Contents

- [About](#-about)
- [Features](#-features)
- [How It Works](#-how-it-works)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap)

---

## 🧠 About

At dinner, we kept seeing it happen — our parents repeating shocking "news" from short videos, our siblings citing YouTube Shorts facts like gospel truth. When we looked them up, many were exaggerated, misleading, or fully AI-generated.

It wasn't a matter of intelligence. The content *looked* real, spread fast, and bypassed critical thinking entirely. We realized the people we loved were vulnerable to something most people don't even recognize as a threat.

So we built **TraceX** — a tool that acts as a real-time safety layer between users and harmful content online.

---

## ✨ Features

- 🛑 **Misinformation Detection** — Flags videos and posts containing false or misleading claims
- 🤖 **AI-Generated Media Detection** — Identifies synthetic or deepfake content
- 🧟 **Brainrot Pattern Recognition** — Detects low-value, addictive content designed to hijack attention
- ⚠️ **Triggering Content Warnings** — Surfaces warnings before sensitive material plays
- 🌫️ **Auto-Blur for High-Risk Content** — Blurs flagged videos until the user consciously chooses to continue
- 📋 **Context Labels** — Provides brief explanations of *why* content was flagged

---

## ⚙️ How It Works

```
User opens a video
       ↓
Chrome Extension captures the video URL
       ↓
URL sent to Node.js Backend
       ↓
Backend queries the Gemini API
       ↓
Gemini returns a risk classification (JSON)
       ↓
Extension displays a warning popup (or blurs video)
       ↓
User decides: continue or exit
```

**Risk Categories returned by Gemini:**
| Category | Description |
|----------|-------------|
| `misinformation` | False or misleading factual claims |
| `ai_generated` | Synthetic, deepfake, or AI-fabricated media |
| `brainrot` | Low-value, addictive, or attention-hijacking content |
| `triggering` | Content that may cause emotional distress |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript (Chrome Extension) |
| Backend | Node.js |
| AI / Analysis | Google Gemini API |
| Communication | REST API (JSON) |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Gemini API key](https://aistudio.google.com/app/apikey)
- Google Chrome browser

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/your-username/tracex.git
cd tracex
```

**2. Install backend dependencies**
```bash
cd backend
npm install
```

**3. Set up your environment variables**
```bash
cp .env.example .env
```
Then open `.env` and add your Gemini API key:
```
GEMINI_API_KEY=your_api_key_here
```

**4. Start the backend server**
```bash
npm start
```

**5. Load the Chrome Extension**
- Open Chrome and navigate to `chrome://extensions/`
- Enable **Developer Mode** (top right toggle)
- Click **Load unpacked**
- Select the `/extension` folder from this repo

**6. Test it out**
Open any YouTube video — TraceX will automatically analyze it and display a warning if risks are detected.

---

## 📁 Project Structure

```
tracex/
├── extension/              # Chrome Extension (Frontend)
│   ├── manifest.json       # Extension config & permissions
│   ├── content.js          # Content script (captures video URL)
│   ├── popup.html          # Warning popup UI
│   ├── popup.js            # Popup logic
│   └── styles.css          # Extension styles
│
├── backend/                # Node.js Server
│   ├── server.js           # Main server entry point
│   ├── gemini.js           # Gemini API integration
│   └── .env.example        # Environment variable template
│
└── README.md
```

---

## 🗺️ Roadmap

- [x] YouTube video analysis
- [x] Real-time risk classification via Gemini
- [x] Chrome Extension popup with warnings
- [x] Auto-blur for high-risk content
- [ ] Support for TikTok, Instagram Reels, Facebook & Twitter/X
- [ ] Mobile companion app
- [ ] Personalized sensitivity settings (by age / preference)

---


## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

*TraceX — Trace the Truth.*

</div>
