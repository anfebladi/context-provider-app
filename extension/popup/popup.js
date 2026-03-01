const toggleElement = document.getElementById("monitoringToggle");
const statusElement = document.getElementById("status");
const statusCursor = document.getElementById("statusCursor");
const panel = document.getElementById("aiPanel");
const resizeHandle = document.getElementById("resizeHandle");

const TYPING_MS = 28;
let typingTimeoutId = null;

function setStatus(text) {
  if (!text) text = "";
  if (typingTimeoutId) clearTimeout(typingTimeoutId);
  statusElement.textContent = "";
  statusCursor.style.display = "inline-block";

  let i = 0;
  function type() {
    if (i <= text.length) {
      statusElement.textContent = text.slice(0, i);
      i++;
      typingTimeoutId = setTimeout(type, TYPING_MS);
    } else {
      typingTimeoutId = null;
      statusCursor.style.display = "inline-block";
    }
  }
  type();
}

function render(enabled) {
  toggleElement.checked = enabled;
  setStatus(`Monitoring: ${enabled ? "ENABLED" : "DISABLED"}`);
}

function setupResize() {
  let startX = 0, startY = 0, startW = 0, startH = 0;
  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    startW = panel.offsetWidth;
    startH = panel.offsetHeight;
    function move(e) {
      const dw = e.clientX - startX;
      const dh = e.clientY - startY;
      const newW = Math.max(280, Math.min(500, startW + dw));
      const newH = Math.max(120, startH + dh);
      panel.style.width = newW + "px";
      panel.style.height = newH + "px";
    }
    function stop() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
    }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", stop);
  });
}
setupResize();

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
