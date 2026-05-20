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
 *
 * Translations are inlined here — packages/core is not available inside the Docker
 * container which only mounts the api/ directory. Keep these in sync with
 * packages/core/src/i18n/*.json (email section).
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

// ── i18n helpers ──────────────────────────────────────────────────────────────

interface EmailStrings {
  verify_subject: string;
  verify_heading: string;
  verify_body: string;
  verify_cta: string;
  verify_expiry: string;
  verify_link_fallback: string;
  verify_plain: string;
}

const TRANSLATIONS: Record<string, EmailStrings> = {
  en: {
    verify_subject: 'Verify your TwinTracker email',
    verify_heading: 'Verify your email address',
    verify_body:
      'Thanks for signing up. Click the button below to confirm your email address and unlock your account.',
    verify_cta: 'Verify email address',
    verify_expiry:
      "This link expires in 24 hours. If you didn't create a TwinTracker account, you can safely ignore this email.",
    verify_link_fallback: 'Or copy this link:',
    verify_plain:
      'Click the link below to verify your email address:\n\n{{link}}\n\nThis link expires in 24 hours.',
  },
  de: {
    verify_subject: 'Bestätige deine TwinTracker-E-Mail',
    verify_heading: 'Bestätige deine E-Mail-Adresse',
    verify_body:
      'Danke für deine Registrierung. Klicke auf den Button unten, um deine E-Mail-Adresse zu bestätigen und dein Konto freizuschalten.',
    verify_cta: 'E-Mail-Adresse bestätigen',
    verify_expiry:
      'Dieser Link läuft in 24 Stunden ab. Wenn du kein TwinTracker-Konto erstellt hast, kannst du diese E-Mail ignorieren.',
    verify_link_fallback: 'Oder kopiere diesen Link:',
    verify_plain:
      'Klicke auf den Link unten, um deine E-Mail-Adresse zu bestätigen:\n\n{{link}}\n\nDieser Link läuft in 24 Stunden ab.',
  },
  fr: {
    verify_subject: 'Vérifiez votre adresse email TwinTracker',
    verify_heading: 'Vérifiez votre adresse email',
    verify_body:
      'Merci de vous être inscrit. Cliquez sur le bouton ci-dessous pour confirmer votre adresse email et activer votre compte.',
    verify_cta: "Vérifier l'adresse email",
    verify_expiry:
      "Ce lien expire dans 24 heures. Si vous n'avez pas créé de compte TwinTracker, vous pouvez ignorer cet email.",
    verify_link_fallback: 'Ou copiez ce lien :',
    verify_plain:
      'Cliquez sur le lien ci-dessous pour vérifier votre adresse email :\n\n{{link}}\n\nCe lien expire dans 24 heures.',
  },
  es: {
    verify_subject: 'Verifica tu correo de TwinTracker',
    verify_heading: 'Verifica tu dirección de correo',
    verify_body:
      'Gracias por registrarte. Haz clic en el botón de abajo para confirmar tu dirección de correo y activar tu cuenta.',
    verify_cta: 'Verificar dirección de correo',
    verify_expiry:
      'Este enlace expira en 24 horas. Si no creaste una cuenta de TwinTracker, puedes ignorar este correo.',
    verify_link_fallback: 'O copia este enlace:',
    verify_plain:
      'Haz clic en el enlace de abajo para verificar tu dirección de correo:\n\n{{link}}\n\nEste enlace expira en 24 horas.',
  },
};

type Locale = keyof typeof TRANSLATIONS;

/** Resolve the best-match locale from an Accept-Language value or plain tag. */
function resolveLocale(locale: string = 'en'): Locale {
  const tag = locale.slice(0, 2).toLowerCase() as Locale;
  return tag in TRANSLATIONS ? tag : 'en';
}

function t(locale: Locale, key: keyof EmailStrings): string {
  return (TRANSLATIONS[locale] ?? TRANSLATIONS['en'])[key];
}

// ── Email templates ───────────────────────────────────────────────────────────

