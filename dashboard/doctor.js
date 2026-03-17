import { fetchPatientSessions } from "../api.js";
import { injectAuthHeader, requireDoctorAccess } from "../auth.js";
import { renderEmptyRow, setButtonLoading, setStatus, withDelayedLoading } from "../ui.js";

if (!requireDoctorAccess()) {
  throw new Error("Doctor access required.");
}

injectAuthHeader({ basePath: "..", showDoctorNav: true });

const patientInput = document.getElementById("patientId");
const gameNameInput = document.getElementById("gameName");
const loadBtn = document.getElementById("loadBtn");
const statusEl = document.getElementById("status");
const tableBody = document.querySelector("#clinicalTable tbody");

const metricSessionsEl = document.getElementById("metricSessions");
const metricAccuracyEl = document.getElementById("metricAccuracy");
const metricImprovementEl = document.getElementById("metricImprovement");
const metricImprovementHintEl = document.getElementById("metricImprovementHint");
const metricConsistencyEl = document.getElementById("metricConsistency");
const metricRiskEl = document.getElementById("metricRisk");
const metricNeedEl = document.getElementById("metricNeed");

let performanceChart = null;
let strengthChart = null;
let isLoading = false;
let requestId = 0;

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function createFreshCanvas(id) {
  const oldCanvas = document.getElementById(id);
  if (!oldCanvas) return null;

  const nextCanvas = document.createElement("canvas");
  nextCanvas.id = id;
  nextCanvas.setAttribute("height", "120");
  oldCanvas.replaceWith(nextCanvas);
  return nextCanvas;
}

function destroyCharts() {
  if (performanceChart) performanceChart.destroy();
  if (strengthChart) strengthChart.destroy();
  performanceChart = null;
  strengthChart = null;
}

function normalizeRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.id ?? `${row.userId || "u"}-${row.gameName || "g"}-${row.timestamp}`;
    map.set(key, row);
  });

  return Array.from(map.values())
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-30);
}

function calcStd(values) {
  if (!values.length) return 0;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + ((v - avg) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function getPrimaryNeed(rows) {
  const avgAcc = rows.reduce((s, r) => s + clamp(r.accuracy, 0, 100), 0) / rows.length;
  const avgReaction = rows.reduce((s, r) => s + clamp(r.reactionTime, 0, 5000), 0) / rows.length;
  const avgMistakes = rows.reduce((s, r) => s + clamp(r.mistakes, 0, 100), 0) / rows.length;

  if (avgAcc < 60) return "Memory/attention accuracy";
  if (avgReaction > 1200) return "Processing speed";
  if (avgMistakes > 2.5) return "Impulse control";
  return "Maintain current progression";
}

function updateMetricCards(rows) {
  if (!rows.length) {
    metricSessionsEl.textContent = "0";
    metricAccuracyEl.textContent = "0%";
    metricImprovementEl.textContent = "Stable";
    metricImprovementHintEl.textContent = "Focus area: --";
    metricConsistencyEl.textContent = "0";
    metricRiskEl.textContent = "Low";
    metricNeedEl.textContent = "--";
    metricImprovementEl.classList.remove("trend-positive", "trend-negative");
    return;
  }

  const accuracy = rows.map((r) => clamp(r.accuracy, 0, 100));
  const reaction = rows.map((r) => clamp(r.reactionTime, 0, 5000));

  const avgAcc = accuracy.reduce((s, v) => s + v, 0) / accuracy.length;
  const avgReaction = reaction.reduce((s, v) => s + v, 0) / reaction.length;
  const consistencyScore = Math.max(0, 100 - (calcStd(accuracy) * 0.8) - (calcStd(reaction) / 55));

  metricSessionsEl.textContent = String(rows.length);
  metricAccuracyEl.textContent = `${avgAcc.toFixed(1)}%`;
  metricConsistencyEl.textContent = consistencyScore.toFixed(0);

  const oldest = rows[0];
  const latest = rows[rows.length - 1];
  const accDelta = clamp(latest.accuracy, 0, 100) - clamp(oldest.accuracy, 0, 100);
  const reactionGain = clamp(oldest.reactionTime, 0, 5000) - clamp(latest.reactionTime, 0, 5000);
  const trend = accDelta + (reactionGain / 22);

  metricImprovementEl.classList.remove("trend-positive", "trend-negative");
  if (trend > 2) {
    metricImprovementEl.textContent = "Improving";
    metricImprovementEl.classList.add("trend-positive");
  } else if (trend < -2) {
    metricImprovementEl.textContent = "Declining";
    metricImprovementEl.classList.add("trend-negative");
  } else {
    metricImprovementEl.textContent = "Stable";
  }

  const focus = getPrimaryNeed(rows);
  metricNeedEl.textContent = focus;
  metricImprovementHintEl.textContent = `Focus area: ${focus}`;

  if (avgAcc < 55 || avgReaction > 1400 || consistencyScore < 45) {
    metricRiskEl.textContent = "High";
    metricRiskEl.classList.add("trend-negative");
    metricRiskEl.classList.remove("trend-positive");
  } else if (avgAcc < 70 || avgReaction > 1000 || consistencyScore < 65) {
    metricRiskEl.textContent = "Medium";
    metricRiskEl.classList.remove("trend-positive", "trend-negative");
  } else {
    metricRiskEl.textContent = "Low";
    metricRiskEl.classList.add("trend-positive");
    metricRiskEl.classList.remove("trend-negative");
  }
}

function renderClinicalTable(rows) {
  tableBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const d = new Date(row.timestamp);
    const when = Number.isNaN(d.getTime()) ? "-" : `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;

    tr.innerHTML = `
      <td>${when}</td>
      <td>${row.gameName || "-"}</td>
      <td>${row.diagnosis || "-"}</td>
      <td>${row.improvementNote || "-"}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function drawBarChart(canvas, labels, reactionData, accuracyData) {
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Reaction Time (ms)",
          data: reactionData,
          yAxisID: "y",
          backgroundColor: "rgba(0, 224, 255, 0.55)",
          borderColor: "#00e0ff",
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 20
        },
        {
          label: "Accuracy (%)",
          data: accuracyData,
          yAxisID: "y1",
          backgroundColor: "rgba(35, 243, 162, 0.55)",
          borderColor: "#23f3a2",
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 20
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#d8edff" } },
        tooltip: {
          backgroundColor: "rgba(8, 15, 33, 0.95)",
          borderColor: "rgba(96, 160, 255, 0.4)",
          borderWidth: 1,
          titleColor: "#e7f5ff",
          bodyColor: "#d1e7ff"
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(96, 124, 176, 0.18)" },
          ticks: { color: "#9eb6d7", maxTicksLimit: 8 }
        },
        y: {
          min: 0,
          max: 5000,
          grid: { color: "rgba(96, 124, 176, 0.2)" },
          ticks: { color: "#9eb6d7" },
          title: { display: true, text: "ms", color: "#9eb6d7" }
        },
        y1: {
          position: "right",
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { color: "#9eb6d7" },
          title: { display: true, text: "%", color: "#9eb6d7" }
        }
      }
    }
  });
}

