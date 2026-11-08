import "dotenv/config";
import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing in server/.env");
  return secret;
}
getSecret(); // fail early at startup if it's missing

function makeToken(userId: number): string {
  return jwt.sign({ userId }, getSecret(), { expiresIn: "7d" });
}

function validCredentials(email: unknown, password: unknown) {
  return (
    typeof email === "string" &&
    email.includes("@") &&
    typeof password === "string" &&
    password.length >= 8
  );
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!validCredentials(email, password)) {
    res.status(400).json({ error: "a valid email and a password of 8+ characters are required" });
    return;
  }
  const cleanEmail = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [cleanEmail, hash]
    );
    res.status(201).json({ token: makeToken(rows[0].id), user: rows[0] });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "email already registered" });
      return;
    }
    throw err;
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  const { rows } = await pool.query(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email.trim().toLowerCase()]
  );
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    // Same message for "no such email" and "wrong password" on purpose
    res.status(401).json({ error: "invalid email or password" });
    return;
  }
  res.json({ token: makeToken(user.id), user: { id: user.id, email: user.email } });
});

// Put this before any route that needs a logged-in user
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "login required" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), getSecret()) as { userId: number };
    res.locals.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}