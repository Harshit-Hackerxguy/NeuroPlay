import { injectAuthHeader, login } from "./auth.js";
import { setButtonLoading, setStatus } from "./ui.js";

injectAuthHeader({ showDoctorNav: true });

const form = document.getElementById("loginForm");
const statusEl = document.getElementById("loginStatus");
const roleEl = document.getElementById("role");
const submitBtn = form.querySelector("button[type='submit']");

const params = new URLSearchParams(window.location.search);
const forcedRole = params.get("role");
if (forcedRole === "doctor") {
  roleEl.value = "doctor";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const role = roleEl.value;
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    setStatus(statusEl, "Please fill in all fields.", "error");
    return;
  }

  setButtonLoading(submitBtn, true, "Signing in...");

  try {
    const auth = await login({ email, password, role });
    setStatus(statusEl, `Logged in as ${auth.name}. Redirecting...`, "success");

    if (auth.role === "doctor") {
      window.location.href = "dashboard/doctor.html";
      return;
    }

    window.location.href = "games.html";
  } catch (error) {
    setStatus(statusEl, error.message, "error");
  } finally {
    setButtonLoading(submitBtn, false);
  }
});
