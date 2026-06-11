import { neon } from "@neondatabase/serverless";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSql() {
  const connectionString = (process.env.POSTGRES_URL || process.env.DATABASE_URL || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (!connectionString) {
    throw new Error("Missing Neon connection string");
  }

  return neon(connectionString);
}

async function readBody(request) {
  if (request.headers["content-type"]?.includes("application/json")) {
    return request.body || {};
  }

  return typeof request.body === "object" && request.body !== null ? request.body : {};
}

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS bubble_paws_signups (
      id BIGSERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT NOT NULL UNIQUE,
      pet_name TEXT,
      password_hash TEXT NOT NULL,
      source TEXT DEFAULT 'website',
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const body = await readBody(request);
    const fullName = String(body.fullName || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const petName = String(body.petName || "").trim();
    const password = String(body.password || "");
    const userAgent = String(request.headers["user-agent"] || "").slice(0, 500);

    if (!fullName || !email || !password) {
      return response.status(400).json({
        ok: false,
        message: "Full name, email and password are required.",
      });
    }

    if (!emailPattern.test(email)) {
      return response.status(400).json({ ok: false, message: "Please enter a valid email address." });
    }

    if (password.length < 8) {
      return response.status(400).json({ ok: false, message: "Password must be at least 8 characters." });
    }

    const sql = getSql();
    await ensureTable(sql);

    const passwordHash = await hashPassword(password);

    const rows = await sql`
      INSERT INTO bubble_paws_signups (
        full_name,
        phone,
        email,
        pet_name,
        password_hash,
        user_agent
      )
      VALUES (
        ${fullName},
        ${phone || null},
        ${email},
        ${petName || null},
        ${passwordHash},
        ${userAgent}
      )
      RETURNING id, created_at
    `;

    return response.status(201).json({
      ok: true,
      id: rows[0].id,
      createdAt: rows[0].created_at,
    });
  } catch (error) {
    if (error?.message?.includes("duplicate key value")) {
      return response.status(409).json({
        ok: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Signup failed", error);
    return response.status(500).json({
      ok: false,
      message: "Something went wrong. Please try again.",
    });
  }
}
