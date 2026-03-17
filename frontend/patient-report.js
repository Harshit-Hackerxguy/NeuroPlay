import { fetchMySessions, fetchPatientSessions } from "./api.js";
import { getAuth, injectAuthHeader } from "./auth.js";
import { renderEmptyRow, setButtonLoading, setStatus, withDelayedLoading } from "./ui.js";

const userIdInput = document.getElementById("reportUserId");
const loadBtn = document.getElementById("loadReportBtn");
const statusEl = document.getElementById("reportStatus");
const tableBody = document.querySelector("#reportTable tbody");
const metricSessionsEl = document.getElementById("metricSessions");
const metricAccuracyEl = document.getElementById("metricAccuracy");
const metricImprovementEl = document.getElementById("metricImprovement");
const metricImprovementHintEl = document.getElementById("metricImprovementHint");

let performanceChart = null;
let strengthChart = null;

injectAuthHeader({ showDoctorNav: true });

const auth = getAuth();
if (auth?.role === "patient" && auth.patientId) {
  userIdInput.value = auth.patientId;
  userIdInput.readOnly = true;
}

function formatTime(raw) {
  const d = new Date(raw);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function destroyCharts() {
  if (performanceChart) performanceChart.destroy();
  if (strengthChart) strengthChart.destroy();
}

function updateMetricCards(rows) {
  if (!rows.length) {
    metricSessionsEl.textContent = "0";
    metricAccuracyEl.textContent = "0%";
    metricImprovementEl.textContent = "Stable";
    metricImprovementHintEl.textContent = "Focus area: --";
    metricImprovementEl.classList.remove("trend-positive", "trend-negative");
    return;
  }

  const accuracyAvg = rows.reduce((sum, row) => sum + Number(row.accuracy || 0), 0) / rows.length;
  metricSessionsEl.textContent = String(rows.length);
  metricAccuracyEl.textContent = `${accuracyAvg.toFixed(1)}%`;

  const first = rows[rows.length - 1];
  const last = rows[0];
  const accuracyDelta = Number(last.accuracy || 0) - Number(first.accuracy || 0);
  const reactionDelta = Number(first.reactionTime || 0) - Number(last.reactionTime || 0);
  const trend = accuracyDelta + reactionDelta / 20;

  metricImprovementEl.classList.remove("trend-positive", "trend-negative");
  let focusArea = "Maintain pace";
  if (trend > 1.5) {
    metricImprovementEl.textContent = "Improving";
    metricImprovementEl.classList.add("trend-positive");
    focusArea = "Advance complexity";
  } else if (trend < -1.5) {
    metricImprovementEl.textContent = "Needs Review";
    metricImprovementEl.classList.add("trend-negative");
    focusArea = "Speed and sustained attention";
  } else {
    metricImprovementEl.textContent = "Stable";
    focusArea = "Consistency";
  }

  metricImprovementHintEl.textContent = `Focus area: ${focusArea}`;
}

function strengthValue(rows, gameNamePart) {
  const group = rows.filter((row) => String(row.gameName || "").includes(gameNamePart));
  if (!group.length) return 0;
  return group.reduce((sum, row) => sum + Number(row.accuracy || 0), 0) / group.length;
}

function renderCharts(rows) {
  destroyCharts();
  if (!rows.length) return;

  const sorted = [...rows].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const labels = sorted.map((row) => formatTime(row.timestamp));
  const reactionData = sorted.map((row) => Number(row.reactionTime || 0));
  const accuracyData = sorted.map((row) => Number(row.accuracy || 0));

  const lineCanvas = document.getElementById("performanceLineChart");
  const lineCtx = lineCanvas.getContext("2d");
  const cyanFill = lineCtx.createLinearGradient(0, 0, 0, 280);
  cyanFill.addColorStop(0, "rgba(0, 224, 255, 0.26)");
  cyanFill.addColorStop(1, "rgba(0, 224, 255, 0.02)");

  const greenFill = lineCtx.createLinearGradient(0, 0, 0, 280);
  greenFill.addColorStop(0, "rgba(35, 243, 162, 0.24)");
  greenFill.addColorStop(1, "rgba(35, 243, 162, 0.02)");

  performanceChart = new Chart(lineCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Reaction Time (ms)",
          data: reactionData,
          yAxisID: "y",
          borderColor: "#00e0ff",
          backgroundColor: cyanFill,
          fill: true,
          borderWidth: 2,
          borderRadius: 6,
          maxBarThickness: 20
        },
        {
          label: "Accuracy (%)",
          data: accuracyData,
          yAxisID: "y1",
          borderColor: "#23f3a2",
          backgroundColor: greenFill,
          fill: true,
          borderWidth: 2,
          borderRadius: 6,
          maxBarThickness: 20
        }
      ]
    },
    options: {
      animation: false,
      plugins: {
        legend: {
          labels: {
            color: "#d8edff",
            boxWidth: 14,
            usePointStyle: true,
            pointStyle: "circle"
          }
        },
        tooltip: {
          backgroundColor: "rgba(8, 15, 33, 0.94)",
          borderColor: "rgba(82, 150, 255, 0.5)",
          borderWidth: 1,
          titleColor: "#e7f5ff",
          bodyColor: "#cfe8ff"
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(96, 124, 176, 0.2)", borderDash: [4, 4] },
          ticks: { color: "#9eb6d7", maxTicksLimit: 6 }
        },
        y: {
          grid: { color: "rgba(96, 124, 176, 0.2)", borderDash: [4, 4] },
          ticks: { color: "#9eb6d7" },
          title: { display: true, text: "ms", color: "#9eb6d7" }
        },
        y1: {
          position: "right",
          min: 0,
          max: 100,
          ticks: { color: "#9eb6d7" },
          grid: { drawOnChartArea: false },
          title: { display: true, text: "%", color: "#9eb6d7" }
        }
      }
    }
  });

  const memoryStrength = strengthValue(rows, "memory");
  const reflexStrength = strengthValue(rows, "reaction") || strengthValue(rows, "neonmath");
  const attentionStrength = strengthValue(rows, "attention");

  strengthChart = new Chart(document.getElementById("strengthRadarChart"), {
    type: "radar",
    data: {
      labels: ["Memory", "Reflexes", "Attention"],
      datasets: [
        {
          label: "Cognitive Strength",
          data: [memoryStrength, reflexStrength, attentionStrength],
          borderColor: "#ff4fd8",
          backgroundColor: "rgba(255, 79, 216, 0.18)",
          pointBackgroundColor: "#00e0ff",
          pointBorderColor: "#ffffff",
          pointHoverRadius: 5,
          borderWidth: 2
        }
      ]
    },
    options: {
      animation: false,
      plugins: {
        legend: {
          labels: {
            color: "#d8edff",
            usePointStyle: true,
            pointStyle: "circle"
          }
        },
        tooltip: {
          backgroundColor: "rgba(8, 15, 33, 0.94)",
          borderColor: "rgba(255, 79, 216, 0.5)",
          borderWidth: 1,
          titleColor: "#e7f5ff",
          bodyColor: "#cfe8ff"
        }
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { color: "#8ea6c8", backdropColor: "transparent" },
          grid: { color: "rgba(120, 150, 195, 0.28)" },
          angleLines: { color: "rgba(120, 150, 195, 0.28)" },
          pointLabels: { color: "#d8edff" }
        }
      }
    }
  });
}

