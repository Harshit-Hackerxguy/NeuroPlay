import { saveSessionMetrics } from "../api.js";
import { getAuth, injectAuthHeader } from "../auth.js";
import { setStatus } from "../ui.js";

const startBtn = document.getElementById("attentionStart");
const gridEl = document.getElementById("attentionGrid");
const userIdInput = document.getElementById("attentionUserId");
const hitsEl = document.getElementById("hits");
const missesEl = document.getElementById("misses");
const accEl = document.getElementById("attentionAccuracy");
const msgEl = document.getElementById("attentionMessage");
const clinicalEl = document.getElementById("attentionClinical");

let hits = 0;
let misses = 0;
let totalRounds = 0;
let activeIndex = -1;
let timer = null;
let roundStart = 0;
let reactionTimes = [];

injectAuthHeader({ basePath: "..", showDoctorNav: true });

const auth = getAuth();
if (auth?.role === "patient" && auth.patientId) {
  userIdInput.value = auth.patientId;
  userIdInput.readOnly = true;
}

function setMessage(text) {
  setStatus(msgEl, text, "info");
}

function renderStats() {
  const attempts = hits + misses;
  const accuracy = attempts ? (hits / attempts) * 100 : 0;

  hitsEl.textContent = String(hits);
  missesEl.textContent = String(misses);
  accEl.textContent = `${accuracy.toFixed(1)}%`;
}

function makeGrid() {
  gridEl.innerHTML = "";
  for (let i = 0; i < 9; i += 1) {
    const btn = document.createElement("button");
    btn.className = "attention-cell";
    btn.dataset.index = String(i);
    btn.addEventListener("click", () => onCellClick(i));
    gridEl.appendChild(btn);
  }
}

function activateRandomCell() {
  const cells = Array.from(document.querySelectorAll(".attention-cell"));
  cells.forEach((cell) => cell.classList.remove("active"));

  activeIndex = Math.floor(Math.random() * cells.length);
  cells[activeIndex].classList.add("active");
  roundStart = performance.now();
}

function evaluate(accuracy, avgReaction) {
  if (accuracy >= 85 && avgReaction < 900) {
    return {
      diagnosis: "Good sustained attention and visual scanning",
      improvement: "Increase distractor density to build higher cognitive endurance."
    };
  }

  if (accuracy >= 60) {
    return {
      diagnosis: "Mild attention instability",
      improvement: "Regular 10-minute grid drills can improve focus persistence."
    };
  }

  return {
    diagnosis: "Significant sustained-attention deficit",
    improvement: "Use shorter supervised sessions with cue-based prompting."
  };
}

async function finishTest(userId) {
  const attempts = hits + misses;
  const accuracy = attempts ? (hits / attempts) * 100 : 0;
  const avgReaction = reactionTimes.length
    ? reactionTimes.reduce((sum, v) => sum + v, 0) / reactionTimes.length
    : 0;

  const { diagnosis, improvement } = evaluate(accuracy, avgReaction);
  clinicalEl.textContent = `Diagnosis signal: ${diagnosis}. Expected improvement: ${improvement}`;

  await saveSessionMetrics({
    userId,
    gameName: "attention-grid",
    reactionTime: Number(avgReaction.toFixed(2)),
    accuracy: Number(accuracy.toFixed(2)),
    mistakes: misses,
    hesitationTime: Number(avgReaction.toFixed(2)),
    level: 1,
    diagnosis,
    improvementNote: improvement
  });

  setStatus(msgEl, "Attention session complete and saved to PostgreSQL.", "success");
}

function onCellClick(index) {
  if (activeIndex === -1) {
    return;
  }

  if (index === activeIndex) {
    hits += 1;
    reactionTimes.push(performance.now() - roundStart);
  } else {
    misses += 1;
  }

  totalRounds += 1;
  renderStats();

  if (totalRounds >= 12) {
    clearInterval(timer);
    activeIndex = -1;
    const userId = userIdInput.value.trim();
    finishTest(userId).catch((error) => {
      console.error(error);
      setStatus(msgEl, "Save failed. Check backend server.", "error");
    });
    return;
  }

  activateRandomCell();
}

startBtn.addEventListener("click", () => {
  if (!auth) {
    setStatus(msgEl, "Please log in before starting a tracked session.", "error");
    return;
  }

  const userId = userIdInput.value.trim();
  if (!userId) {
    setMessage("Please enter patient ID.");
    return;
  }

  hits = 0;
  misses = 0;
  totalRounds = 0;
  reactionTimes = [];
  clinicalEl.textContent = "";
  renderStats();
  makeGrid();
  activateRandomCell();
  setMessage("Tap highlighted cells quickly. 12 rounds total.");

  clearInterval(timer);
  timer = setInterval(() => {
    misses += 1;
    totalRounds += 1;
    renderStats();

    if (totalRounds >= 12) {
      clearInterval(timer);
      activeIndex = -1;
      finishTest(userId).catch((error) => {
        console.error(error);
        setStatus(msgEl, "Save failed. Check backend server.", "error");
      });
    } else {
      activateRandomCell();
    }
  }, 1800);
});
