/** Web bottom-sheet for "more" actions: Medicine, Milestone, Set Timer. Uses createPortal. */
import { useEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import type { EventType } from '@tt/core';
import { useThemeContext } from '@tt/core';
import { fonts, spacing, radius } from '../theme/tokens';
import { MedicineIcon, MilestoneIcon, TimerIcon, CloseIcon } from './icons/BabyIcons';

const DISMISS_THRESHOLD_Y = 80;
const ICON_SIZE = 24;

interface Props {
  visible: boolean;
  babyName: string;
  showTimer: boolean;
  onLog: (type: EventType) => void;
  onOpenTimer: () => void;
  onClose: () => void;
}

type Option =
  | {
      type: EventType;
      label: string;
      Icon: (p: { size: number; color: string }) => JSX.Element | null;
    }
  | { type: null; label: string; Icon: (p: { size: number; color: string }) => JSX.Element | null };

const BASE_OPTIONS: Option[] = [
  { type: 'medicine', label: 'Medicine', Icon: MedicineIcon },
  { type: 'milestone', label: 'Milestone', Icon: MilestoneIcon },
];

export function MoreMenuSheet({
  visible,
  babyName,
  showTimer,
  onLog,
  onOpenTimer,
  onClose,
}: Props) {
  const theme = useThemeContext();
  const [activeIndex, setActiveIndex] = useState(-1);
  const sl = theme.mode === 'day' ? 'rgba(0,0,0,' : 'rgba(255,255,255,';
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
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

  const allOptions: Option[] = [
    ...BASE_OPTIONS,
    ...(showTimer ? [{ type: null as null, label: 'Set timer', Icon: TimerIcon }] : []),
  ];

  const content = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        backgroundColor: 'rgba(0,0,0,0.32)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
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
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `18px ${spacing.lg}px ${spacing.sm}px`,
            cursor: 'grab',
            userSelect: 'none',
          }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          <div style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: theme.border }} />
          <button
            onClick={e => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
            style={{
              position: 'absolute',
              right: spacing.md,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: `${spacing.xs}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
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
          {babyName}
        </p>

        {allOptions.map((opt, i) => (
          <button
            key={opt.label}
            onClick={() => {
              onClose();
              if (opt.type) {
                onLog(opt.type);
              } else {
                onOpenTimer();
              }
            }}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(-1)}
            onMouseDown={() => setActiveIndex(i + 100)}
            onMouseUp={() => setActiveIndex(i)}
            aria-label={`${opt.label} for ${babyName}`}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 0,
              paddingRight: spacing.md,
              paddingTop: 0,
              paddingBottom: 0,
              borderTop: i > 0 ? `1px solid ${theme.border}` : 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              minHeight: 56,
              backgroundColor:
                activeIndex === i + 100
                  ? `${sl}0.08)`
                  : activeIndex === i
                    ? `${sl}0.04)`
                    : 'transparent',
              transition: 'background-color 100ms ease',
            }}
          >
            <span
              style={{
                width: 56,
                height: 56,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <opt.Icon size={ICON_SIZE} color={theme.text} />
            </span>
            <span style={{ fontSize: 17, color: theme.text, fontFamily: fonts.mono }}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
