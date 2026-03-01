const LOG_PREFIX = "[ContextVerifier:Background]";

const logger = {
  info: (...args) => console.log(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
};

const API_CONFIG = {
  verifyVideoUrl: "http://localhost:5000/verify-video"
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({ monitoringEnabled: true });
  logger.info("Installed. Monitoring default set to ENABLED.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "SHORT_DETECTED") {
    const fullUrl = message.fullUrl;
    logger.info("Message received from content script:", { fullUrl, tabId: sender.tab?.id });

    const targetTabId = sender.tab?.id;
    if (!fullUrl || typeof fullUrl !== "string") {
      logger.warn("SHORT_DETECTED missing fullUrl.");
      sendResponse({ ok: false, error: "Missing fullUrl" });
      return;
    }

    fetch(API_CONFIG.verifyVideoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: fullUrl })
    })
      .then((response) => {
        logger.info("verify-video response:", response.status);
        sendResponse({ ok: true, status: response.status });
      })
      .catch((error) => {
        logger.warn("verify-video request failed (expected before backend is up):", error);
        sendResponse({ ok: false, error: String(error) });
      })
      .finally(() => {
        if (typeof targetTabId !== "number") {
          logger.warn("No valid sender tab id. Unable to send DISPLAY_STATUS.");
          return;
        }

        chrome.tabs.sendMessage(
          targetTabId,
          {
            type: "DISPLAY_STATUS",
            url: fullUrl
          },
          () => {
            if (chrome.runtime.lastError) {
              logger.warn("DISPLAY_STATUS dispatch warning:", chrome.runtime.lastError.message);
              return;
            }

            logger.info("DISPLAY_STATUS sent to tab:", { tabId: targetTabId, fullUrl });
          }
        );
      });

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

