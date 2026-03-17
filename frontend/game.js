import { checkApiHealth, saveSessionMetrics } from "./api.js";
import { getAuth } from "./auth.js";
import { setButtonLoading, setStatus } from "./ui.js";

const tiles = Array.from(document.querySelectorAll(".tile"));
const startBtn = document.getElementById("startBtn");
const userIdInput = document.getElementById("userId");
const messageEl = document.getElementById("gameMessage");
const levelValueEl = document.getElementById("levelValue");
const accuracyValueEl = document.getElementById("accuracyValue");
const reactionValueEl = document.getElementById("reactionValue");
const mistakeValueEl = document.getElementById("mistakeValue");
const hesitationValueEl = document.getElementById("hesitationValue");
const clinicalSummaryEl = document.getElementById("clinicalSummary");

let sequence = [];
let expectedIndex = 0;
let inputEnabled = false;
let sessionStarted = false;
let patternLength = 3;
let sequenceEndTime = 0;
let previousClickTime = 0;
let hesitationValues = [];
let reactionValues = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setMessage(text) {
  setStatus(messageEl, text, "info");
}

function updateMetricsView() {
  const accuracy = Module._getAccuracy();
  const avgReaction = Module._getAverageReactionTime();
  const mistakes = Module._getMistakes();
  const avgHesitation =
    hesitationValues.length === 0
      ? 0
      : hesitationValues.reduce((sum, value) => sum + value, 0) / hesitationValues.length;

  levelValueEl.textContent = String(patternLength);
  accuracyValueEl.textContent = `${accuracy.toFixed(1)}%`;
  reactionValueEl.textContent = `${avgReaction.toFixed(0)} ms`;
  mistakeValueEl.textContent = String(mistakes);
  hesitationValueEl.textContent = `${avgHesitation.toFixed(0)} ms`;
}

function buildClinicalSummary(accuracy, avgReaction, mistakes) {
  if (accuracy >= 85 && avgReaction < 700 && mistakes <= 1) {
    return {
      diagnosis: "Stable short-term memory retrieval with good sequencing control",
      improvement: "Progress to dual-task memory drills to strengthen executive control.",
      focusArea: "Executive dual-tasking"
    };
  }

  if (accuracy >= 60) {
    return {
      diagnosis: "Mild working-memory and sequencing inefficiency",
      improvement: "Continue graded memory-pattern sessions to improve recall speed and consistency.",
      focusArea: "Sequencing consistency"
    };
  }

  return {
    diagnosis: "Significant short-term memory and sequence retention deficit",
    improvement: "Shorter guided sessions with repeated 2-3 tile patterns are recommended.",
    focusArea: "Working memory recall"
  };
}

function disableTiles(disabled) {
  tiles.forEach((tile) => {
    tile.disabled = disabled;
  });
}

function loadSequenceFromWasm() {
  const length = Module._getSequenceLength();
  const out = [];
  for (let i = 0; i < length; i += 1) {
    out.push(Module._getSequenceTile(i));
  }
  return out;
}

async function flashSequence() {
  disableTiles(true);
  setMessage("Watch the pattern...");

  for (const tileIndex of sequence) {
    const tile = tiles[tileIndex];
    tile.classList.add("active");
    await sleep(450);
    tile.classList.remove("active");
    await sleep(200);
  }

  inputEnabled = true;
  expectedIndex = 0;
  sequenceEndTime = performance.now();
  previousClickTime = sequenceEndTime;
  disableTiles(false);
  setMessage("Repeat the sequence.");
}

function adjustDifficulty(roundAccuracy) {
  if (roundAccuracy > 80) {
    patternLength = Math.min(patternLength + 1, 12);
  } else if (roundAccuracy < 50) {
    patternLength = Math.max(patternLength - 1, 2);
  }
  Module._setDifficulty(patternLength);
}

async function startRound() {
  inputEnabled = false;
  disableTiles(true);

  Module._startPuzzle();
  sequence = loadSequenceFromWasm();
  levelValueEl.textContent = String(patternLength);

  await sleep(600);
  await flashSequence();
}

