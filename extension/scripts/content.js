const LOG_PREFIX = "[ContextVerifier:Content]";

const logger = {
  info: (...args) => console.log(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
};

let currentUrl = location.href;
let lastDetectedVideoId = null;
let monitoringEnabled = true;
let navigationCheckQueued = false;
let navigationCheckTimeoutId = null;
let notificationTimeoutId = null;
let isBlurred = false;

function getCurrentVideoElement() {
  return document.querySelector("video");
}

function applyBlurStateToVideo() {
  const videoElement = getCurrentVideoElement();
  if (!videoElement) {
    logger.warn("No video element found for blur toggle.");
    return;
  }

  videoElement.style.transition = "filter 0.3s ease";
  videoElement.style.filter = isBlurred ? "blur(30px)" : "none";
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

  button = document.createElement("button");
  button.id = "context-verifier-blur-toggle";
  button.type = "button";
  button.textContent = "Blur Video";
  button.style.position = "fixed";
  button.style.bottom = "80px";
  button.style.right = "20px";
  button.style.padding = "10px 16px";
  button.style.backgroundColor = "#0d6efd";
  button.style.border = "none";
  button.style.borderRadius = "999px";
  button.style.color = "#ffffff";
  button.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
  button.style.fontSize = "14px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.boxShadow = "0 8px 18px rgba(0, 0, 0, 0.25)";
  button.style.zIndex = "2147483647";

  button.addEventListener("click", () => {
    isBlurred = !isBlurred;
    applyBlurStateToVideo();
    updateBlurButtonText();
  });

  const host = document.body ?? document.documentElement;
  host.appendChild(button);
  updateBlurButtonText();
}

function showStatusBox(url) {
  const existingToast = document.getElementById("context-verifier-status");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.id = "context-verifier-status";
  toast.textContent = `URL sent correctly: ${url}`;
  toast.style.position = "fixed";
  toast.style.top = "16px";
  toast.style.right = "16px";
  toast.style.maxWidth = "420px";
  toast.style.padding = "12px 16px";
  toast.style.backgroundColor = "#d1ecf1";
  toast.style.border = "1px solid #bee5eb";
  toast.style.color = "#0c5460";
  toast.style.borderRadius = "8px";
  toast.style.boxShadow = "0 8px 18px rgba(0, 0, 0, 0.18)";
  toast.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
  toast.style.fontSize = "14px";
  toast.style.lineHeight = "1.4";
  toast.style.zIndex = "9999999";
  toast.style.opacity = "1";
  toast.style.transition = "opacity 250ms ease";

  const host = document.body ?? document.documentElement;
  host.appendChild(toast);
  logger.info("Status box displayed for URL:", url);

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
  }, 3000);
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

function sendShortDetected(videoId, url) {
  logger.info("Sending message to background:", { fullUrl: url, videoId });

  chrome.runtime.sendMessage(
    {
      type: "SHORT_DETECTED",
      fullUrl: url
    },
    (response) => {
      if (chrome.runtime.lastError) {
        logger.error("Failed to send message:", chrome.runtime.lastError.message);
        return;
      }

      logger.info("Background response:", response);
    }
  );
}

function handlePotentialNavigation(forceCheck = false) {
  ensureBlurToggleButton();
  applyBlurStateToVideo();

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
    return;
  }

  const videoId = extractVideoIdFromUrl(currentUrl);
  if (!videoId) {
    logger.warn("Short URL detected but videoId could not be extracted.");
    return;
  }

  if (videoId === lastDetectedVideoId) {
    return;
  }

  lastDetectedVideoId = videoId;
  logger.info("New Short detected:", videoId);
  sendShortDetected(videoId, currentUrl);
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

  showStatusBox(message.url ?? location.href);
});

syncMonitoringState();
initNavigationDetection();
