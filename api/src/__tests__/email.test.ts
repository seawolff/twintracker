import { __emailPreview } from '../email';

describe('Email templates', () => {
  it('renders the welcome email with founder avatar, personal copy, and app CTA', () => {
    const html = __emailPreview.welcomeHtmlBody('https://www.twintracker.app/login', 'en', 'Chris');

    expect(html).toContain('wolff.jpg');
    expect(html).toContain('Chris Wolff');
    expect(html).toContain('Founder of TwinTracker');
    expect(html).toContain('works beautifully for one');
    expect(html).toContain('Open TwinTracker');
  });

  it('renders the welcome plain-text email with greeting and login link', () => {
    const text = __emailPreview.welcomePlainBody(
      'https://www.twintracker.app/login',
      'en',
      'Chris',
    );

    expect(text).toContain('Hi Chris,');
    expect(text).toContain('TwinTracker is built for twins and works beautifully for one.');
    expect(text).toContain('https://www.twintracker.app/login');
    expect(text).toContain('/settings');
    expect(text).toContain('hello@twintracker.app');
  });

  it('renders the verification email CTA and expiry copy', () => {
    const html = __emailPreview.verificationHtmlBody(
      'https://www.twintracker.app/verify-email?token=test',
      'en',
    );

    expect(html).toContain('Verify your email address');
    expect(html).toContain('Verify email address');
    expect(html).toContain('This link expires in 24 hours');
  });

  it('renders the child stage digest email with development and trend sections', () => {
    const html = __emailPreview.childStageDigestHtmlBody('https://www.twintracker.app/login', {
      recipientName: 'Chris',
      babyName: 'George',
      ageLabel: '7 months old',
      stageTitle: 'Mobility and curiosity tend to pick up fast',
      stageSummary: 'A summary for this stage.',
      expectations: ['rolling or crawling more', 'more babbling'],
      milestoneBullets: ['recently logged: Rolled from back to belly'],
      trendBullets: ['about 4.2 feeds per day on average', 'a longest night stretch of 7h'],
    });

    expect(html).toContain('George is 7 months old');
    expect(html).toContain('What to expect around this stage');
    expect(html).toContain('Milestones around this stage');
    expect(html).toContain('Rolled from back to belly');
    expect(html).toContain('Past month in TwinTracker');
    expect(html).toContain('Open TwinTracker');
  });
});