function htmlBody(link: string, locale: Locale): string {
  const iconUrl = `${appUrl}/icon-192.png`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t(locale, 'verify_subject')}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@800&family=DM+Mono:wght@400;500&display=swap');
  </style>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e0e0e0;">

          <!-- Header / wordmark -->
          <tr>
            <td style="padding:40px 48px 32px;border-bottom:1px solid #e0e0e0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <img src="${iconUrl}" width="40" height="40"
                         alt="TwinTracker" style="display:block;border-radius:9px;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:800;color:#000000;letter-spacing:-0.5px;line-height:1;">
                      TwinTracker
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 48px 32px;">
              <h1 style="margin:0 0 16px;font-family:'Fraunces',Georgia,serif;font-size:22px;font-weight:800;color:#000000;letter-spacing:-0.3px;line-height:1.2;">
                ${t(locale, 'verify_heading')}
              </h1>
              <p style="margin:0 0 32px;font-family:'DM Mono','Courier New',monospace;font-size:14px;color:#555555;line-height:1.7;">
                ${t(locale, 'verify_body')}
              </p>

              <!-- CTA button -->
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:999px;background:#000000;">
                    <a href="${link}"
                       style="display:inline-block;padding:14px 32px;font-family:'DM Mono','Courier New',monospace;font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:0.2px;border-radius:999px;">
                      ${t(locale, 'verify_cta')}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 48px 40px;border-top:1px solid #e0e0e0;">
              <p style="margin:0 0 8px;font-family:'DM Mono','Courier New',monospace;font-size:12px;color:#aaaaaa;line-height:1.6;">
                ${t(locale, 'verify_expiry')}
              </p>
              <p style="margin:0;font-family:'DM Mono','Courier New',monospace;font-size:11px;color:#aaaaaa;line-height:1.6;word-break:break-all;">
                ${t(locale, 'verify_link_fallback')} ${link}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function plainBody(link: string, locale: Locale): string {
  return t(locale, 'verify_plain').replace('{{link}}', link);
}

interface ChildStageDigestEmailParams {
  email: string;
  recipientName: string | null;
  babyName: string;
  ageLabel: string;
  stageTitle: string;
  stageSummary: string;
  expectations: string[];
  milestoneBullets: string[];
  trendBullets: string[];
  locale?: string;
}

function listItems(items: string[]): string {
  return items.map(item => `<li>${item}</li>`).join('');
}

