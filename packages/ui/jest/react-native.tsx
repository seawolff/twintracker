import React from 'react';

// Transparent pass-through mocks — children render directly so renderToStaticMarkup
// produces plain text that our test assertions can match against.

export const View = ({ children }: any) => <>{children}</>;
export const Text = ({ children }: any) => <>{children}</>;
export const ScrollView = ({ children }: any) => <>{children}</>;

// Pressable may receive children as a function (render-prop style) or a node.
// Forwards disabled → aria-disabled so tests can assert on interactive state.
export const Pressable = ({ children, disabled }: any) => (
  <span {...(disabled ? { 'aria-disabled': 'true' } : {})}>
    {typeof children === 'function' ? children({ pressed: false }) : children}
  </span>
);

export const RefreshControl = () => null;
export const Modal = ({ children, visible }: any) => (visible ? <>{children}</> : null);
export const ActivityIndicator = () => null;
export const KeyboardAvoidingView = ({ children }: any) => <>{children}</>;
export const SafeAreaView = ({ children }: any) => <>{children}</>;
export const TextInput = (_props: any) => null;

export const StyleSheet = {
  create: <T extends object>(s: T): T => s,
  absoluteFill: {},
  absoluteFillObject: {},
  hairlineWidth: 1,
  flatten: (s: any) => s,
};

export const Animated = {
  View: ({ children }: any) => <>{children}</>,
  Value: class {
    constructor(_v: any) {}
    setValue() {}
  },
  spring: () => ({ start: (cb?: () => void) => cb?.() }),
  timing: () => ({ start: (cb?: () => void) => cb?.() }),
  parallel: (anims: any[]) => ({
    start: (cb?: () => void) => {
      anims.forEach(a => a.start());
      cb?.();
    },
  }),
};

export const Alert = { alert: jest.fn() };
export const Platform = { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default };
export const Share = { share: jest.fn() };
export const Dimensions = { get: (_dim: string) => ({ width: 390, height: 844 }) };
export const PanResponder = {
  create: (_config: any) => ({ panHandlers: {} }),
};