function drawStrengthChart(canvas, rows) {
  const findAvg = (keyword) => {
    const set = rows.filter((r) => String(r.gameName || "").includes(keyword));
    if (!set.length) return 0;
    return set.reduce((s, r) => s + clamp(r.accuracy, 0, 100), 0) / set.length;
  };

  const memory = findAvg("memory");
  const reflex = Math.max(findAvg("reaction"), findAvg("neon"));
  const attention = findAvg("attention");

  return new Chart(canvas, {
    type: "radar",
    data: {
      labels: ["Memory", "Reflexes", "Attention"],
      datasets: [
        {
          label: "Cognitive Strength",
          data: [memory, reflex, attention],
          borderColor: "#ff4fd8",
          backgroundColor: "rgba(255, 79, 216, 0.2)",
          pointBackgroundColor: "#00e0ff",
          pointRadius: 4,
          borderWidth: 2
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#d8edff" } } },
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

async function loadDashboard() {
  if (isLoading) return;
  isLoading = true;
  const currentRequest = ++requestId;

  const userId = patientInput.value.trim();
  const gameName = gameNameInput.value.trim();

  setStatus(statusEl, "Loading data from PostgreSQL API...", "loading");
  destroyCharts();
  setButtonLoading(loadBtn, true, "Loading...");
  renderEmptyRow(tableBody, "Fetching clinical data...", 4);

  try {
    let rows = [];
    await withDelayedLoading(async () => {
      rows = await fetchPatientSessions({ userId, gameName, limit: 100 });
    }, 220);

    if (currentRequest !== requestId) return;

    if (!rows.length) {
      setStatus(statusEl, "No session data found for this filter.", "empty");
      renderEmptyRow(tableBody, "No records found for selected filters.", 4);
      updateMetricCards([]);
      return;
    }

    const chartRows = normalizeRows(rows);
    const labels = chartRows.map((_r, i) => `S${i + 1}`);
    const reactionData = chartRows.map((r) => clamp(r.reactionTime, 0, 5000));
    const accuracyData = chartRows.map((r) => clamp(r.accuracy, 0, 100));

    const perfCanvas = createFreshCanvas("performanceChart");
    const radarCanvas = createFreshCanvas("strengthChart");
    if (!perfCanvas || !radarCanvas) {
      throw new Error("Chart canvases not found.");
    }

    performanceChart = drawBarChart(perfCanvas, labels, reactionData, accuracyData);
    strengthChart = drawStrengthChart(radarCanvas, chartRows);
    renderClinicalTable(chartRows);
    updateMetricCards(chartRows);

    setStatus(statusEl, `Loaded ${chartRows.length} recent sessions.`, "success");
  } catch (error) {
    if (currentRequest !== requestId) return;
    console.error(error);
    setStatus(statusEl, "Failed to load dashboard data. Verify backend API is running.", "error");
    renderEmptyRow(tableBody, "Unable to load clinical data.", 4);
    updateMetricCards([]);
  } finally {
    if (currentRequest === requestId) {
      isLoading = false;
      setButtonLoading(loadBtn, false);
    }
  }
}

loadBtn.addEventListener("click", loadDashboard);
loadDashboard();