function welcomeHtmlBody(link: string, _locale: string = 'en', name?: string | null): string {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const founderAvatarUrl = `${appUrl}/wolff.jpg`;

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e0e0e0;border-radius:16px;padding:40px;">
          <tr>
            <td>
              <img src="${founderAvatarUrl}" width="56" height="56" alt="Chris Wolff" style="border-radius:999px;display:block;margin-bottom:20px;" />
              <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;color:#000000;">Welcome to TwinTracker</h1>
              <p style="font-family:'Courier New',monospace;font-size:14px;line-height:1.7;color:#444444;">${greeting}</p>
              <p style="font-family:'Courier New',monospace;font-size:14px;line-height:1.7;color:#444444;">TwinTracker is built for twins and works beautifully for one. I built it to make the tiny daily handoffs around feeds, sleep, diapers, and routines easier to trust.</p>
              <p style="font-family:'Courier New',monospace;font-size:14px;line-height:1.7;color:#444444;">I would love your feedback from settings whenever something feels rough.</p>
              <p style="font-family:'Courier New',monospace;font-size:13px;line-height:1.6;color:#666666;margin-top:28px;">Chris Wolff<br />Founder of TwinTracker</p>
              <a href="${link}" style="display:inline-block;margin-top:24px;padding:14px 28px;background:#000000;color:#ffffff;text-decoration:none;border-radius:999px;font-family:'Courier New',monospace;font-size:14px;">Open TwinTracker</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function welcomePlainBody(link: string, _locale: string = 'en', name?: string | null): string {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return `${greeting}

TwinTracker is built for twins and works beautifully for one.

Open TwinTracker: ${link}

I would love your feedback any time from /settings.

Chris Wolff
Founder of TwinTracker
hello@twintracker.app`;
}

function childStageDigestHtmlBody(
  link: string,
  params: Omit<ChildStageDigestEmailParams, 'email' | 'locale'>,
): string {
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi,';

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e0e0e0;border-radius:16px;padding:40px;">
          <tr>
            <td>
              <p style="font-family:'Courier New',monospace;font-size:14px;line-height:1.7;color:#444444;">${greeting}</p>
              <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;color:#000000;">${params.babyName} is ${params.ageLabel}</h1>
              <p style="font-family:'Courier New',monospace;font-size:14px;line-height:1.7;color:#444444;">${params.stageSummary}</p>

              <h2 style="font-family:Georgia,serif;font-size:18px;color:#000000;margin-top:28px;">What to expect around this stage</h2>
              <p style="font-family:'Courier New',monospace;font-size:14px;color:#444444;">${params.stageTitle}</p>
              <ul style="font-family:'Courier New',monospace;font-size:14px;line-height:1.7;color:#444444;">${listItems(params.expectations)}</ul>

              <h2 style="font-family:Georgia,serif;font-size:18px;color:#000000;margin-top:28px;">Milestones around this stage</h2>
              <ul style="font-family:'Courier New',monospace;font-size:14px;line-height:1.7;color:#444444;">${listItems(params.milestoneBullets)}</ul>

              <h2 style="font-family:Georgia,serif;font-size:18px;color:#000000;margin-top:28px;">Past month in TwinTracker</h2>
              <ul style="font-family:'Courier New',monospace;font-size:14px;line-height:1.7;color:#444444;">${listItems(params.trendBullets)}</ul>

              <a href="${link}" style="display:inline-block;margin-top:24px;padding:14px 28px;background:#000000;color:#ffffff;text-decoration:none;border-radius:999px;font-family:'Courier New',monospace;font-size:14px;">Open TwinTracker</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function childStageDigestPlainBody(
  link: string,
  params: Omit<ChildStageDigestEmailParams, 'email' | 'locale'>,
): string {
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi,';
  return `${greeting}

${params.babyName} is ${params.ageLabel}

${params.stageTitle}
${params.stageSummary}

What to expect around this stage:
- ${params.expectations.join('\n- ')}

Milestones around this stage:
- ${params.milestoneBullets.join('\n- ')}

Past month in TwinTracker:
- ${params.trendBullets.join('\n- ')}

Open TwinTracker: ${link}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const __emailPreview = {
  welcomeHtmlBody,
  welcomePlainBody,
  verificationHtmlBody: htmlBody,
  verificationPlainBody: plainBody,
  childStageDigestHtmlBody,
  childStageDigestPlainBody,
};

/**
 * Send a verification email. `locale` is the user's preferred language
 * (e.g. from the Accept-Language header); defaults to 'en'.
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  locale: string = 'en',
): Promise<void> {
  const link = `${appUrl}/verify-email?token=${token}`;
  const lang = resolveLocale(locale);
  const subject = t(lang, 'verify_subject');

  if (resendClient) {
    await resendClient.emails.send({
      from: fromAddress,
      to: email,
      subject,
      text: plainBody(link, lang),
      html: htmlBody(link, lang),
    });
    return;
  }

  if (transporter) {
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject,
      text: plainBody(link, lang),
      html: htmlBody(link, lang),
    });
    return;
  }

  // Dev mode: no email provider configured — log the link so devs can click it directly.
  console.log(`[DEV] Email verification link for ${email}:\n  ${link}`);
}

export async function sendChildStageDigestEmail(
  params: ChildStageDigestEmailParams,
): Promise<void> {
  const link = `${appUrl}/login`;
  const subject = `${params.babyName} is ${params.ageLabel}`;
  const bodyParams = {
    recipientName: params.recipientName,
    babyName: params.babyName,
    ageLabel: params.ageLabel,
    stageTitle: params.stageTitle,
    stageSummary: params.stageSummary,
    expectations: params.expectations,
    milestoneBullets: params.milestoneBullets,
    trendBullets: params.trendBullets,
  };
  const text = childStageDigestPlainBody(link, bodyParams);
  const html = childStageDigestHtmlBody(link, bodyParams);

  if (resendClient) {
    await resendClient.emails.send({
      from: fromAddress,
      to: params.email,
      subject,
      text,
      html,
    });
    return;
  }

  if (transporter) {
    await transporter.sendMail({
      from: fromAddress,
      to: params.email,
      subject,
      text,
      html,
    });
    return;
  }

  console.log(`[DEV] Child stage digest email for ${params.email}:\n  ${subject}\n  ${link}`);
}
