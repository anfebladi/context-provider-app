const LOG_PREFIX = "[ContextVerifier:Background]";

const logger = {
  info: (...args) => console.log(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
};

const API_CONFIG = {
  verifyVideoUrl: "http://localhost:5000/verify-video"
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const PREFETCH_PAUSE_MS = 15 * 60 * 1000;
const analysisCache = new Map();
const inflightByVideoId = new Map();
let prefetchPausedUntil = 0;

function isQuotaErrorMessage(errorText) {
  return /429|quota exceeded|too many requests|rate limit/i.test(String(errorText || ""));
}

function extractVideoIdFromUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch?.[1]) {
      return shortsMatch[1];
    }

    if (url.hostname === "youtu.be") {
      return url.pathname.replace(/^\//, "").split("/")[0] || null;
    }

    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function getCachedResult(videoId) {
  if (!videoId) {
    return null;
  }

  const entry = analysisCache.get(videoId);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    analysisCache.delete(videoId);
    return null;
  }

  return entry.payload;
}

function setCachedResult(videoId, payload) {
  if (!videoId) {
    return;
  }

  analysisCache.set(videoId, {
    payload,
    createdAt: Date.now()
  });
}

async function fetchVideoAnalysis(fullUrl, videoId) {
  const cached = getCachedResult(videoId);
  if (cached) {
    return cached;
  }

  if (inflightByVideoId.has(videoId)) {
    return inflightByVideoId.get(videoId);
  }

  const pendingPromise = (async () => {
    logger.info("Starting fetch to backend:", { endpoint: API_CONFIG.verifyVideoUrl, fullUrl, videoId });

    const response = await fetch(API_CONFIG.verifyVideoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: fullUrl })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = String(payload?.reason || `Server returned ${response.status}`);
      throw new Error(error);
    }

    const normalizedPayload = {
      status: payload?.status,
      detector: payload?.detector,
      context: payload?.context,
      videoId,
      url: fullUrl
    };

    setCachedResult(videoId, normalizedPayload);
    return normalizedPayload;
  })();

  inflightByVideoId.set(videoId, pendingPromise);

  try {
    return await pendingPromise;
  } finally {
    inflightByVideoId.delete(videoId);
  }
}

async function preloadShorts(urls) {
  if (Date.now() < prefetchPausedUntil) {
    logger.warn("Prefetch paused due to quota/rate-limit status.");
    return;
  }

  const shortlist = Array.from(new Set((urls || []).filter((url) => typeof url === "string"))).slice(0, 4);
  if (shortlist.length === 0) {
    return;
  }

  const queue = [...shortlist];
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length > 0) {
      const urlValue = queue.shift();
      if (!urlValue) {
        return;
      }

      const videoId = extractVideoIdFromUrl(urlValue);
      if (!videoId || getCachedResult(videoId) || inflightByVideoId.has(videoId)) {
        continue;
      }

      try {
        await fetchVideoAnalysis(urlValue, videoId);
        logger.info("Preloaded short analysis:", { videoId });
      } catch (error) {
        const errorText = String(error);
        logger.warn("Preload failed:", errorText);
        if (isQuotaErrorMessage(errorText)) {
          prefetchPausedUntil = Date.now() + PREFETCH_PAUSE_MS;
          return;
        }
      }
    }
  });

  await Promise.all(workers);
}

async function sendDisplayStatus(targetTabId, payload) {
  if (typeof targetTabId !== "number") {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    targetTabId = activeTab?.id;
  }

  if (typeof targetTabId !== "number") {
    logger.warn("No valid tab id. Unable to send DISPLAY_STATUS.");
    return;
  }

  chrome.tabs.sendMessage(
    targetTabId,
    {
      type: "DISPLAY_STATUS",
      ...payload
    },
    () => {
      if (chrome.runtime.lastError) {
        logger.warn("DISPLAY_STATUS dispatch warning:", chrome.runtime.lastError.message);
        return;
      }

      logger.info("DISPLAY_STATUS sent to tab:", { tabId: targetTabId, url: payload.url });
    }
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get({ monitoringEnabled: true });
  await chrome.storage.sync.set({
    monitoringEnabled: Boolean(current.monitoringEnabled)
  });
  logger.info("Installed. Monitoring default set to ENABLED.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "SHORT_DETECTED") {
    const fullUrl = message.fullUrl;
    const videoId = String(message.videoId || extractVideoIdFromUrl(fullUrl) || "").trim();
    const senderTabId = sender.tab?.id;
    logger.info("Message received from content script:", { fullUrl, videoId, tabId: senderTabId });

    if (!fullUrl || typeof fullUrl !== "string") {
      logger.warn("SHORT_DETECTED missing fullUrl.");
      sendResponse({ ok: false, error: "Missing fullUrl" });
      return;
    }

    if (!videoId) {
      sendResponse({ ok: false, error: "Missing video id" });
      return;
    }

    (async () => {
      const payload = await fetchVideoAnalysis(fullUrl, videoId);

      logger.info("verify-video success:", payload);
      sendResponse({ ok: true, payload });
      await sendDisplayStatus(senderTabId, {
        url: fullUrl,
        videoId,
        status: payload?.status,
        detector: payload?.detector,
        context: payload?.context
      });
    })().catch(async (error) => {
      const messageText = String(error);
      if (isQuotaErrorMessage(messageText)) {
        prefetchPausedUntil = Date.now() + PREFETCH_PAUSE_MS;
      }
      logger.warn("verify-video request failed:", messageText);
      sendResponse({ ok: false, error: messageText });
      await sendDisplayStatus(senderTabId, { url: fullUrl, videoId, error: messageText });
    });

    return true;
  }

  if (message.type === "PRELOAD_SHORTS") {
    const urls = Array.isArray(message.urls) ? message.urls : [];

    preloadShorts(urls)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));

    return true;
  }

  if (message.type === "SET_MONITORING") {
    const enabled = Boolean(message.payload?.enabled);
    chrome.storage.sync
      .set({ monitoringEnabled: enabled })
      .then(() => {
        logger.info("Monitoring updated from popup:", enabled ? "ENABLED" : "DISABLED");
        sendResponse({ ok: true, enabled });
      })
      .catch((error) => {
        logger.error("Failed to update monitoring state:", error);
        sendResponse({ ok: false, error: String(error) });
      });

    return true;
  }
});

