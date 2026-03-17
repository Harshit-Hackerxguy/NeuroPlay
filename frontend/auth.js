const STORAGE_KEY = "neuroplay_session";
const API_BASE_URL = "http://localhost:4000/api";

export function getSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getAuth() {
  return getSession()?.user || null;
}

export function getToken() {
  return getSession()?.token || "";
}

export function setSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
}

async function authRequest(path, body, method = "POST") {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Authentication request failed.");
  }

  return payload;
}

export async function registerUser({ name, email, password, role, patientId }) {
  const nameErr = validateName(name);
  if (nameErr) throw new Error(nameErr);

  const emailErr = validateEmail(email);
  if (emailErr) throw new Error(emailErr);

  const passwordErr = validatePassword(password);
  if (passwordErr) throw new Error(passwordErr);

  const normalizedRole = String(role || "patient").trim().toLowerCase();
  if (!["patient", "doctor"].includes(normalizedRole)) {
    throw new Error("Please select a valid role.");
  }

  const resolvedPatientId = String(patientId || "").trim();
  if (normalizedRole === "patient" && !resolvedPatientId) {
    throw new Error("Patient ID is required for patient signup.");
  }

  const session = await authRequest("/auth/signup", {
    name,
    email,
    password,
    role: normalizedRole,
    patientId: normalizedRole === "patient" ? resolvedPatientId : null
  });

  setSession(session);
  return session.user;
}

export async function registerPatient({ name, email, password, patientId }) {
  return registerUser({ name, email, password, role: "patient", patientId });
}

export async function login({ email, password, role }) {
  const emailErr = validateEmail(email);
  if (emailErr) throw new Error(emailErr);
  if (!password) throw new Error("Password is required.");

  const session = await authRequest("/auth/login", { email, password, role });
  setSession(session);
  return session.user;
}

export async function fetchCurrentUser() {
  const token = getToken();
  if (!token) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    logout();
    return null;
  }

  const payload = await response.json();
  const session = getSession();
  const nextSession = {
    ...session,
    user: payload.user
  };
  setSession(nextSession);
  return payload.user;
}

export function requireDoctorAccess() {
  const auth = getAuth();
  if (!auth || auth.role !== "doctor") {
    window.location.href = "../login.html?role=doctor";
    return false;
  }
  return true;
}

export function validateEmail(value) {
  const email = String(value || "").trim();
  if (!email) return "Email is required.";
  if (!/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email address.";
  return "";
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 6) return "Password must be at least 6 characters.";
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least 1 uppercase letter and 1 number.";
  }
  return "";
}

export function validateName(value) {
  const name = String(value || "").trim();
  if (name.length < 2) return "Name must be at least 2 characters.";
  return "";
}

export function injectAuthHeader(options = {}) {
  const {
    targetId = "authArea",
    basePath = ".",
    showDoctorNav = false
  } = options;

  renderPrimaryNav(basePath);

  const holder = document.getElementById(targetId);
  if (!holder) return;

  const auth = getAuth();
  updateReportLabels(auth);
  const homeLink = `${basePath}/index.html`;
  const loginLink = `${basePath}/login.html`;
  const signupLink = `${basePath}/signup.html`;
  const doctorLink = `${basePath}/dashboard/doctor.html`;

  if (!auth) {
    holder.innerHTML = `<a class="nav-link" href="${loginLink}">Login</a><a class="nav-link" href="${signupLink}">Sign Up</a>`;
    return;
  }

  const doctorButton = auth.role === "doctor" && showDoctorNav
    ? `<a class="nav-link" href="${doctorLink}">Doctor Dashboard</a>`
    : "";

  holder.innerHTML = `${doctorButton}<span class="user-pill">${auth.name} (${auth.role})</span><button id="logoutBtn" class="nav-link nav-link-button">Logout</button>`;
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn?.addEventListener("click", () => {
    logout();
    window.location.href = homeLink;
  });
}

function renderPrimaryNav(basePath) {
  const nav = document.querySelector(".nav-links");
  if (!nav) return;

  const auth = getAuth();
  const reportLabel = auth?.role === "doctor" ? "Patient Report" : "My Report";

  const items = [
    { href: `${basePath}/index.html`, label: "Home" },
    { href: `${basePath}/games.html`, label: "Games" },
    { href: `${basePath}/index.html#about-us`, label: "About Us" },
    { href: `${basePath}/patient-report.html`, label: reportLabel, report: true }
  ];

  nav.innerHTML = items
    .map((item) => `<a class="nav-link" ${item.report ? "data-report-link=\"true\"" : ""} href="${item.href}">${item.label}</a>`)
    .join("");
}

function updateReportLabels(auth) {
  const reportLabel = auth?.role === "doctor" ? "Patient Report" : "My Report";
  document.querySelectorAll("[data-report-link='true']").forEach((el) => {
    el.textContent = reportLabel;
  });
}
