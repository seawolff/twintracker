import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { i18n, useThemeContext } from '@tt/core';
import { fonts, spacing, radius } from '../theme/tokens';
import { CloseIcon } from './icons/BabyIcons';

const DISMISS_THRESHOLD_Y = 80;

interface Props {
  visible: boolean;
  babyName: string;
  scheduleStage: 1 | 2 | 3;
  ageWeeks: number;
  onClose: () => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const theme = useThemeContext();
  return (
    <section style={{ display: 'grid', gap: spacing.sm }}>
      <h3
        style={{
          margin: 0,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: theme.text,
          fontFamily: fonts.mono,
        }}
      >
        {title}
      </h3>
      <div style={{ display: 'grid', gap: spacing.sm }}>{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  const theme = useThemeContext();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '12px 1fr',
        gap: spacing.sm,
        alignItems: 'start',
      }}
    >
      <span style={{ color: theme.text, fontFamily: fonts.mono, lineHeight: '24px' }}>•</span>
      <span style={{ color: theme.text, fontSize: 15, lineHeight: '24px' }}>{children}</span>
    </div>
  );
}

export function SleepTrainingInfoSheet({
  visible,
  babyName,
  scheduleStage,
  ageWeeks,
  onClose,
}: Props) {
  const theme = useThemeContext();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const scheduleTitle = i18n.t(`settings.sleep_training_schedule_stage${scheduleStage}_title`);
  const scheduleCycle = i18n.t(`settings.sleep_training_schedule_stage${scheduleStage}_cycle`);
  const scheduleBullet1 = i18n.t(
    `settings.sleep_training_schedule_stage${scheduleStage}_bullet1`,
  );
  const scheduleBullet2 = i18n.t(
    `settings.sleep_training_schedule_stage${scheduleStage}_bullet2`,
  );
  const scheduleBullet3 = i18n.t(
    `settings.sleep_training_schedule_stage${scheduleStage}_bullet3`,
  );
  const scheduleBullet4 = i18n.t(
    `settings.sleep_training_schedule_stage${scheduleStage}_bullet4`,
  );
  const waitRangeKey =
    ageWeeks < 4
      ? 'newborn'
      : ageWeeks < 12
        ? '4_to_12'
        : ageWeeks < 24
          ? '3_to_6'
          : ageWeeks < 36
            ? '6_to_9'
            : '9_plus';
  const waitTitle = i18n.t(`settings.sleep_training_waits_current_${waitRangeKey}_title`);
  const waitWindow = i18n.t(`settings.sleep_training_waits_current_${waitRangeKey}_window`);
  const waitBullet1 = i18n.t('settings.sleep_training_waits_current_support_1');
  const waitBullet2 = i18n.t('settings.sleep_training_waits_current_support_2');
  const waitBullet3 = i18n.t('settings.sleep_training_waits_current_support_3');
  const waitBullet4 = i18n.t('settings.sleep_training_waits_current_support_4');

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
          overflow: 'hidden',
          transform: 'translateY(0)',
          transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
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
              padding: spacing.xs,
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
            margin: 0,
            paddingTop: spacing.xs,
            textAlign: 'center',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: theme.textMuted,
            fontFamily: fonts.mono,
          }}
        >
          {babyName}
        </p>
        <h2
          style={{
            margin: 0,
            padding: `${spacing.xs}px ${spacing.lg}px 0`,
            textAlign: 'center',
            color: theme.text,
            fontFamily: fonts.display,
            fontSize: 28,
            lineHeight: '32px',
          }}
        >
          {i18n.t('settings.sleep_training_info_title')}
        </h2>

        <div
          style={{
            overflowY: 'auto',
            padding: `${spacing.lg}px ${spacing.lg}px 48px`,
            display: 'grid',
            gap: spacing.lg,
          }}
        >
          <Section title={i18n.t('settings.sleep_training_checklist_title')}>
            <Bullet>{i18n.t('settings.sleep_training_checklist_blackout')}</Bullet>
            <Bullet>{i18n.t('settings.sleep_training_checklist_swaddle')}</Bullet>
            <Bullet>{i18n.t('settings.sleep_training_checklist_noise')}</Bullet>
            <Bullet>{i18n.t('settings.sleep_training_checklist_drowsy')}</Bullet>
            <Bullet>{i18n.t('settings.sleep_training_checklist_ghost')}</Bullet>
          </Section>

          <Section title={scheduleTitle}>
            <p
              style={{
                margin: 0,
                color: theme.text,
                fontFamily: fonts.mono,
                fontSize: 16,
                lineHeight: '22px',
              }}
            >
              {scheduleCycle}
            </p>
            <Bullet>{scheduleBullet1}</Bullet>
            <Bullet>{scheduleBullet2}</Bullet>
            <Bullet>{scheduleBullet3}</Bullet>
            <Bullet>{scheduleBullet4}</Bullet>
          </Section>

          <Section title={i18n.t('settings.sleep_training_waits_title')}>
            <p
              style={{
                margin: 0,
                color: theme.text,
                fontFamily: fonts.mono,
                fontSize: 16,
                lineHeight: '22px',
              }}
            >
              {waitTitle}
            </p>
            <Bullet>{waitWindow}</Bullet>
            <Bullet>{waitBullet1}</Bullet>
            <Bullet>{waitBullet2}</Bullet>
            <Bullet>{waitBullet3}</Bullet>
            <Bullet>{waitBullet4}</Bullet>
          </Section>

          <Section title={i18n.t('settings.sleep_training_notes_title')}>
            <Bullet>{i18n.t('settings.sleep_training_notes_wake')}</Bullet>
            <Bullet>{i18n.t('settings.sleep_training_notes_crying')}</Bullet>
            <Bullet>{i18n.t('settings.sleep_training_notes_regressions')}</Bullet>
          </Section>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
