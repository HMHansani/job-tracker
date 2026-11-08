import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool, initDb } from "./db";
import { authRouter, requireAuth } from "./auth";

const STATUSES = ["applied", "interview", "offer", "rejected"];

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

// Every route below needs a valid token
app.use("/api/jobs", requireAuth);

app.get("/api/jobs", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC",
    [res.locals.userId]
  );
  res.json(rows);
});

app.post("/api/jobs", async (req, res) => {
  const { company, position, status = "applied", location, link, notes } = req.body;
  if (!company || !position) {
    res.status(400).json({ error: "company and position are required" });
    return;
  }
  if (!STATUSES.includes(status)) {
    res.status(400).json({ error: "invalid status" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO jobs (user_id, company, position, status, location, link, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [res.locals.userId, company, position, status, location, link, notes]
  );
  res.status(201).json(rows[0]);
});

app.put("/api/jobs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { company, position, status, location, link, notes } = req.body;
  if (status !== undefined && !STATUSES.includes(status)) {
    res.status(400).json({ error: "invalid status" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE jobs SET
       company = COALESCE($1, company),
       position = COALESCE($2, position),
       status = COALESCE($3, status),
       location = COALESCE($4, location),
       link = COALESCE($5, link),
       notes = COALESCE($6, notes)
     WHERE id = $7 AND user_id = $8 RETURNING *`,
    [company, position, status, location, link, notes, id, res.locals.userId]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  res.json(rows[0]);
});

app.delete("/api/jobs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const result = await pool.query(
    "DELETE FROM jobs WHERE id = $1 AND user_id = $2",
    [id, res.locals.userId]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  res.sendStatus(204);
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "something went wrong" });
});

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });