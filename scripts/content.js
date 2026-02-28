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
let notificationTimeoutId = null;

function showNotification(message) {
  const existingToast = document.getElementById("context-verifier-toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.id = "context-verifier-toast";
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.top = "16px";
  toast.style.right = "16px";
  toast.style.maxWidth = "360px";
  toast.style.padding = "12px 14px";
  toast.style.backgroundColor = "#0F0F0F";
  toast.style.border = "1px solid #FF0000";
  toast.style.color = "#FFFFFF";
  toast.style.borderRadius = "12px";
  toast.style.boxShadow = "0 10px 15px rgba(0, 0, 0, 0.35)";
  toast.style.fontFamily = "Arial, sans-serif";
  toast.style.fontSize = "14px";
  toast.style.lineHeight = "1.4";
  toast.style.zIndex = "2147483647";
  toast.style.opacity = "1";
  toast.style.transition = "opacity 300ms ease";
  toast.style.setProperty("background-color", "#FF0000", "important");

  document.documentElement.appendChild(toast);
  logger.info("Toast displayed:", message);

  if (notificationTimeoutId) {
    clearTimeout(notificationTimeoutId);
  }

  notificationTimeoutId = setTimeout(() => {
    toast.style.opacity = "0";

    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 300);
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
  logger.info("Sending message to background:", { videoId, url });

  chrome.runtime.sendMessage(
    {
      type: "SHORT_DETECTED",
      payload: { videoId, url }
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

function handlePotentialNavigation() {
  const newUrl = location.href;
  if (newUrl === currentUrl) {
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
  const observer = new MutationObserver(() => {
    if (navigationCheckQueued) {
      return;
    }

    navigationCheckQueued = true;
    requestAnimationFrame(() => {
      navigationCheckQueued = false;
      handlePotentialNavigation();
    });
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true
  });

  window.addEventListener("popstate", handlePotentialNavigation);
  window.addEventListener("hashchange", handlePotentialNavigation);

  logger.info("MutationObserver started.");
  handlePotentialNavigation();
}

function syncMonitoringState() {
  chrome.storage.sync.get({ monitoringEnabled: true }, (result) => {
    monitoringEnabled = Boolean(result.monitoringEnabled);
    logger.info("Monitoring state synced:", monitoringEnabled ? "ENABLED" : "DISABLED");
    handlePotentialNavigation();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.monitoringEnabled) {
      return;
    }

    monitoringEnabled = Boolean(changes.monitoringEnabled.newValue);
    logger.info("Monitoring state changed:", monitoringEnabled ? "ENABLED" : "DISABLED");
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object") {
    return;
  }

  const messageType = message.type;
  const eventType = message.payload?.event;
  const isDisplayMessage = messageType === "DISPLAY_NOTIFICATION";
  const isNewVideoEvent = messageType === "NEW_VIDEO_DATA" || eventType === "NEW_VIDEO_DATA";

  if (!isDisplayMessage && !isNewVideoEvent) {
    return;
  }

  const incomingVideoId = message.payload?.videoId ?? message.videoId ?? "unknown";
  const incomingPrefix = message.payload?.prefix;
  const incomingText = message.payload?.message ?? message.message;
  const notificationText = incomingText ?? `${incomingPrefix ?? "New YouTube Short Detected: "}${incomingVideoId}`;

  logger.info("Notification command received:", {
    type: message.type,
    videoId: incomingVideoId,
    text: notificationText
  });

  console.log("UI: Attempting to render window now...");
  showNotification(notificationText);
});

syncMonitoringState();
startObserver();

console.log("Emergency Test Triggered");
showNotification("System Startup Check");
