import { neon } from "@neondatabase/serverless";

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
    CREATE TABLE IF NOT EXISTS bubble_paws_contact_messages (
      id BIGSERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      service_type TEXT NOT NULL,
      appointment_date DATE,
      message TEXT NOT NULL,
      contact_method TEXT NOT NULL DEFAULT 'email',
      source TEXT DEFAULT 'website',
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

function parseAppointmentDate(value) {
  const dateText = String(value || "").trim();
  if (!dateText) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new Error("Please choose a valid appointment date.");
  }

  return dateText;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const body = await readBody(request);
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const serviceType = String(body.serviceType || "").trim();
    const appointmentDate = parseAppointmentDate(body.appointmentDate);
    const message = String(body.message || "").trim();
    const contactMethod = String(body.contactMethod || "email").trim().slice(0, 20);
    const userAgent = String(request.headers["user-agent"] || "").slice(0, 500);

    if (!fullName || !email || !serviceType || !message) {
      return response.status(400).json({
        ok: false,
        message: "Full name, email, service and message are required.",
      });
    }

    if (!emailPattern.test(email)) {
      return response.status(400).json({ ok: false, message: "Please enter a valid email address." });
    }

    const sql = getSql();
    await ensureTable(sql);

    const rows = await sql`
      INSERT INTO bubble_paws_contact_messages (
        full_name,
        email,
        phone,
        service_type,
        appointment_date,
        message,
        contact_method,
        user_agent
      )
      VALUES (
        ${fullName},
        ${email},
        ${phone || null},
        ${serviceType},
        ${appointmentDate},
        ${message},
        ${contactMethod || "email"},
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
    if (error.message?.includes("appointment date")) {
      return response.status(400).json({ ok: false, message: error.message });
    }

    console.error("Contact message failed", error);
    return response.status(500).json({
      ok: false,
      message: "Something went wrong. Please try again.",
    });
  }
}
