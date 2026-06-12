import { neon } from "@neondatabase/serverless";
import nodemailer from "nodemailer";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const defaultFromEmail = "info@saradaryaei.be";

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

function getEmailConfig() {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASSWORD || "").trim();
  const from = (process.env.CONTACT_FROM_EMAIL || user || defaultFromEmail).trim();

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
    auth: { user, pass },
    from,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateNl(dateText) {
  if (!dateText) return "";
  return new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "long",
    timeZone: "Europe/Brussels",
  }).format(new Date(`${dateText}T12:00:00.000Z`));
}

function buildConfirmationEmail({ fullName, appointmentDate }) {
  const safeName = escapeHtml(fullName);
  const formattedDate = appointmentDate ? formatDateNl(appointmentDate) : "";
  const dateLine = formattedDate
    ? `Uw afspraakdatum: ${formattedDate}`
    : "We nemen binnenkort contact met u op om de afspraak verder te bevestigen.";

  const text = [
    `Beste ${fullName},`,
    "",
    "Bedankt dat u voor ons heeft gekozen.",
    "Uw afspraak is gereserveerd.",
    dateLine,
    "",
    "Met vriendelijke groet,",
    "Bubble Paws",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2b2926;max-width:560px">
      <h1 style="font-size:22px;margin:0 0 16px;color:#8b5e34">Bubble Paws</h1>
      <p>Beste ${safeName},</p>
      <p>Bedankt dat u voor ons heeft gekozen.</p>
      <p><strong>Uw afspraak is gereserveerd.</strong></p>
      <p>${escapeHtml(dateLine)}</p>
      <p style="margin-top:24px">Met vriendelijke groet,<br />Bubble Paws</p>
    </div>
  `;

  return {
    subject: "Uw afspraak is gereserveerd - Bubble Paws",
    text,
    html,
  };
}

async function sendConfirmationEmail(details) {
  const config = getEmailConfig();

  if (!config) {
    console.warn("Confirmation email skipped: SMTP environment variables are not configured.");
    return { sent: false, reason: "missing_email_config" };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  const emailContent = buildConfirmationEmail(details);

  await transporter.sendMail({
    from: `"Bubble Paws" <${config.from}>`,
    to: details.email,
    replyTo: config.from,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });

  return { sent: true };
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

    const confirmationEmail = await sendConfirmationEmail({
      fullName,
      email,
      appointmentDate,
    });

    return response.status(201).json({
      ok: true,
      id: rows[0].id,
      createdAt: rows[0].created_at,
      confirmationEmailSent: confirmationEmail.sent,
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
