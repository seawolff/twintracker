/**
 * Email sending utility.
 *
 * Configured via env vars:
 *   SMTP_HOST     – if absent (or blank), verification links are logged to console (dev mode)
 *   SMTP_PORT     – default 587
 *   SMTP_SECURE   – "true" for port 465/TLS, default false (STARTTLS)
 *   SMTP_USER     – SMTP auth username
 *   SMTP_PASS     – SMTP auth password
 *   SMTP_FROM     – From address, default noreply@twintracker.app
 *   APP_URL       – Base URL for verification links, default http://localhost:3001
 *
 * nodemailer is loaded via require() so the module compiles and tests run even
 * when the package is not yet installed locally (it is installed inside Docker).
 */

const resendApiKey = process.env.RESEND_API_KEY;
const smtpHost = process.env.SMTP_HOST;
const appUrl = process.env.APP_URL ?? 'http://localhost:3001';
const fromAddress = process.env.SMTP_FROM ?? 'noreply@twintracker.app';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let resendClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transporter: any = null;

if (resendApiKey) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Resend } = require('resend');
    resendClient = new Resend(resendApiKey);
  } catch {
    console.warn('[Email] resend package not available — falling back to console logging');
  }
} else if (smtpHost) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
    const nodemailer: any = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } catch {
    console.warn('[Email] nodemailer not available — falling back to console logging');
  }
}

const htmlBody = (link: string) => `
  <p>Hi there,</p>
  <p>Click the button below to verify your TwinTracker email address:</p>
  <p style="margin:24px 0">
    <a href="${link}" style="background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:monospace">
      Verify email
    </a>
  </p>
  <p style="color:#888;font-size:13px">Or paste this link: ${link}</p>
  <p style="color:#888;font-size:13px">This link expires in 24 hours.</p>
`;

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const link = `${appUrl}/verify-email?token=${token}`;

  if (resendClient) {
    await resendClient.emails.send({
      from: fromAddress,
      to: email,
      subject: 'Verify your TwinTracker email',
      text: `Click the link below to verify your email address:\n\n${link}\n\nThis link expires in 24 hours.`,
      html: htmlBody(link),
    });
    return;
  }

  if (transporter) {
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Verify your TwinTracker email',
      text: `Click the link below to verify your email address:\n\n${link}\n\nThis link expires in 24 hours.`,
      html: htmlBody(link),
    });
    return;
  }

  // Dev mode: no email provider configured — log the link so devs can click it directly.
  console.log(`[DEV] Email verification link for ${email}:\n  ${link}`);
}
