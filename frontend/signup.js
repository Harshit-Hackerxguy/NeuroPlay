import { injectAuthHeader, registerUser } from "./auth.js";
import { setButtonLoading, setStatus } from "./ui.js";

injectAuthHeader({ showDoctorNav: true });

const form = document.getElementById("signupForm");
const statusEl = document.getElementById("signupStatus");
const submitBtn = form.querySelector("button[type='submit']");
const roleEl = document.getElementById("role");
const patientIdGroup = document.getElementById("patientIdGroup");
const patientIdInput = document.getElementById("patientId");

function syncSignupFields() {
  const isPatient = roleEl.value === "patient";
  patientIdGroup.hidden = !isPatient;
  patientIdInput.required = isPatient;
}

roleEl.addEventListener("change", syncSignupFields);
syncSignupFields();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("name").value.trim();
  const role = roleEl.value;
  const patientId = document.getElementById("patientId").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  setButtonLoading(submitBtn, true, "Creating...");

  try {
    const auth = await registerUser({ name, email, password, role, patientId });
    setStatus(statusEl, "Signup successful. Redirecting...", "success");
    setTimeout(() => {
      window.location.href = auth.role === "doctor" ? "dashboard/doctor.html" : "games.html";
    }, 700);
  } catch (error) {
    setStatus(statusEl, error.message, "error");
  } finally {
    setButtonLoading(submitBtn, false);
  }
});