async function finishRound(roundAccuracy, userId) {
  adjustDifficulty(roundAccuracy);
  updateMetricsView();

  const avgRoundReaction =
    reactionValues.length === 0
      ? 0
      : reactionValues.reduce((sum, value) => sum + value, 0) / reactionValues.length;

  const avgRoundHesitation =
    hesitationValues.length === 0
      ? 0
      : hesitationValues.reduce((sum, value) => sum + value, 0) / hesitationValues.length;

  const payload = {
    gameName: "memory-pattern",
    userId,
    reactionTime: Number(avgRoundReaction.toFixed(2)),
    accuracy: Number(Module._getAccuracy().toFixed(2)),
    mistakes: Module._getMistakes(),
    hesitationTime: Number(avgRoundHesitation.toFixed(2)),
    level: patternLength,
    timestamp: new Date().toISOString()
  };

  const clinical = buildClinicalSummary(payload.accuracy, payload.reactionTime, payload.mistakes);
  const consistency = typeof Module._getReactionConsistency === "function"
    ? Module._getReactionConsistency()
    : null;
  const successRate = typeof Module._getSessionSuccessRate === "function"
    ? Module._getSessionSuccessRate()
    : null;
  const bestStreak = typeof Module._getBestStreak === "function"
    ? Module._getBestStreak()
    : null;

  const diagnosticExtras = [
    consistency !== null ? `Consistency ${Number(consistency).toFixed(1)}%` : "",
    successRate !== null ? `Session success ${Number(successRate).toFixed(1)}%` : "",
    bestStreak !== null ? `Best streak ${bestStreak}` : ""
  ].filter(Boolean);

  payload.diagnosis = diagnosticExtras.length
    ? `${clinical.diagnosis}. ${diagnosticExtras.join(" | ")}`
    : clinical.diagnosis;
  payload.improvementNote = `${clinical.improvement} Focus area: ${clinical.focusArea}.`;
  clinicalSummaryEl.textContent = `Diagnosis signal: ${payload.diagnosis}. Expected improvement: ${clinical.improvement} Focus area: ${clinical.focusArea}.`;

  try {
    await saveSessionMetrics(payload);
    setStatus(messageEl, "Round saved successfully.", "success");
  } catch (error) {
    console.error(error);
    setStatus(messageEl, "Round completed, but PostgreSQL save failed. Check backend API.", "error");
  }

  reactionValues = [];
  hesitationValues = [];

  await sleep(1000);
  await startRound();
}

async function handleTileClick(event) {
  if (!inputEnabled || !sessionStarted) {
    return;
  }

  const userId = userIdInput.value.trim();
  const tileIndex = Number(event.currentTarget.dataset.tile);
  const now = performance.now();
  const reactionTime = expectedIndex === 0 ? now - sequenceEndTime : now - previousClickTime;
  const hesitation = now - previousClickTime;

  previousClickTime = now;
  reactionValues.push(reactionTime);
  hesitationValues.push(hesitation);

  const result = Module._recordClick(tileIndex, reactionTime);
  expectedIndex += 1;

  event.currentTarget.classList.add("active");
  setTimeout(() => event.currentTarget.classList.remove("active"), 130);

  if (result === -1) {
    inputEnabled = false;
    disableTiles(true);
    setMessage("Mistake detected. Starting next round...");

    const roundAccuracy = (Module._getRoundAccuracy() || 0) * 100;
    await finishRound(roundAccuracy, userId);
    return;
  }

  if (result === 1) {
    inputEnabled = false;
    disableTiles(true);
    setMessage("Correct pattern. Increasing challenge...");

    const roundAccuracy = (Module._getRoundAccuracy() || 0) * 100;
    await finishRound(roundAccuracy, userId);
  }
}

function attachTileHandlers() {
  tiles.forEach((tile) => tile.addEventListener("click", handleTileClick));
}

async function startSession() {
  if (!window.wasmReady) {
    setMessage("Waiting for WebAssembly engine...");
    return;
  }

  const auth = getAuth();
  if (!auth) {
    setStatus(messageEl, "Please log in before starting a tracked session.", "error");
    return;
  }

  if (auth.role === "patient" && auth.patientId) {
    userIdInput.value = auth.patientId;
    userIdInput.readOnly = true;
  }

  const userId = userIdInput.value.trim();
  if (!userId) {
    setMessage("Please enter a patient ID.");
    return;
  }

  setButtonLoading(startBtn, true, "Starting...");

  try {
    await checkApiHealth();
  } catch (error) {
    console.error(error);
    setStatus(messageEl, "Backend API unavailable. Start PostgreSQL server and backend API first.", "error");
    setButtonLoading(startBtn, false);
    return;
  }

  Module._resetAll();
  sessionStarted = true;
  patternLength = 3;
  Module._setDifficulty(patternLength);
  updateMetricsView();
  setMessage("Session started.");

  await startRound();
  setButtonLoading(startBtn, false);
}

startBtn.addEventListener("click", startSession);
attachTileHandlers();
disableTiles(true);

document.addEventListener("wasm-ready", () => {
  setMessage("Engine ready. Enter patient ID and start.");
  clinicalSummaryEl.textContent = "After each round, NeuroPlay estimates diagnosis signals and expected improvement trajectory.";
});
