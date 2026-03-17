import { saveSessionMetrics } from "../api.js";
import { getAuth, injectAuthHeader } from "../auth.js";
import { setStatus } from "../ui.js";

injectAuthHeader({ basePath: "..", showDoctorNav: true });

const startBtn = document.getElementById("mathStart");
const submitBtn = document.getElementById("mathSubmit");
const userIdInput = document.getElementById("mathUserId");
const qEl = document.getElementById("mathQuestion");
const answerEl = document.getElementById("mathAnswer");
const statusEl = document.getElementById("mathStatus");
const clinicalEl = document.getElementById("mathClinical");

const qCountEl = document.getElementById("mathQ");
const correctEl = document.getElementById("mathCorrect");
const accuracyEl = document.getElementById("mathAccuracy");
const avgTimeEl = document.getElementById("mathTime");
const mistakesEl = document.getElementById("mathMistakes");

const auth = getAuth();
if (auth?.role === "patient" && auth.patientId) {
  userIdInput.value = auth.patientId;
  userIdInput.readOnly = true;
}

let currentAnswer = null;
let questionStart = 0;
let total = 0;
let correct = 0;
let mistakes = 0;
let reactionTimes = [];
let active = false;

function newQuestion() {
  const a = Math.floor(Math.random() * 15) + 1;
  const b = Math.floor(Math.random() * 15) + 1;
  const op = Math.random() > 0.5 ? "+" : "-";

  currentAnswer = op === "+" ? a + b : a - b;
  qEl.textContent = `${a} ${op} ${b} = ?`;
  answerEl.value = "";
  answerEl.focus();
  questionStart = performance.now();
}

function updateStats() {
  const avg = reactionTimes.length
    ? reactionTimes.reduce((sum, v) => sum + v, 0) / reactionTimes.length
    : 0;
  const acc = total ? (correct / total) * 100 : 0;

  qCountEl.textContent = String(total);
  correctEl.textContent = String(correct);
  accuracyEl.textContent = `${acc.toFixed(1)}%`;
  avgTimeEl.textContent = `${avg.toFixed(0)} ms`;
  mistakesEl.textContent = String(mistakes);
}

function evaluateSession() {
  const avg = reactionTimes.length
    ? reactionTimes.reduce((sum, v) => sum + v, 0) / reactionTimes.length
    : 0;
  const acc = total ? (correct / total) * 100 : 0;

  if (acc >= 85 && avg < 2500) {
    return {
      diagnosis: "Strong cognitive processing speed and arithmetic working memory",
      improvement: "Introduce dual-task arithmetic under mild distraction to extend resilience."
    };
  }

  if (acc >= 60) {
    return {
      diagnosis: "Moderate processing delay under rapid cognitive load",
      improvement: "Short daily math-reflex blocks can improve focus and decision velocity."
    };
  }

  return {
    diagnosis: "Reduced processing speed and working-memory accuracy",
    improvement: "Use slower paced guided arithmetic sessions with frequent cueing."
  };
}

async function finishIfNeeded() {
  if (total < 8) {
    newQuestion();
    return;
  }

  active = false;
  const userId = userIdInput.value.trim();
  const avg = reactionTimes.reduce((sum, v) => sum + v, 0) / reactionTimes.length;
  const acc = (correct / total) * 100;
  const { diagnosis, improvement } = evaluateSession();

  clinicalEl.textContent = `Diagnosis signal: ${diagnosis}. Expected improvement: ${improvement}`;

  await saveSessionMetrics({
    userId,
    gameName: "neon-math-reflex",
    reactionTime: Number(avg.toFixed(2)),
    accuracy: Number(acc.toFixed(2)),
    mistakes,
    hesitationTime: Number(avg.toFixed(2)),
    level: 1,
    diagnosis,
    improvementNote: improvement
  });

  setStatus(statusEl, "Math reflex session complete and saved.", "success");
}

startBtn.addEventListener("click", () => {
  if (!auth) {
    setStatus(statusEl, "Please log in before starting a tracked session.", "error");
    return;
  }

  const userId = userIdInput.value.trim();
  if (!userId) {
    setStatus(statusEl, "Please enter patient ID.", "error");
    return;
  }

  total = 0;
  correct = 0;
  mistakes = 0;
  reactionTimes = [];
  active = true;
  clinicalEl.textContent = "";
  updateStats();
  setStatus(statusEl, "Solve 8 questions as fast as possible.", "info");
  newQuestion();
});

submitBtn.addEventListener("click", async () => {
  if (!active || currentAnswer === null) {
    return;
  }

  const input = Number(answerEl.value);
  total += 1;

  if (input === currentAnswer) {
    correct += 1;
  } else {
    mistakes += 1;
  }

  reactionTimes.push(performance.now() - questionStart);
  updateStats();

  try {
    await finishIfNeeded();
  } catch (error) {
    console.error(error);
    setStatus(statusEl, "Failed to save. Check backend API.", "error");
  }
});
