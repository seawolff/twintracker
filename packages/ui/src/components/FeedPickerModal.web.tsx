/** Bottom-sheet modal for choosing a feed type (Bottle / Nursing / Solids) — web. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EventType } from '@tt/core';
import { useThemeContext } from '@tt/core';
import { fonts, spacing, radius } from '../theme/tokens';
import { BottleIcon, NursingIcon, FoodIcon, CloseIcon } from './icons/BabyIcons';

type IconComponent = (props: { size: number; color: string }) => React.ReactElement;

const ICON_SIZE = 26;
const DISMISS_THRESHOLD_Y = 80;

const OPTIONS: { type: EventType; label: string; Icon: IconComponent }[] = [
  { type: 'bottle', label: 'Bottle', Icon: BottleIcon as IconComponent },
  { type: 'nursing', label: 'Nursing', Icon: NursingIcon as IconComponent },
  { type: 'food', label: 'Solids', Icon: FoodIcon as IconComponent },
];

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  backgroundColor: 'rgba(0,0,0,0.32)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
};

const headerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `18px ${spacing.lg}px ${spacing.sm}px`,
  cursor: 'grab',
  userSelect: 'none',
};

const leadingIconStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

interface Props {
  visible: boolean;
  babyName: string;
  suggestedOz?: number;
  onSelect: (type: EventType, suggestedOz?: number) => void;
  onClose: () => void;
}

export function FeedPickerModal({ visible, babyName, suggestedOz, onSelect, onClose }: Props) {
  const theme = useThemeContext();
  const [activeIndex, setActiveIndex] = useState(-1);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) {
      return;
    }
    el.style.transform = visible ? 'translateY(0)' : 'translateY(100%)';
  }, [visible]);

  if (!visible) {
    return null;
  }

  // Swipe-down to dismiss: track pointer drag on the handle area
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

  const sheetStyle: React.CSSProperties = {
    backgroundColor: theme.surface,
    borderTop: `1px solid ${theme.border}`,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 32,
    transform: 'translateY(0)',
    transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
    overflow: 'hidden',
  };

  const handleStyle: React.CSSProperties = {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
  };

  const closeStyle: React.CSSProperties = {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: theme.textMuted,
    fontFamily: fonts.mono,
    fontSize: 18,
    lineHeight: 1,
    padding: `${spacing.xs}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    color: theme.textMuted,
    fontFamily: fonts.mono,
    padding: `${spacing.sm}px 0`,
  };

  const sl = theme.mode === 'day' ? 'rgba(0,0,0,' : 'rgba(255,255,255,';

  const optionStyle = (i: number): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 0,
    paddingRight: spacing.md,
    borderTop: i > 0 ? `1px solid ${theme.border}` : 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderBottom: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    minHeight: 56,
    backgroundColor:
      activeIndex === i + 100 ? `${sl}0.08)` : activeIndex === i ? `${sl}0.04)` : 'transparent',
    transition: 'background-color 100ms ease',
  });

  const optionLabelStyle: React.CSSProperties = {
    fontSize: 17,
    color: theme.text,
    fontFamily: fonts.mono,
  };

  const content = (
    <div style={backdropStyle} onClick={onClose}>
      <div ref={sheetRef} style={sheetStyle} onClick={e => e.stopPropagation()}>
        {/* Drag handle + X close button */}
        <div
          style={headerStyle}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          <div style={handleStyle} />
          <button
            style={closeStyle}
            onClick={e => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
          >
            <CloseIcon size={20} color={theme.textMuted} />
          </button>
        </div>

        <p style={titleStyle}>{`Feed ${babyName}`}</p>

        {OPTIONS.map((opt, i) => (
          <button
            key={opt.type}
            style={optionStyle(i)}
            onClick={() => {
              onClose();
              onSelect(opt.type, opt.type === 'bottle' ? suggestedOz : undefined);
            }}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(-1)}
            onMouseDown={() => setActiveIndex(i + 100)}
            onMouseUp={() => setActiveIndex(i)}
            aria-label={`${opt.label} for ${babyName}`}
          >
            <div style={leadingIconStyle}>
              <opt.Icon size={ICON_SIZE} color={theme.text} />
            </div>
            <span style={optionLabelStyle}>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
