'use client';
import { useEffect, useState } from 'react';
import { configure } from '@tt/core';
import { MarketingNav } from '../../components/MarketingNav';
import { MarketingFooter } from '../../components/MarketingFooter';
import styles from './privacy.module.scss';

configure('');

export default function PrivacyPage() {
  const [theme, setTheme] = useState<'day' | 'night'>('day');

  useEffect(() => {
    const domTheme = document.documentElement.dataset.theme as 'day' | 'night' | undefined;
    if (domTheme) {
      setTheme(domTheme);
    }
  }, []);

  return (
    <div className={styles.page}>
      <MarketingNav
        theme={theme}
        onToggle={() =>
          setTheme(t => {
            const next = t === 'day' ? 'night' : 'day';
            document.documentElement.dataset.theme = next;
            return next;
          })
        }
      />
      <main className={styles.main}>
        <div className={styles.content}>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.updated}>Last updated: April 9, 2026</p>

          <Section title="1. Introduction">
            <p>
              TwinTracker ("we", "us", or "our") operates the TwinTracker mobile application and
              website (the "Service"). This Privacy Policy explains how we collect, use, and protect
              your information when you use our Service.
            </p>
            <p>
              By using TwinTracker, you agree to the collection and use of information in accordance
              with this policy.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <h4 className={styles.subhead}>Account information</h4>
            <p>
              When you register, we collect your email address, display name, and a hashed password.
              If you join an existing household via invite code, we also store that association.
            </p>
            <h4 className={styles.subhead}>Baby profiles</h4>
            <p>
              You may optionally provide your baby's name, date of birth, sex, weight, and height.
              This information is used to personalise schedule recommendations and growth percentile
              charts. All fields except name are optional.
            </p>
            <h4 className={styles.subhead}>Event logs</h4>
            <p>
              TwinTracker records the events you log: feeding times and amounts, nap and sleep
              durations, diaper changes, medicines, solid foods, and developmental milestones. These
              logs are the core function of the Service.
            </p>
            <h4 className={styles.subhead}>Device tokens</h4>
            <p>
              If you enable push notifications, we store a device token provided by Apple (APNs) or
              Google (FCM) in order to deliver nap check alarms to your device.
            </p>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul className={styles.list}>
              <li>To provide and personalise the TwinTracker Service</li>
              <li>To calculate schedule recommendations and growth percentiles</li>
              <li>To synchronise data across devices in your household</li>
              <li>To deliver push notifications you have requested</li>
              <li>To respond to support requests</li>
              <li>To send account-related emails (email verification, password reset)</li>
            </ul>
            <p>
              We do not use your data for advertising, and we do not sell your data to third
              parties.
            </p>
          </Section>

          <Section title="4. Data Sharing">
            <p>
              We do not sell, trade, or rent your personal information to third parties. We may
              share data only in the following limited circumstances:
            </p>
            <ul className={styles.list}>
              <li>
                <strong>Within your household:</strong> Data you log is visible to all members of
                your household (e.g. both co-parents).
              </li>
              <li>
                <strong>Infrastructure providers:</strong> We use Railway (infrastructure) and
                Resend (transactional email) to operate the Service. These providers process data
                only as necessary to provide their services.
              </li>
              <li>
                <strong>Legal requirements:</strong> We may disclose information if required by law
                or in response to valid legal process.
              </li>
            </ul>
          </Section>

          <Section title="5. Data Retention">
            <p>
              We retain your account and event data for as long as your account is active. You may
              delete all event logs at any time from the Settings screen. To request complete
              account deletion, contact us at{' '}
              <a href="mailto:hello@twintracker.app" className={styles.link}>
                hello@twintracker.app
              </a>
              .
            </p>
          </Section>

          <Section title="6. Security">
            <p>
              Passwords are hashed using bcrypt and never stored in plain text. Data is transmitted
              over HTTPS. Access tokens expire after 7 days; refresh tokens after 90 days. All event
              and baby data is scoped to your household — other users cannot access your data.
            </p>
            <p>
              No method of transmission over the internet is 100% secure. We take commercially
              reasonable steps to protect your data but cannot guarantee absolute security.
            </p>
          </Section>

          <Section title="7. Your Rights">
            <p>
              Depending on your location, you may have the right to access, correct, or delete the
              personal data we hold about you. To exercise these rights, contact us at{' '}
              <a href="mailto:hello@twintracker.app" className={styles.link}>
                hello@twintracker.app
              </a>
              .
            </p>
            <p>
              If you are located in the European Economic Area, you have rights under the GDPR
              including the right to data portability and the right to lodge a complaint with a
              supervisory authority.
            </p>
            <p>
              If you are a California resident, you have rights under the CCPA including the right
              to know what personal information is collected and the right to opt out of the sale of
              personal information. We do not sell personal information.
            </p>
          </Section>

          <Section title="8. Children's Privacy">
            <p>
              TwinTracker is designed to be used by parents and caregivers (adults). The Service
              collects information <em>about</em> infants and children as entered by the parent or
              caregiver, but is not directed at children. We do not knowingly collect personal
              information directly from children under 13.
            </p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant
              changes by posting the new policy on this page and updating the "Last updated" date.
              We encourage you to review this policy periodically.
            </p>
          </Section>

          <Section title="10. Contact Us">
            <p>
              If you have questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:hello@twintracker.app" className={styles.link}>
                hello@twintracker.app
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}
