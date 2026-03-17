import { saveSessionMetrics } from "../api.js";
import { getAuth, injectAuthHeader } from "../auth.js";
import { setStatus } from "../ui.js";

const startBtn = document.getElementById("reactionStart");
const targetBtn = document.getElementById("reactionTarget");
const userIdInput = document.getElementById("reactionUserId");
const attemptsEl = document.getElementById("attempts");
const fastestEl = document.getElementById("fastest");
const averageEl = document.getElementById("average");
const messageEl = document.getElementById("reactionMessage");
const clinicalEl = document.getElementById("reactionClinical");

let startTime = 0;
let isArmed = false;
let timerId = null;
let rounds = [];

injectAuthHeader({ basePath: "..", showDoctorNav: true });

const auth = getAuth();
if (auth?.role === "patient" && auth.patientId) {
  userIdInput.value = auth.patientId;
  userIdInput.readOnly = true;
}

function setMessage(text) {
  setStatus(messageEl, text, "info");
}

function renderStats() {
  attemptsEl.textContent = String(rounds.length);
  if (!rounds.length) {
    fastestEl.textContent = "0 ms";
    averageEl.textContent = "0 ms";
    return;
  }

  const fastest = Math.min(...rounds);
  const avg = rounds.reduce((sum, v) => sum + v, 0) / rounds.length;
  fastestEl.textContent = `${fastest.toFixed(0)} ms`;
  averageEl.textContent = `${avg.toFixed(0)} ms`;
}

function evaluateReaction(avg) {
  if (avg < 350) {
    return {
      diagnosis: "Normal motor response profile",
      improvement: "Sustain speed while adding dual-task distractions next week."
    };
  }

  if (avg < 600) {
    return {
      diagnosis: "Mild psychomotor slowing",
      improvement: "Daily reaction drills should improve initiation speed and consistency."
    };
  }

  return {
    diagnosis: "Moderate psychomotor delay",
    improvement: "Structured cueing and shorter repeated sessions are recommended."
  };
}

function resetTarget() {
  isArmed = false;
  targetBtn.disabled = true;
  targetBtn.textContent = "Wait for green...";
  targetBtn.classList.remove("go");
}

function armTarget() {
  targetBtn.disabled = false;
  targetBtn.classList.add("go");
  targetBtn.textContent = "CLICK NOW";
  isArmed = true;
  startTime = performance.now();
}

async function completeSessionIfNeeded(userId) {
  if (rounds.length < 5) {
    return;
  }

  const avg = rounds.reduce((sum, v) => sum + v, 0) / rounds.length;
  const { diagnosis, improvement } = evaluateReaction(avg);

  clinicalEl.textContent = `Diagnosis signal: ${diagnosis}. Expected improvement: ${improvement}`;

  await saveSessionMetrics({
    userId,
    gameName: "reaction-sprint",
    reactionTime: Number(avg.toFixed(2)),
    accuracy: 100,
    mistakes: 0,
    hesitationTime: 0,
    level: 1,
    diagnosis,
    improvementNote: improvement
  });

  setStatus(messageEl, "Session saved to PostgreSQL after 5 attempts.", "success");
}

startBtn.addEventListener("click", () => {
  if (!auth) {
    setStatus(messageEl, "Please log in before starting a tracked session.", "error");
    return;
  }

  const userId = userIdInput.value.trim();
  if (!userId) {
    setMessage("Please enter patient ID.");
    return;
  }

  clinicalEl.textContent = "";
  setMessage("Get ready...");

  resetTarget();
  clearTimeout(timerId);

  timerId = setTimeout(() => {
    armTarget();
  }, 1000 + Math.random() * 2000);
});

targetBtn.addEventListener("click", async () => {
  if (!isArmed) {
    return;
  }

  const userId = userIdInput.value.trim();
  const reactionMs = performance.now() - startTime;
  rounds.push(reactionMs);

  renderStats();
  setMessage(`Reaction captured: ${reactionMs.toFixed(0)} ms`);
  resetTarget();

  try {
    await completeSessionIfNeeded(userId);
  } catch (error) {
    console.error(error);
    setStatus(messageEl, "PostgreSQL save failed. Check backend server.", "error");
  }
});
