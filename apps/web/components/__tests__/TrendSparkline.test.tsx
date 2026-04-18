import { act } from 'react';
import { createRoot } from 'react-dom/client';

import TrendSparkline from '../TrendSparkline';

class ResizeObserverMock {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  unobserve() {}

  disconnect() {}
}

describe('TrendSparkline', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const originalResizeObserver = global.ResizeObserver;
  const originalActEnvironment = (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return {
          width: 280,
          height: 48,
          top: 0,
          left: 0,
          right: 280,
          bottom: 48,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        };
      },
    });

    global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: originalGetBoundingClientRect,
    });
    global.ResizeObserver = originalResizeObserver;
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('renders circles and uses measured width instead of a stretched viewBox', () => {
    act(() => {
      root.render(
        <TrendSparkline
          ariaLabel="oz/feed"
          benchmarkLabel="target 7 oz"
          benchmarkValue={7}
          data={[
            { dayMs: 1, value: 5.5 },
            { dayMs: 2, value: 6.1 },
            { dayMs: 3, value: null },
            { dayMs: 4, value: 6.8 },
            { dayMs: 5, value: 6.3 },
          ]}
        />,
      );
    });

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('280');
    expect(svg?.getAttribute('viewBox')).toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(4);
    expect(container.querySelector('text')?.textContent).toBe('target 7 oz');
  });

  it('renders a placeholder when there are fewer than two points', () => {
    act(() => {
      root.render(
        <TrendSparkline
          ariaLabel="feed interval"
          data={[
            { dayMs: 1, value: null },
            { dayMs: 2, value: 4 },
          ]}
        />,
      );
    });

    expect(container.querySelector('svg')).toBeNull();
    expect(container.firstElementChild).not.toBeNull();
  });
});
