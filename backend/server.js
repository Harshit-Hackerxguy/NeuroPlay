import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { runQuery } from "./db.js";
import { comparePassword, hashPassword, sanitizeUser, signToken, verifyToken } from "./security.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

if (!process.env.JWT_SECRET) {
  throw new Error("Missing JWT_SECRET. Configure backend/.env before starting the server.");
}

app.use(cors());
app.use(express.json());

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }
  return authHeader.slice(7);
}

function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions." });
    }
    return next();
  };
}

function buildSessionResponse(row) {
  const user = sanitizeUser(row);
  return {
    token: signToken(user),
    user
  };
}

app.get("/api/health", async (_req, res) => {
  try {
    await runQuery("SELECT 1");
    res.json({ ok: true, message: "API and PostgreSQL are reachable" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Database connection failed", error: error.message });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password, patientId, role = "patient" } = req.body;
  const normalizedRole = String(role || "").trim().toLowerCase();

  if (!name || !email || !password || !normalizedRole) {
    return res.status(400).json({ message: "name, email, password, and role are required." });
  }

  if (!["patient", "doctor"].includes(normalizedRole)) {
    return res.status(400).json({ message: "Role must be either patient or doctor." });
  }

  const resolvedPatientId = normalizedRole === "patient" ? String(patientId || "").trim() : null;
  if (normalizedRole === "patient" && !resolvedPatientId) {
    return res.status(400).json({ message: "patientId is required for patient signup." });
  }

  try {
    const existing = normalizedRole === "patient"
      ? await runQuery(
        "SELECT id FROM app_users WHERE email = $1 OR patient_id = $2",
        [email, resolvedPatientId]
      )
      : await runQuery(
        "SELECT id FROM app_users WHERE email = $1",
        [email]
      );

    if (existing.rowCount > 0) {
      return res.status(409).json({ message: normalizedRole === "patient" ? "Email or patient ID already exists." : "Email already exists." });
    }

    const passwordHash = await hashPassword(password);
    const result = await runQuery(
      `INSERT INTO app_users (name, email, password_hash, role, patient_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, patient_id`,
      [name, email, passwordHash, normalizedRole, resolvedPatientId]
    );

    return res.status(201).json(buildSessionResponse(result.rows[0]));
  } catch (error) {
    return res.status(500).json({ message: "Failed to create account.", error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: "email, password, and role are required." });
  }

  try {
    const result = await runQuery(
      `SELECT id, name, email, password_hash, role, patient_id
       FROM app_users WHERE email = $1 AND role = $2`,
      [email, role]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const row = result.rows[0];
    const valid = await comparePassword(password, row.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    return res.json(buildSessionResponse(row));
  } catch (error) {
    return res.status(500).json({ message: "Login failed.", error: error.message });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const result = await runQuery(
      `SELECT id, name, email, role, patient_id
       FROM app_users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load session.", error: error.message });
  }
});

app.post("/api/sessions", requireAuth, async (req, res) => {
  const {
    userId,
    gameName,
    reactionTime,
    accuracy,
    mistakes,
    hesitationTime,
    level,
    diagnosis,
    improvementNote
  } = req.body;

  const resolvedUserId = req.user.role === "patient" ? req.user.patientId : userId;

  if (!resolvedUserId || !gameName) {
    return res.status(400).json({ message: "userId and gameName are required." });
  }

  try {
    const result = await runQuery(
      `INSERT INTO game_sessions
      (user_id, game_name, reaction_time, accuracy, mistakes, hesitation_time, level, diagnosis, improvement_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id, user_id, game_name, reaction_time, accuracy, mistakes, hesitation_time, level, diagnosis, improvement_note, created_at`,
      [
        resolvedUserId,
        gameName,
        Number(reactionTime || 0),
        Number(accuracy || 0),
        Number(mistakes || 0),
        Number(hesitationTime || 0),
        Number(level || 1),
        diagnosis || null,
        improvementNote || null
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: "Failed to save session", error: error.message });
  }
});

app.get("/api/sessions", requireAuth, requireRole("doctor"), async (req, res) => {
  const { userId, gameName, limit } = req.query;
  const values = [];
  const filters = [];

  if (userId) {
    values.push(userId);
    filters.push(`user_id = $${values.length}`);
  }

  if (gameName) {
    values.push(gameName);
    filters.push(`game_name = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  let limitClause = "";

  if (limit) {
    values.push(Number(limit));
    limitClause = `LIMIT $${values.length}`;
  }

  try {
    const result = await runQuery(
      `SELECT
        id,
        user_id AS "userId",
        game_name AS "gameName",
        reaction_time AS "reactionTime",
        accuracy,
        mistakes,
        hesitation_time AS "hesitationTime",
        level,
        diagnosis,
        improvement_note AS "improvementNote",
        created_at AS "timestamp"
      FROM game_sessions
      ${whereClause}
      ORDER BY created_at ASC
      ${limitClause}`,
      values
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch sessions", error: error.message });
  }
});

app.get("/api/my-sessions", requireAuth, async (req, res) => {
  const { gameName, limit } = req.query;
  const values = [req.user.patientId];
  const filters = [`user_id = $1`];

  if (!req.user.patientId) {
    return res.status(400).json({ message: "Patient profile is missing a patient ID." });
  }

  if (gameName) {
    values.push(gameName);
    filters.push(`game_name = $${values.length}`);
  }

  let limitClause = "";
  if (limit) {
    values.push(Number(limit));
    limitClause = `LIMIT $${values.length}`;
  }

  try {
    const result = await runQuery(
      `SELECT
        id,
        user_id AS "userId",
        game_name AS "gameName",
        reaction_time AS "reactionTime",
        accuracy,
        mistakes,
        hesitation_time AS "hesitationTime",
        level,
        diagnosis,
        improvement_note AS "improvementNote",
        created_at AS "timestamp"
      FROM game_sessions
      WHERE ${filters.join(" AND ")}
      ORDER BY created_at ASC
      ${limitClause}`,
      values
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch patient sessions", error: error.message });
  }
});

app.listen(port, () => {
  console.log(`NeuroPlay API running on http://localhost:${port}`);
});
