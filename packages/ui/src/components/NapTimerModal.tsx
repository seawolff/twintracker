/** Full-screen nap timer modal (native). Radial scrub adjusts the alarm time. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import type { NapAlarm } from '@tt/core';
import { useThemeContext, i18n } from '@tt/core';
import { fonts, spacing, radius } from '../theme/tokens';

const { width: SCREEN_W } = Dimensions.get('window');
const RING_SIZE = Math.min(SCREEN_W - 64, 300);
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

  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(alarm.firesAt).getTime() - Date.now()),
  );
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubMinutes, setScrubMinutes] = useState(0);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState('');

  // Refs so PanResponder callbacks always see fresh values without re-creating the responder
  const ringContainerRef = useRef<View>(null);
  const ringCenterRef = useRef({ x: SCREEN_W / 2, y: 0 });
  const scrubMinutesRef = useRef(0);
  const isScrubbingRef = useRef(false);

  // Sync remaining time every second (pause while scrubbing or editing)
  useEffect(() => {
    if (isScrubbing || isEditingText || !visible) {
      return;
    }
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, new Date(alarm.firesAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [alarm.firesAt, isScrubbing, isEditingText, visible]);

  // Reset remaining when alarm changes (e.g. after reschedule)
  useEffect(() => {
    setRemainingMs(Math.max(0, new Date(alarm.firesAt).getTime() - Date.now()));
  }, [alarm.firesAt]);

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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          isScrubbingRef.current = true;
          setIsScrubbing(true);
          const initMins = Math.max(1, Math.min(MAX_MINUTES, Math.round(remainingMs / 60_000)));
          scrubMinutesRef.current = initMins;
          setScrubMinutes(initMins);
        },
        onPanResponderMove: (_, gs) => {
          const { x, y } = ringCenterRef.current;
          const angle = posToAngle(gs.moveX, gs.moveY, x, y);
          const mins = Math.max(1, Math.min(MAX_MINUTES, Math.round((angle / 360) * MAX_MINUTES)));
          scrubMinutesRef.current = mins;
          setScrubMinutes(mins);
        },
        onPanResponderRelease: () => {
          isScrubbingRef.current = false;
          setIsScrubbing(false);
          const mins = scrubMinutesRef.current;
          const newFiresAt = new Date(Date.now() + mins * 60_000).toISOString();
          onReschedule(newFiresAt, mins * 60_000);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }),
    [],
  );

  function onRingLayout() {
    ringContainerRef.current?.measureInWindow((x, y, width, height) => {
      ringCenterRef.current = { x: x + width / 2, y: y + height / 2 };
    });
  }

  function commitTextEdit() {
    const mins = Math.max(1, Math.min(MAX_MINUTES, parseInt(editText, 10) || 0));
    if (mins > 0) {
      const newFiresAt = new Date(Date.now() + mins * 60_000).toISOString();
      onReschedule(newFiresAt, mins * 60_000);
    }
    setIsEditingText(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: theme.bg }]} {...panResponder.panHandlers}>
        {/* Back / dismiss (alarm stays active) */}
        <Pressable onPress={onDismiss} accessibilityLabel="Back" style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.textMuted, fontFamily: fonts.mono }]}>
            {i18n.t('common.back')}
          </Text>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}>
            {alarm.label}
          </Text>
        </View>

        {/* Ring */}
        <View ref={ringContainerRef} style={styles.ringContainer} onLayout={onRingLayout}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            {/* Track */}
            <Circle
              cx={RING_CX}
              cy={RING_CY}
              r={RING_R}
              stroke={theme.border}
              strokeWidth={STROKE}
              fill="none"
            />
            {/* Progress arc */}
            <Circle
              cx={RING_CX}
              cy={RING_CY}
              r={RING_R}
              stroke={theme.text}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${RING_CX}, ${RING_CY}`}
            />
            {/* Fire time */}
            <SvgText
              x={RING_CX}
              y={RING_CY - 28}
              textAnchor="middle"
              fontSize={13}
              fontFamily={fonts.mono}
              fill={theme.textMuted}
            >
              {`\uD83D\uDD14 ${fmtTime(fireTime)}`}
            </SvgText>
            {/* MM:SS countdown — tapping opens text edit */}
            <SvgText
              x={RING_CX}
              y={RING_CY + 20}
              textAnchor="middle"
              fontSize={52}
              fontFamily={fonts.mono}
              fontWeight="300"
              fill={theme.text}
            >
              {centerLabel}
            </SvgText>
          </Svg>

          {/* Invisible tap target over the MM:SS area to enter edit mode */}
          {!isScrubbing && (
            <Pressable
              onPress={() => {
                setEditText(String(Math.max(1, Math.round(remainingMs / 60_000))));
                setIsEditingText(true);
              }}
              style={styles.textTapTarget}
            />
          )}
        </View>

        {/* Inline minute editor */}
        {isEditingText && (
          <View style={[styles.editRow, { borderColor: theme.border }]}>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              keyboardType="number-pad"
              autoFocus
              onBlur={commitTextEdit}
              onSubmitEditing={commitTextEdit}
              style={[
                styles.editInput,
                { color: theme.text, fontFamily: fonts.mono, borderColor: theme.border },
              ]}
            />
            <Text style={[styles.editUnit, { color: theme.textMuted, fontFamily: fonts.mono }]}>
              {i18n.t('nap_timer.min')}
            </Text>
          </View>
        )}

        {/* Scrub hint */}
        {!isEditingText && (
          <Text style={[styles.hint, { color: theme.textMuted, fontFamily: fonts.mono }]}>
            {isScrubbing
              ? i18n.t('nap_timer.set_to_min', { n: String(scrubMinutes) })
              : i18n.t('nap_timer.hint_tap')}
          </Text>
        )}

        {/* Cancel alarm (destructive) */}
        <Pressable
          onPress={onCancel}
          accessibilityLabel="Cancel alarm"
          style={[styles.cancelBtn, { borderColor: theme.border }]}
        >
          <Text style={[styles.cancelText, { color: theme.textMuted, fontFamily: fonts.mono }]}>
            {i18n.t('nap_timer.cancel_alarm')}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 60,
  },
  header: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textTapTarget: {
    position: 'absolute',
    width: RING_SIZE * 0.55,
    height: 80,
    top: RING_SIZE / 2 - 20,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  editInput: {
    fontSize: 32,
    width: 80,
    textAlign: 'center',
  },
  editUnit: {
    fontSize: 18,
  },
  hint: {
    marginTop: spacing.lg,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  backBtn: {
    position: 'absolute',
    top: 24,
    left: 24,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 14,
  },
  cancelBtn: {
    position: 'absolute',
    bottom: 60,
    left: 40,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 14,
  },
});
