/**
 * Bottom-sheet component tests — FeedPickerModal, MoreMenuSheet.
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

// ── FeedPickerModal — native ───────────────────────────────────────────────────

describe('FeedPickerModal — native', () => {
  it('renders bottle, nursing, pump, and food options when visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModal visible babyName="Leo" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('log_sheet.types.bottle');
    expect(html).toContain('log_sheet.types.nursing');
    expect(html).toContain('log_sheet.types.pump');
    expect(html).toContain('log_sheet.types.food');
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModal visible={false} babyName="Leo" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).not.toContain('log_sheet.types.bottle');
    expect(html).not.toContain('log_sheet.types.nursing');
    expect(html).not.toContain('log_sheet.types.pump');
    expect(html).not.toContain('log_sheet.types.food');
  });

  it('includes feed picker title key when visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModal visible babyName="Mia" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('home.feed_picker_title');
  });
});

// ── FeedPickerModal — web ──────────────────────────────────────────────────────

describe('FeedPickerModal — web', () => {
  it('renders bottle, nursing, pump, and food options when visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModalWeb visible babyName="Leo" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('log_sheet.types.bottle');
    expect(html).toContain('log_sheet.types.nursing');
    expect(html).toContain('log_sheet.types.pump');
    expect(html).toContain('log_sheet.types.food');
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
    expect(html).not.toContain('log_sheet.types.bottle');
    expect(html).not.toContain('log_sheet.types.nursing');
    expect(html).not.toContain('log_sheet.types.pump');
    expect(html).not.toContain('log_sheet.types.food');
  });

  it('includes feed picker title key when visible', () => {
    const html = renderToStaticMarkup(
      <FeedPickerModalWeb visible babyName="Mia" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('home.feed_picker_title');
  });
});

// ── MoreMenuSheet — native ─────────────────────────────────────────────────────

describe('MoreMenuSheet — native', () => {
  it('renders Medicine and Milestone when visible', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheet visible babyName="Leo" onLog={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('Medicine');
    expect(html).toContain('Milestone');
  });

  it('does not render "Set timer"', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheet visible babyName="Leo" onLog={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).not.toContain('Set timer');
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheet visible={false} babyName="Leo" onLog={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).not.toContain('Medicine');
    expect(html).not.toContain('Milestone');
  });
});

// ── MoreMenuSheet — web ────────────────────────────────────────────────────────

describe('MoreMenuSheet — web', () => {
  it('renders Medicine and Milestone when visible', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheetWeb visible babyName="Leo" onLog={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).toContain('Medicine');
    expect(html).toContain('Milestone');
  });

  it('does not render "Set timer"', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheetWeb visible babyName="Leo" onLog={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).not.toContain('Set timer');
  });

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <MoreMenuSheetWeb visible={false} babyName="Leo" onLog={jest.fn()} onClose={jest.fn()} />,
    );
    expect(html).not.toContain('Medicine');
    expect(html).not.toContain('Milestone');
  });
});
