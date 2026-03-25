/**
 * LogSheet.web — suggestedOz pre-selection tests.
 *
 * Uses a real DOM render (createRoot + act) so useEffect runs, which is what
 * initialises the oz input from the suggestedOz prop on sheet open.
 *
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LogSheet } from '../components/LogSheet.web';
import type { Baby } from '@tt/core';

// jsdom does not implement requestAnimationFrame — stub it so the animation
// effect inside LogSheet resolves synchronously inside act().
global.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};

const BABY: Baby = {
  id: 'b1',
  name: 'Leo',
  color: 'amber',
  createdAt: '2026-01-01T00:00:00Z',
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  root.unmount();
  container.remove();
});

function renderSheet(props: Record<string, unknown> = {}) {
  act(() => {
    root.render(
      <LogSheet
        visible={true}
        baby={BABY}
        eventType="bottle"
        onSubmit={jest.fn()}
        onClose={jest.fn()}
        {...props}
      />,
    );
  });
}

function getOzInput(): HTMLInputElement {
  return container.querySelector('input[type="number"]') as HTMLInputElement;
}

// ── suggestedOz initialisation ────────────────────────────────────────────────

describe('LogSheet bottle — suggestedOz pre-selection', () => {
  it('pre-fills custom oz input with suggestedOz on open', () => {
    renderSheet({ suggestedOz: 5 });
    expect(getOzInput().value).toBe('5');
  });

  it('defaults custom oz to 4 when suggestedOz is not provided', () => {
    renderSheet();
    expect(getOzInput().value).toBe('4');
  });

  it('pre-fills with decimal suggestedOz', () => {
    renderSheet({ suggestedOz: 4.5 });
    expect(getOzInput().value).toBe('4.5');
  });

  it('uses suggestedOz when sheet opens from closed state (first open)', () => {
    // Start closed with no suggestedOz — mirrors initial app render
    act(() => {
      root.render(
        <LogSheet
          visible={false}
          baby={BABY}
          eventType="bottle"
          onSubmit={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    // Open atomically with a suggestedOz — mirrors setSheet({ baby, type, suggestedOz })
    act(() => {
      root.render(
        <LogSheet
          visible={true}
          baby={BABY}
          eventType="bottle"
          onSubmit={jest.fn()}
          onClose={jest.fn()}
          suggestedOz={6}
        />,
      );
    });
    expect(getOzInput().value).toBe('6');
  });

  it('reinitialises oz input when sheet reopens with a new suggestedOz', () => {
    // Open with oz=5
    renderSheet({ suggestedOz: 5 });
    expect(getOzInput().value).toBe('5');

    // Close
    act(() => {
      root.render(
        <LogSheet
          visible={false}
          baby={BABY}
          eventType="bottle"
          onSubmit={jest.fn()}
          onClose={jest.fn()}
          suggestedOz={5}
        />,
      );
    });

    // Reopen with oz=7
    act(() => {
      root.render(
        <LogSheet
          visible={true}
          baby={BABY}
          eventType="bottle"
          onSubmit={jest.fn()}
          onClose={jest.fn()}
          suggestedOz={7}
        />,
      );
    });
    expect(getOzInput().value).toBe('7');
  });
});
