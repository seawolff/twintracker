/**
 * Bottom-sheet component tests — FeedPickerModal, MoreMenuSheet, TimerPickerModal.
 * Tests both native and web variants for option visibility and show/hide behaviour.
 *
 * Uses renderToStaticMarkup (SSR snapshot of initial render state).
 * Interaction behaviour (state layers, onPressIn/Out) is covered by manual QA.
 *
 * Web variants call createPortal(content, document.body). We mock createPortal to
 * render inline (so renderToStaticMarkup can inspect the output) and polyfill
 * document.body so the argument doesn't throw in node test environment.
 */

// Polyfill document so createPortal's second arg doesn't throw in node environment.
// The actual container is ignored since createPortal is mocked below.
if (!(global as any).document) {
  (global as any).document = { body: null };
}

// createPortal must be mocked BEFORE importing web components so portals render inline.
jest.mock('react-dom', () => {
  const actual = jest.requireActual<typeof import('react-dom')>('react-dom');
  return { ...actual, createPortal: (node: React.ReactNode) => node };
});

import { renderToStaticMarkup } from 'react-dom/server';
import { FeedPickerModal } from '../components/FeedPickerModal';
import { FeedPickerModal as FeedPickerModalWeb } from '../components/FeedPickerModal.web';
import { MoreMenuSheet } from '../components/MoreMenuSheet';
import { MoreMenuSheet as MoreMenuSheetWeb } from '../components/MoreMenuSheet.web';
import { TimerPickerModal } from '../components/TimerPickerModal';
import { TimerPickerModal as TimerPickerModalWeb } from '../components/TimerPickerModal.web';

// ── FeedPickerModal — native ───────────────────────────────────────────────────

describe('FeedPickerModal — native', () => {
  it('renders Bottle, Nursing, Solids when visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModal visible babyName="Leo" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('Bottle');
    expect(html).toContain('Nursing');
    expect(html).toContain('Solids');
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModal visible={false} babyName="Leo" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).not.toContain('Bottle');
    expect(html).not.toContain('Nursing');
    expect(html).not.toContain('Solids');
  });

  it('includes baby name in title when visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModal visible babyName="Mia" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('Mia');
  });
});

// ── FeedPickerModal — web ──────────────────────────────────────────────────────

describe('FeedPickerModal — web', () => {
  it('renders Bottle, Nursing, Solids when visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModalWeb visible babyName="Leo" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('Bottle');
    expect(html).toContain('Nursing');
    expect(html).toContain('Solids');
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModalWeb
        visible={false}
        babyName="Leo"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).not.toContain('Bottle');
    expect(html).not.toContain('Nursing');
    expect(html).not.toContain('Solids');
  });

  it('includes baby name in title when visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModalWeb visible babyName="Mia" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('Mia');
  });
});

// ── MoreMenuSheet — native ─────────────────────────────────────────────────────

describe('MoreMenuSheet — native', () => {
  it('renders Medicine and Milestone when visible', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheet
        visible
        babyName="Leo"
        showTimer={false}
        onLog={jest.fn()}
        onOpenTimer={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).toContain('Medicine');
    expect(html).toContain('Milestone');
  });

  it('renders "Set timer" when showTimer is true', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheet
        visible
        babyName="Leo"
        showTimer={true}
        onLog={jest.fn()}
        onOpenTimer={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).toContain('Set timer');
  });

  it('does not render "Set timer" when showTimer is false', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheet
        visible
        babyName="Leo"
        showTimer={false}
        onLog={jest.fn()}
        onOpenTimer={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).not.toContain('Set timer');
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheet
        visible={false}
        babyName="Leo"
        showTimer={true}
        onLog={jest.fn()}
        onOpenTimer={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).not.toContain('Medicine');
    expect(html).not.toContain('Milestone');
    expect(html).not.toContain('Set timer');
  });
});

// ── MoreMenuSheet — web ────────────────────────────────────────────────────────

describe('MoreMenuSheet — web', () => {
  it('renders Medicine and Milestone when visible', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheetWeb
        visible
        babyName="Leo"
        showTimer={false}
        onLog={jest.fn()}
        onOpenTimer={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).toContain('Medicine');
    expect(html).toContain('Milestone');
  });

  it('renders "Set timer" when showTimer is true', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheetWeb
        visible
        babyName="Leo"
        showTimer={true}
        onLog={jest.fn()}
        onOpenTimer={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).toContain('Set timer');
  });

  it('does not render "Set timer" when showTimer is false', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheetWeb
        visible
        babyName="Leo"
        showTimer={false}
        onLog={jest.fn()}
        onOpenTimer={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).not.toContain('Set timer');
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheetWeb
        visible={false}
        babyName="Leo"
        showTimer={true}
        onLog={jest.fn()}
        onOpenTimer={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).not.toContain('Medicine');
    expect(html).not.toContain('Milestone');
    expect(html).not.toContain('Set timer');
  });
});

// ── TimerPickerModal — native ──────────────────────────────────────────────────

describe('TimerPickerModal — native', () => {
  it('renders all five preset durations when visible', () => {
    const html = renderToStaticMarkup(
      <TimerPickerModal visible babyName="Leo" onSetAlarm={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('5 min');
    expect(html).toContain('10 min');
    expect(html).toContain('15 min');
    expect(html).toContain('20 min');
    expect(html).toContain('30 min');
  });

  it('renders Custom option when visible', () => {
    const html = renderToStaticMarkup(
      <TimerPickerModal visible babyName="Leo" onSetAlarm={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('Custom');
  });

  it('includes baby name in title when visible', () => {
    const html = renderToStaticMarkup(
      <TimerPickerModal visible babyName="Mia" onSetAlarm={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('Mia');
  });

  it('does not show custom input by default', () => {
    const html = renderToStaticMarkup(
      <TimerPickerModal visible babyName="Leo" onSetAlarm={jest.fn()} onClose={jest.fn()} />,
    );
    // Custom row with "Set" button is only shown after tapping Custom
    expect(html).not.toContain('Set\x3C'); // "Set" button text (not inside "Set timer")
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <TimerPickerModal
        visible={false}
        babyName="Leo"
        onSetAlarm={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).not.toContain('5 min');
    expect(html).not.toContain('Custom');
  });
});

// ── TimerPickerModal — web ─────────────────────────────────────────────────────

describe('TimerPickerModal — web', () => {
  it('renders all five preset durations when visible', () => {
    const html = renderToStaticMarkup(
      <TimerPickerModalWeb visible babyName="Leo" onSetAlarm={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('5 min');
    expect(html).toContain('10 min');
    expect(html).toContain('15 min');
    expect(html).toContain('20 min');
    expect(html).toContain('30 min');
  });

  it('renders Custom option when visible', () => {
    const html = renderToStaticMarkup(
      <TimerPickerModalWeb visible babyName="Leo" onSetAlarm={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('Custom');
  });

  it('does not show custom input by default', () => {
    const html = renderToStaticMarkup(
      <TimerPickerModalWeb visible babyName="Leo" onSetAlarm={jest.fn()} onClose={jest.fn()} />,
    );
    // Input only renders after clicking Custom (customOpen starts false)
    expect(html).not.toContain('type="number"');
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <TimerPickerModalWeb
        visible={false}
        babyName="Leo"
        onSetAlarm={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(html).not.toContain('5 min');
    expect(html).not.toContain('Custom');
  });
});
