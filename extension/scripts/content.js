const LOG_PREFIX = "[ContextVerifier:Content]";

const logger = {
  info: (...args) => console.log(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
};

if (window.__contextVerifierInitialized) {
  logger.warn("Content script already initialized; skipping duplicate setup.");
} else {
  window.__contextVerifierInitialized = true;

let currentUrl = location.href;
let lastDetectedVideoId = null;
let monitoringEnabled = true;
let navigationCheckQueued = false;
let navigationCheckTimeoutId = null;
let notificationTimeoutId = null;
let preloadDebounceTimeoutId = null;
let isBlurred = false;
let extensionContextInvalidated = false;
let currentVideoId = null;
let lastSentVideoId = null;
let lastSentAt = 0;
const blockedVideoIds = new Set();
const allowedUnsafeVideoIds = new Set();
const preloadedVideoTimestamps = new Map();
const recentDisplayFingerprints = new Map();
const PRELOAD_RETRY_MS = 3 * 60 * 1000;
let uiStylesInjected = false;

function ensureUiStyles() {
  if (uiStylesInjected || document.getElementById("context-verifier-ui-styles")) {
    uiStylesInjected = true;
    return;
  }

  const styleTag = document.createElement("style");
  styleTag.id = "context-verifier-ui-styles";
  styleTag.textContent = `
    .cv-font {
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    .cv-shadow {
      box-shadow: 0 24px 48px rgba(15, 23, 42, 0.20), 0 8px 20px rgba(15, 23, 42, 0.12);
    }

    .cv-status-toast {
      position: fixed;
      top: 18px;
      right: 16px;
      width: min(92vw, 392px);
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.82);
      z-index: 9999999;
      line-height: 1.38;
      overflow: hidden;
      backdrop-filter: blur(14px);
      transform: translateY(0);
      opacity: 1;
      transition: opacity 220ms ease, transform 220ms ease;
    }

    .cv-status-toast.cv-tone-safe {
      background: linear-gradient(130deg, rgba(236, 253, 245, 0.97), rgba(209, 250, 229, 0.92));
      color: #064e3b;
    }

    .cv-status-toast.cv-tone-risk {
      background: linear-gradient(130deg, rgba(255, 241, 242, 0.97), rgba(255, 228, 230, 0.92));
      color: #7f1d1d;
    }

    .cv-status-toast.cv-tone-error {
      background: linear-gradient(130deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.92));
      color: #1f2937;
    }

    .cv-status-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px 8px;
    }

    .cv-status-icon {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: #fff;
      flex-shrink: 0;
    }

    .cv-tone-safe .cv-status-icon { background: linear-gradient(180deg, #10b981, #059669); }
    .cv-tone-risk .cv-status-icon { background: linear-gradient(180deg, #f43f5e, #e11d48); }
    .cv-tone-error .cv-status-icon { background: linear-gradient(180deg, #64748b, #475569); }

    .cv-status-title {
      font-size: 15px;
      font-weight: 800;
      margin: 0;
      letter-spacing: 0.01em;
    }

    .cv-status-subtitle {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.80;
      margin: 2px 0 0;
    }

    .cv-status-body {
      margin: 0 14px 12px;
      padding: 10px 11px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.24);
      background: rgba(255, 255, 255, 0.62);
      font-size: 12.75px;
      white-space: pre-wrap;
    }

    .cv-danger-panel {
      position: fixed;
      left: 50%;
      bottom: 22px;
      transform: translateX(-50%);
      width: min(94vw, 640px);
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.82);
      background: linear-gradient(135deg, rgba(255,255,255,0.97), rgba(248,250,255,0.95));
      backdrop-filter: blur(16px);
      color: #111827;
      padding: 14px 16px 14px;
      z-index: 2147483647;
      overflow: hidden;
    }

    .cv-danger-badge {
      display: inline-block;
      border-radius: 999px;
      border: 1px solid rgba(124, 58, 237, 0.35);
      background: rgba(124, 58, 237, 0.10);
      color: #6d28d9;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      padding: 4px 9px;
      margin-bottom: 8px;
    }

    .cv-danger-title {
      margin: 0;
      color: #9f1239;
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.01em;
    }

    .cv-danger-subtitle {
      margin: 5px 0 10px;
      color: #475569;
      font-size: 12px;
      font-weight: 500;
    }

    .cv-danger-body {
      border: 1px solid rgba(248, 113, 113, 0.22);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(255, 245, 245, 0.88));
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 12px;
      color: #334155;
      font-size: 13px;
      line-height: 1.44;
    }

    .cv-danger-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .cv-btn {
      border: none;
      border-radius: 10px;
      padding: 8px 14px;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
    }

    .cv-btn:hover {
      transform: translateY(-1px);
      filter: brightness(1.02);
    }

    .cv-btn-ghost {
      color: #1e1b4b;
      border: 1px solid rgba(99, 102, 241, 0.28);
      background: linear-gradient(180deg, #ffffff, #eef2ff);
      box-shadow: 0 8px 16px rgba(79, 70, 229, 0.13);
    }

    .cv-btn-danger {
      color: #fff;
      background: linear-gradient(180deg, #fb7185, #e11d48);
      box-shadow: 0 10px 18px rgba(225, 29, 72, 0.28);
    }

    #context-verifier-blur-toggle {
      position: fixed;
      bottom: 82px;
      right: 20px;
      padding: 9px 14px;
      border: 1px solid rgba(255,255,255,0.78);
      border-radius: 999px;
      background: linear-gradient(160deg, rgba(255,255,255,0.93), rgba(236, 244, 255, 0.88));
      color: #1e3a8a;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      z-index: 2147483647;
      backdrop-filter: blur(10px);
      box-shadow: 0 14px 22px rgba(59, 130, 246, 0.22);
    }

    #context-verifier-blur-toggle:hover {
      filter: brightness(1.03);
    }
  `;

  const host = document.head ?? document.documentElement;
  host.appendChild(styleTag);
  uiStylesInjected = true;
}

function isExtensionContextActive() {
  try {
    return Boolean(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

function getTargetVideoElements() {
  const allVideos = Array.from(document.querySelectorAll("video"));
  if (allVideos.length === 0) {
    return [];
  }

  const visibleVideos = allVideos.filter((videoElement) => {
    const rect = videoElement.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    return isVisible;
  });

  return visibleVideos.length > 0 ? visibleVideos : allVideos;
}

function applyBlurStateToVideo() {
  const videoElements = getTargetVideoElements();
  if (videoElements.length === 0) {
    logger.warn("No video element found for blur toggle.");
    return;
  }

  const shouldAutoBlur = Boolean(
    currentVideoId &&
    blockedVideoIds.has(currentVideoId) &&
    !allowedUnsafeVideoIds.has(currentVideoId)
  );
  const isUnsafeButAllowed = Boolean(
    currentVideoId &&
    blockedVideoIds.has(currentVideoId) &&
    allowedUnsafeVideoIds.has(currentVideoId)
  );
  const shouldBlur = isUnsafeButAllowed ? false : (isBlurred || shouldAutoBlur);

  for (const videoElement of videoElements) {
    videoElement.style.transition = "filter 0.3s ease";
    videoElement.style.filter = shouldBlur ? "blur(30px)" : "none";
  }
}

function removeDangerPrompt() {
  const existingPrompt = document.getElementById("context-verifier-danger-prompt");
  if (existingPrompt) {
    existingPrompt.remove();
  }
}

function showDangerPrompt(videoId, contextText) {
  removeDangerPrompt();
  ensureUiStyles();

  const prompt = document.createElement("div");
  prompt.id = "context-verifier-danger-prompt";
  prompt.className = "cv-font cv-shadow cv-danger-panel";

  const badge = document.createElement("div");
  badge.textContent = "CONTENT SAFETY";
  badge.className = "cv-danger-badge";

  const title = document.createElement("div");
  title.textContent = "⚠️ Potentially dangerous or misleading content";
  title.className = "cv-danger-title";

  const subtitle = document.createElement("div");
  subtitle.textContent = "We detected possible manipulation, misinformation, or unsafe framing.";
  subtitle.className = "cv-danger-subtitle";

  const body = document.createElement("div");
  body.textContent = contextText || "This short may contain harmful or misleading context.";
  body.className = "cv-danger-body";

  const actions = document.createElement("div");
  actions.className = "cv-danger-actions";

  const keepHiddenButton = document.createElement("button");
  keepHiddenButton.type = "button";
  keepHiddenButton.textContent = "Keep Hidden";
  keepHiddenButton.className = "cv-btn cv-btn-ghost";
  keepHiddenButton.addEventListener("click", () => {
    allowedUnsafeVideoIds.delete(videoId);
    applyBlurStateToVideo();
    removeDangerPrompt();
  });

  const showAnywayButton = document.createElement("button");
  showAnywayButton.type = "button";
  showAnywayButton.textContent = "Show Anyway";
  showAnywayButton.className = "cv-btn cv-btn-danger";
  showAnywayButton.addEventListener("click", () => {
    allowedUnsafeVideoIds.add(videoId);
    applyBlurStateToVideo();
    removeDangerPrompt();
  });

  actions.appendChild(keepHiddenButton);
  actions.appendChild(showAnywayButton);

  prompt.appendChild(badge);
  prompt.appendChild(title);
  prompt.appendChild(subtitle);
  prompt.appendChild(body);
  prompt.appendChild(actions);

  const host = document.body ?? document.documentElement;
  host.appendChild(prompt);
}

function applyModerationStateFromPayload(payload) {
  const messageVideoId = String(payload?.videoId || "").trim();
  if (!messageVideoId) {
    return;
  }

  const normalizedStatus = String(payload?.status || "").toLowerCase();

  if (normalizedStatus === "no") {
    blockedVideoIds.add(messageVideoId);
    if (messageVideoId === currentVideoId) {
      showDangerPrompt(messageVideoId, String(payload?.context || ""));
    }
    return;
  }

  if (!payload?.error && normalizedStatus === "yes") {
    blockedVideoIds.delete(messageVideoId);
    allowedUnsafeVideoIds.delete(messageVideoId);
    if (messageVideoId === currentVideoId) {
      removeDangerPrompt();
    }
  }
}

function handleDisplayStatusMessage(payload) {
  if (shouldSkipDuplicateDisplay(payload)) {
    logger.info("Skipping duplicate DISPLAY_STATUS payload.");
    return;
  }

  applyModerationStateFromPayload(payload);
  applyBlurStateToVideo();
  showStatusBox(payload);
}

function shouldSkipDuplicateDisplay(payload) {
  const videoId = String(payload?.videoId || "").trim();
  const keyBase = [
    videoId || String(payload?.url || ""),
    String(payload?.status || ""),
    String(payload?.error || ""),
    String(payload?.context || "").slice(0, 80)
  ].join("|");

  const now = Date.now();
  const lastSeen = recentDisplayFingerprints.get(keyBase) || 0;
  recentDisplayFingerprints.set(keyBase, now);

  for (const [fingerprint, timestamp] of recentDisplayFingerprints.entries()) {
    if (now - timestamp > 12000) {
      recentDisplayFingerprints.delete(fingerprint);
    }
  }

  return now - lastSeen < 7000;
}

function updateBlurButtonText() {
  const button = document.getElementById("context-verifier-blur-toggle");
  if (!button) {
    return;
  }

  button.textContent = isBlurred ? "Unblur" : "Blur Video";
}

function ensureBlurToggleButton() {
  let button = document.getElementById("context-verifier-blur-toggle");
  if (button) {
    updateBlurButtonText();
    return;
  }

  ensureUiStyles();

  button = document.createElement("button");
  button.id = "context-verifier-blur-toggle";
  button.type = "button";
  button.textContent = "Blur Video";

  button.addEventListener("click", () => {
    isBlurred = !isBlurred;
    applyBlurStateToVideo();
    updateBlurButtonText();
  });

  const host = document.body ?? document.documentElement;
  host.appendChild(button);
  updateBlurButtonText();
}

function buildToastMessage(payload) {
  if (typeof payload === "string") {
    return {
      title: "Context Verifier",
      tone: "error",
      subtitle: "Status",
      lines: [payload]
    };
  }

  const status = String(payload?.status || "").toLowerCase();
  const detector = String(payload?.detector || "uncertain").trim();
  const context = String(payload?.context || "").trim();
  const error = String(payload?.error || "").trim();
  const url = String(payload?.url || location.href);

  if (error) {
    return {
      title: "Context Check Failed",
      tone: "error",
      subtitle: "Could not verify this short",
      lines: [error, url]
    };
  }

  const statusLabel = status === "yes" ? "Likely Safe" : "Potential Risk";
  const safeContext = context || "No additional context available.";
  const detectorLabel = detector.replace(/-/g, " ");

  return {
    title: statusLabel,
    tone: status === "yes" ? "safe" : "risk",
    subtitle: `Detector: ${detectorLabel}`,
    lines: [safeContext, url]
  };
}

function normalizeToastCard(card) {
  if (!card || typeof card !== "object") {
    return {
      title: "Context Verifier",
      tone: "error",
      subtitle: "Status",
      lines: ["Unable to display status."]
    };
  }

  const lines = Array.isArray(card.lines) ? card.lines.filter((line) => typeof line === "string") : [];
  return {
    title: String(card.title || "Context Verifier"),
    tone: String(card.tone || "error"),
    subtitle: String(card.subtitle || "Status"),
    lines: lines.length > 0 ? lines : ["No details available."]
  };
}

function showStatusBox(payload) {
  ensureUiStyles();

  const existingToast = document.getElementById("context-verifier-status");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.id = "context-verifier-status";
  toast.className = "cv-font cv-shadow cv-status-toast";
  const card = normalizeToastCard(buildToastMessage(payload));
  toast.classList.add(
    card.tone === "safe" ? "cv-tone-safe" : card.tone === "risk" ? "cv-tone-risk" : "cv-tone-error"
  );

  const header = document.createElement("div");
  header.className = "cv-status-header";

  const icon = document.createElement("div");
  icon.className = "cv-status-icon";
  icon.textContent = card.tone === "safe" ? "✓" : card.tone === "risk" ? "!" : "i";

  const headerText = document.createElement("div");
  headerText.style.minWidth = "0";

  const title = document.createElement("div");
  title.className = "cv-status-title";
  title.textContent = card.title;

  const subtitle = document.createElement("div");
  subtitle.className = "cv-status-subtitle";
  subtitle.textContent = card.subtitle;

  headerText.appendChild(title);
  headerText.appendChild(subtitle);
  header.appendChild(icon);
  header.appendChild(headerText);

  const details = document.createElement("div");
  details.className = "cv-status-body";
  details.textContent = card.lines.join("\n");

  toast.appendChild(header);
  toast.appendChild(details);

  const host = document.body ?? document.documentElement;
  host.appendChild(toast);
  logger.info("Status box displayed.");

  if (notificationTimeoutId) {
    clearTimeout(notificationTimeoutId);
  }

  notificationTimeoutId = setTimeout(() => {
    toast.style.opacity = "0";

    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 250);
  }, 3800);
}

function isShortsUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.pathname.startsWith("/shorts/");
  } catch {
    return false;
  }
}

function extractVideoIdFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const match = url.pathname.match(/^\/shorts\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function collectUpcomingShortUrls(limit = 4) {
  const anchors = Array.from(document.querySelectorAll('a[href^="/shorts/"]'));
  const fullUrls = [];
  const now = Date.now();

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href) {
      continue;
    }

    const absoluteUrl = new URL(href, location.origin).toString();
    const videoId = extractVideoIdFromUrl(absoluteUrl);
    if (!videoId || videoId === currentVideoId) {
      continue;
    }

    const previousPreloadAt = preloadedVideoTimestamps.get(videoId) || 0;
    if (now - previousPreloadAt < PRELOAD_RETRY_MS) {
      continue;
    }

    fullUrls.push(absoluteUrl);
    preloadedVideoTimestamps.set(videoId, now);

    if (fullUrls.length >= limit) {
      break;
    }
  }

  return fullUrls;
}

function preloadUpcomingShorts() {
  if (extensionContextInvalidated || !isExtensionContextActive()) {
    return;
  }

  const urls = collectUpcomingShortUrls(8);
  if (urls.length === 0) {
    return;
  }

  chrome.runtime.sendMessage({ type: "PRELOAD_SHORTS", urls }, () => {
    try {
      if (chrome.runtime.lastError) {
        logger.warn("PRELOAD_SHORTS warning:", chrome.runtime.lastError.message);
      }
    } catch {
      extensionContextInvalidated = true;
    }
  });
}

function schedulePreloadUpcomingShorts() {
  if (preloadDebounceTimeoutId) {
    clearTimeout(preloadDebounceTimeoutId);
  }

  preloadDebounceTimeoutId = setTimeout(() => {
    preloadDebounceTimeoutId = null;
    preloadUpcomingShorts();
  }, 120);
}

function sendShortDetected(videoId, url) {
  if (extensionContextInvalidated) {
    return;
  }

  logger.info("Sending message to background:", { fullUrl: url, videoId });

  if (videoId === lastSentVideoId && Date.now() - lastSentAt < 5000) {
    logger.info("Skipping duplicate request for video:", videoId);
    return;
  }

  lastSentVideoId = videoId;
  lastSentAt = Date.now();

  if (!isExtensionContextActive()) {
    extensionContextInvalidated = true;
    logger.warn("Extension context invalidated. Reload the YouTube tab to resume sending URLs.");
    showStatusBox("Extension reloaded. Refresh this tab to resume URL checks.");
    return;
  }

  try {
    chrome.runtime.sendMessage(
      {
        type: "SHORT_DETECTED",
        fullUrl: url,
        videoId
      },
      (response) => {
        try {
          if (chrome.runtime.lastError) {
            logger.error("Failed to send message:", chrome.runtime.lastError.message);
            return;
          }
        } catch (error) {
          extensionContextInvalidated = true;
          logger.error("Runtime context became invalid during callback:", error);
          showStatusBox("Extension reloaded. Refresh this tab to resume URL checks.");
          return;
        }

        logger.info("Background response:", response);
      }
    );
  } catch (error) {
    extensionContextInvalidated = true;
    logger.error("sendMessage failed due to invalid extension context:", error);
    showStatusBox("Extension reloaded. Refresh this tab to resume URL checks.");
  }
}

function handlePotentialNavigation(forceCheck = false) {
  ensureBlurToggleButton();

  const newUrl = location.href;
  if (!forceCheck && newUrl === currentUrl) {
    return;
  }

  currentUrl = newUrl;
  logger.info("URL changed:", currentUrl);

  if (!monitoringEnabled) {
    logger.info("Monitoring is disabled. Skipping detection.");
    return;
  }

  if (!isShortsUrl(currentUrl)) {
    lastDetectedVideoId = null;
    currentVideoId = null;
    removeDangerPrompt();
    return;
  }

  const videoId = extractVideoIdFromUrl(currentUrl);
  if (!videoId) {
    logger.warn("Short URL detected but videoId could not be extracted.");
    return;
  }

  currentVideoId = videoId;
  if (!blockedVideoIds.has(videoId) || allowedUnsafeVideoIds.has(videoId)) {
    removeDangerPrompt();
  }
  applyBlurStateToVideo();

  if (videoId === lastDetectedVideoId) {
    schedulePreloadUpcomingShorts();
    return;
  }

  lastDetectedVideoId = videoId;
  logger.info("New Short detected:", videoId);
  try {
    sendShortDetected(videoId, currentUrl);
    schedulePreloadUpcomingShorts();
  } catch (error) {
    extensionContextInvalidated = true;
    logger.error("Unexpected send error:", error);
    showStatusBox("Extension reloaded. Refresh this tab to resume URL checks.");
  }
}

function startObserver() {
  ensureBlurToggleButton();

  const observer = new MutationObserver(() => {
    if (navigationCheckQueued) {
      return;
    }

    navigationCheckQueued = true;
    if (navigationCheckTimeoutId) {
      clearTimeout(navigationCheckTimeoutId);
    }

    navigationCheckTimeoutId = setTimeout(() => {
      navigationCheckQueued = false;
      handlePotentialNavigation();
      schedulePreloadUpcomingShorts();
    }, 300);
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true
  });

  logger.info("MutationObserver started.");
}

function registerNavigationListeners() {
  window.addEventListener("popstate", handlePotentialNavigation);
  window.addEventListener("hashchange", handlePotentialNavigation);
  window.addEventListener("yt-navigate-finish", () => handlePotentialNavigation(true));
}

function initNavigationDetection() {
  startObserver();
  registerNavigationListeners();

  currentUrl = "";
  handlePotentialNavigation(true);
  schedulePreloadUpcomingShorts();
}

function syncMonitoringState() {
  chrome.storage.sync.get({ monitoringEnabled: true }, (result) => {
    monitoringEnabled = Boolean(result.monitoringEnabled);
    logger.info("Monitoring state synced:", monitoringEnabled ? "ENABLED" : "DISABLED");
    handlePotentialNavigation(true);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.monitoringEnabled) {
      return;
    }

    monitoringEnabled = Boolean(changes.monitoringEnabled.newValue);
    logger.info("Monitoring state changed:", monitoringEnabled ? "ENABLED" : "DISABLED");
    handlePotentialNavigation(true);
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type !== "DISPLAY_STATUS") {
    return;
  }

  const messageVideoId = String(message.videoId || extractVideoIdFromUrl(message.url || "") || "").trim();
  const payload = {
    url: message.url ?? location.href,
    videoId: messageVideoId,
    status: message.status,
    detector: message.detector,
    context: message.context,
    error: message.error
  };

  handleDisplayStatusMessage(payload);
});

syncMonitoringState();
initNavigationDetection();
}
