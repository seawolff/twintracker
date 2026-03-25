/** Web bottom-sheet timer picker: 5/10/15/20/30 min + custom. Uses createPortal. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useThemeContext } from '@tt/core';
import { CloseIcon } from './icons/BabyIcons';
import { fonts, spacing, radius } from '../theme/tokens';

const PRESETS = [5, 10, 15, 20, 30] as const;

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  backgroundColor: 'rgba(0,0,0,0.32)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
};

const dragHeaderStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `18px ${spacing.lg}px ${spacing.sm}px`,
  cursor: 'grab',
  userSelect: 'none',
};

const handlePillStyle: React.CSSProperties = { width: 32, height: 4, borderRadius: 2 };

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: spacing.md,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: `${spacing.xs}px`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const DISMISS_THRESHOLD_Y = 80;

interface Props {
  visible: boolean;
  babyName: string;
  onSetAlarm: (durationMs: number) => void;
  onClose: () => void;
}

export function TimerPickerModal({ visible, babyName, onSetAlarm, onClose }: Props) {
  const theme = useThemeContext();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const sl = theme.mode === 'day' ? 'rgba(0,0,0,' : 'rgba(255,255,255,';

  useEffect(() => {
    if (!visible) {
      return;
    }
    setCustomOpen(false);
    setCustomText('');
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) {
    return null;
  }

  function confirm(minutes: number) {
    if (minutes < 1) {
      return;
    }
    onSetAlarm(minutes * 60_000);
    onClose();
  }

  function confirmCustom() {
    const mins = parseInt(customText, 10);
    if (!isNaN(mins) && mins >= 1) {
      confirm(mins);
    }
  }

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null || !sheetRef.current) {
      return;
    }
    const dy = e.clientY - dragStartY.current;
    if (dy > 0) {
      sheetRef.current.style.transition = 'none';
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) {
      return;
    }
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = null;
    if (dy > DISMISS_THRESHOLD_Y) {
      onClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)';
      sheetRef.current.style.transform = 'translateY(0)';
    }
  };

  const rowStyle = (i: number): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${spacing.lg}px`,
    borderTop: i > 0 ? `1px solid ${theme.border}` : 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderBottom: 'none',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    minHeight: 56,
    fontSize: 17,
    color: theme.text,
    fontFamily: fonts.mono,
    backgroundColor:
      activeIndex === i + 100 ? `${sl}0.08)` : activeIndex === i ? `${sl}0.04)` : 'transparent',
    transition: 'background-color 100ms ease',
  });

  const content = (
    <div style={backdropStyle} onClick={onClose}>
      <div
        ref={sheetRef}
        style={{
          backgroundColor: theme.surface,
          borderTop: `1px solid ${theme.border}`,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingBottom: 32,
          overflow: 'hidden',
          transform: 'translateY(0)',
          transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          style={dragHeaderStyle}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          <div style={{ ...handlePillStyle, backgroundColor: theme.border }} />
          <button
            onClick={e => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
            style={closeBtnStyle}
          >
            <CloseIcon size={20} color={theme.textMuted} />
          </button>
        </div>

        <p
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 1,
            textAlign: 'center',
            color: theme.textMuted,
            fontFamily: fonts.mono,
            margin: 0,
            padding: `${spacing.sm}px 0`,
          }}
        >
          {`Timer for ${babyName}`}
        </p>

        {PRESETS.map((m, i) => (
          <button
            key={m}
            style={rowStyle(i)}
            onClick={() => confirm(m)}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(-1)}
            onMouseDown={() => setActiveIndex(i + 100)}
            onMouseUp={() => setActiveIndex(i)}
          >
            {`${m} min`}
          </button>
        ))}

        <button
          style={rowStyle(PRESETS.length)}
          onClick={() => setCustomOpen(o => !o)}
          onMouseEnter={() => setActiveIndex(PRESETS.length)}
          onMouseLeave={() => setActiveIndex(-1)}
          onMouseDown={() => setActiveIndex(PRESETS.length + 100)}
          onMouseUp={() => setActiveIndex(PRESETS.length)}
        >
          Custom…
        </button>

        {customOpen && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              padding: `${spacing.md}px ${spacing.lg}px`,
              borderTop: `1px solid ${theme.border}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <input
              type="number"
              min="1"
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  confirmCustom();
                }
              }}
              placeholder="minutes"
              autoFocus
              style={{
                flex: 1,
                height: 44,
                border: `1px solid ${theme.border}`,
                borderRadius: radius.md,
                padding: `0 ${spacing.md}px`,
                fontSize: 17,
                color: theme.text,
                background: theme.surface,
                fontFamily: fonts.mono,
                outline: 'none',
              }}
            />
            <button
              onClick={confirmCustom}
              style={{
                height: 44,
                padding: `0 ${spacing.lg}px`,
                borderRadius: radius.md,
                backgroundColor: theme.accent,
                border: 'none',
                cursor: 'pointer',
                color: theme.bg,
                fontFamily: fonts.mono,
                fontSize: 15,
              }}
            >
              Set
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
