const toggleElement = document.getElementById("monitoringToggle");
const statusElement = document.getElementById("status");

function setStatus(text) {
  statusElement.textContent = text;
}

function render(enabled) {
  toggleElement.checked = enabled;
  setStatus(`Monitoring: ${enabled ? "ENABLED" : "DISABLED"}`);
}

function loadInitialState() {
  chrome.storage.sync.get({ monitoringEnabled: true }, (result) => {
    render(Boolean(result.monitoringEnabled));
  });
}

function updateMonitoring(enabled) {
  setStatus("Updating monitoring state...");

  chrome.runtime.sendMessage(
    {
      type: "SET_MONITORING",
      payload: { enabled }
    },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus(`Error: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!response?.ok) {
        setStatus(`Error: ${response?.error ?? "Unknown error"}`);
        return;
      }

      render(Boolean(response.enabled));
    }
  );
}

toggleElement.addEventListener("change", (event) => {
  updateMonitoring(Boolean(event.target.checked));
});

loadInitialState();
