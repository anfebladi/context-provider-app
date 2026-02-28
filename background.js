const LOG_PREFIX = "[ContextVerifier:Background]";

const logger = {
  info: (...args) => console.log(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
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
    const { videoId, url } = message.payload ?? {};
    logger.info("Message received from content script:", { videoId, url, tabId: sender.tab?.id });

    const targetTabId = sender.tab?.id;
    if (typeof targetTabId === "number") {
      chrome.tabs.sendMessage(
        targetTabId,
        {
          type: "DISPLAY_NOTIFICATION",
          payload: {
            event: "NEW_VIDEO_DATA",
            videoId,
            prefix: "New YouTube Short Detected: "
          }
        },
        () => {
          if (chrome.runtime.lastError) {
            logger.warn("Notification dispatch warning:", chrome.runtime.lastError.message);
            return;
          }

          logger.info("DISPLAY_NOTIFICATION sent to tab:", { tabId: targetTabId, videoId });
        }
      );
    } else {
      logger.warn("No valid sender tab id. Unable to dispatch notification.");
    }

    processShortsData(videoId)
      .then((result) => {
        logger.info("processShortsData completed:", result);
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        logger.error("processShortsData failed:", error);
        sendResponse({ ok: false, error: String(error) });
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

async function processShortsData(videoId) {
  logger.info("Processing short data (placeholder LLM call) for:", videoId);

  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    videoId,
    simulatedApi: "external-llm-endpoint",
    processedAt: new Date().toISOString()
  };
}