async function loadReport() {
  const auth = getAuth();
  const userId = userIdInput.value.trim();
  if (!auth) {
    setStatus(statusEl, "Please log in to view reports.", "error");
    renderEmptyRow(tableBody, "Login required to access report data.", 7);
    return;
  }

  if (auth.role === "doctor" && !userId) {
    setStatus(statusEl, "Enter patient ID.", "error");
    renderEmptyRow(tableBody, "No data to show.", 7);
    return;
  }

  setStatus(statusEl, "Loading report...", "loading");
  destroyCharts();
  setButtonLoading(loadBtn, true, "Loading...");
  renderEmptyRow(tableBody, "Fetching patient sessions...", 7);

  try {
    let rows = [];
    await withDelayedLoading(async () => {
      rows = auth.role === "doctor"
        ? await fetchPatientSessions({ userId })
        : await fetchMySessions();
    }, 260);

    if (!rows.length) {
      setStatus(statusEl, "No records found for this patient.", "empty");
      renderEmptyRow(tableBody, "No patient sessions found.", 7);
      updateMetricCards([]);
      return;
    }

    tableBody.innerHTML = "";

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatTime(row.timestamp)}</td>
        <td>${row.gameName || "-"}</td>
        <td>${Number(row.reactionTime || 0).toFixed(0)}</td>
        <td>${Number(row.accuracy || 0).toFixed(1)}</td>
        <td>${Number(row.mistakes || 0)}</td>
        <td>${row.diagnosis || "-"}</td>
        <td>${row.improvementNote || "-"}</td>
      `;
      tableBody.appendChild(tr);
    });

    updateMetricCards(rows);
    renderCharts(rows);

    setStatus(statusEl, `Loaded ${rows.length} records.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(statusEl, "Failed to load report. Ensure backend API is running.", "error");
    renderEmptyRow(tableBody, "Unable to load report data.", 7);
    updateMetricCards([]);
    destroyCharts();
  } finally {
    setButtonLoading(loadBtn, false);
  }
}

loadBtn.addEventListener("click", loadReport);

if (auth?.role === "patient" && auth.patientId) {
  loadReport();
}
