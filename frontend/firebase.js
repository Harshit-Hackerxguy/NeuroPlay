// Compatibility module retained for older imports.
// Data persistence now runs through PostgreSQL backend API.
export { checkApiHealth as initFirebase, saveSessionMetrics, fetchPatientSessions } from "./api.js";
