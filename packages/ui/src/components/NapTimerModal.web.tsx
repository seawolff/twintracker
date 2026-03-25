/** Full-screen nap timer modal (web). Radial scrub on SVG ring adjusts the alarm time. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NapAlarm } from '@tt/core';
import { useThemeContext, i18n } from '@tt/core';
import { fonts, spacing, radius } from '../theme/tokens';

const RING_SIZE = 300;
const STROKE = 14;
const RING_R = (RING_SIZE - STROKE) / 2;
const RING_CX = RING_SIZE / 2;
const RING_CY = RING_SIZE / 2;
const MAX_MINUTES = 60;

interface Props {
  alarm: NapAlarm;
  visible: boolean;
  /** Close the modal — alarm stays active. */
  onDismiss: () => void;
  /** Cancel and delete the alarm. */
  onCancel: () => void;
  onReschedule: (firesAt: string, durationMs: number) => void;
}

import { posToAngle, fmtTime, fmtCountdown } from '../utils/napTimer';

export function NapTimerModal({ alarm, visible, onDismiss, onCancel, onReschedule }: Props) {
  const theme = useThemeContext();
  const svgRef = useRef<SVGSVGElement>(null);

  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(alarm.firesAt).getTime() - Date.now()),
  );
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubMinutes, setScrubMinutes] = useState(0);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState('');

  const scrubMinutesRef = useRef(0);
  const isScrubbingRef = useRef(false);

  useEffect(() => {
    if (isScrubbing || isEditingText || !visible) {
      return;
    }
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, new Date(alarm.firesAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [alarm.firesAt, isScrubbing, isEditingText, visible]);

  useEffect(() => {
    setRemainingMs(Math.max(0, new Date(alarm.firesAt).getTime() - Date.now()));
  }, [alarm.firesAt]);

  // Attach/detach global mouse listeners for scrub
  useEffect(() => {
    function onMove(e: MouseEvent | TouchEvent) {
      if (!isScrubbingRef.current || !svgRef.current) {
        return;
      }
      const rect = svgRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const angle = posToAngle(clientX, clientY, cx, cy);
      const mins = Math.max(1, Math.min(MAX_MINUTES, Math.round((angle / 360) * MAX_MINUTES)));
      scrubMinutesRef.current = mins;
      setScrubMinutes(mins);
    }
    function onUp() {
      if (!isScrubbingRef.current) {
        return;
      }
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      const mins = scrubMinutesRef.current;
      const newFiresAt = new Date(Date.now() + mins * 60_000).toISOString();
      onReschedule(newFiresAt, mins * 60_000);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [onReschedule]);

  if (!visible) {
    return null;
  }

  const circumference = 2 * Math.PI * RING_R;
  const progress = isScrubbing
    ? scrubMinutes / MAX_MINUTES
    : Math.max(0, Math.min(1, remainingMs / alarm.durationMs));
  const dashOffset = circumference * (1 - progress);

  const fireTime = isScrubbing
    ? new Date(Date.now() + scrubMinutes * 60_000)
    : new Date(alarm.firesAt);

  const centerLabel = isScrubbing
    ? `${String(scrubMinutes).padStart(2, '0')}:00`
    : fmtCountdown(remainingMs);

  function startScrub() {
    const initMins = Math.max(1, Math.min(MAX_MINUTES, Math.round(remainingMs / 60_000)));
    scrubMinutesRef.current = initMins;
    setScrubMinutes(initMins);
    isScrubbingRef.current = true;
    setIsScrubbing(true);
  }

  function commitTextEdit() {
    const mins = Math.max(1, Math.min(MAX_MINUTES, parseInt(editText, 10) || 0));
    if (mins > 0) {
      const newFiresAt = new Date(Date.now() + mins * 60_000).toISOString();
      onReschedule(newFiresAt, mins * 60_000);
    }
    setIsEditingText(false);
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    backgroundColor: theme.bg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 60,
    userSelect: 'none',
  };

  const content = (
    <div style={overlayStyle}>
      {/* Close (dismiss without canceling) */}
      <button
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          fontFamily: fonts.mono,
          fontSize: 14,
          color: theme.textMuted,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 4px',
        }}
        aria-label="Close"
      >
        {i18n.t('common.back')}
      </button>

      {/* Header label */}
      <p
        style={{
          fontFamily: fonts.mono,
          fontSize: 13,
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: spacing.lg,
        }}
      >
        {alarm.label}
      </p>

      {/* Ring */}
      <div
        style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE, cursor: 'grab' }}
        onMouseDown={startScrub}
        onTouchStart={startScrub}
      >
        <svg ref={svgRef} width={RING_SIZE} height={RING_SIZE}>
          {/* Track */}
          <circle
            cx={RING_CX}
            cy={RING_CY}
            r={RING_R}
            stroke={theme.border}
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Progress arc */}
          <circle
            cx={RING_CX}
            cy={RING_CY}
            r={RING_R}
            stroke={theme.text}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING_CX} ${RING_CY})`}
          />
          {/* Fire time */}
          <text
            x={RING_CX}
            y={RING_CY - 28}
            textAnchor="middle"
            fontSize={13}
            fontFamily={fonts.mono}
            fill={theme.textMuted}
          >
            {`🔔 ${fmtTime(fireTime)}`}
          </text>
          {/* MM:SS */}
          <text
            x={RING_CX}
            y={RING_CY + 24}
            textAnchor="middle"
            fontSize={52}
            fontWeight="300"
            fontFamily={fonts.mono}
            fill={theme.text}
          >
            {centerLabel}
          </text>
        </svg>

        {/* Invisible tap target over MM:SS to enter edit mode */}
        {!isScrubbing && (
          <div
            onClick={e => {
              e.stopPropagation();
              setEditText(String(Math.max(1, Math.round(remainingMs / 60_000))));
              setIsEditingText(true);
            }}
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              top: RING_CY - 10,
              width: 160,
              height: 70,
              cursor: 'text',
            }}
          />
        )}
      </div>

      {/* Inline minute editor */}
      {isEditingText && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: spacing.lg,
            border: `1px solid ${theme.border}`,
            borderRadius: radius.md,
            padding: `${spacing.sm}px ${spacing.md}px`,
          }}
        >
          <input
            type="number"
            min="1"
            max={MAX_MINUTES}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={commitTextEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                commitTextEdit();
              }
            }}
            autoFocus
            style={{
              width: 80,
              fontSize: 32,
              textAlign: 'center',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: theme.text,
              fontFamily: fonts.mono,
            }}
          />
          <span style={{ fontSize: 18, color: theme.textMuted, fontFamily: fonts.mono }}>
            {i18n.t('nap_timer.min')}
          </span>
        </div>
      )}

      {/* Hint */}
      {!isEditingText && (
        <p
          style={{
            fontFamily: fonts.mono,
            fontSize: 12,
            color: theme.textMuted,
            marginTop: spacing.lg,
            letterSpacing: 0.5,
          }}
        >
          {isScrubbing
            ? i18n.t('nap_timer.set_to_min', { n: String(scrubMinutes) })
            : i18n.t('nap_timer.hint_click')}
        </p>
      )}

      {/* Cancel alarm (destructive) */}
      <button
        onClick={onCancel}
        style={{
          position: 'absolute',
          bottom: 60,
          left: 40,
          fontFamily: fonts.mono,
          fontSize: 14,
          color: theme.textMuted,
          background: 'transparent',
          border: `1px solid ${theme.border}`,
          borderRadius: 999,
          padding: `10px ${spacing.lg}px`,
          cursor: 'pointer',
        }}
      >
        {i18n.t('nap_timer.cancel_alarm')}
      </button>
    </div>
  );

  return createPortal(content, document.body);
}
