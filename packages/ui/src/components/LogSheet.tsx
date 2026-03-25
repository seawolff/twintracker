import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TextInput = RNTextInput as any;
import type { Baby, EventType, LogEventPayload, TrackerEvent } from '@tt/core';
import {
  useThemeContext,
  BOTTLE_OZ,
  NURSING_MINUTES,
  DIAPER_OPTIONS,
  i18n,
  authorColor,
} from '@tt/core';
import type { DiaperOption } from '@tt/core';
import { spacing, radius, fonts } from '../theme/tokens';
import { CloseIcon } from './icons/BabyIcons';

export interface LogSheetProps {
  visible: boolean;
  baby: Baby | null;
  eventType: EventType | null;
  onSubmit: (payload: LogEventPayload) => void;
  onClose: () => void;
  initialEvent?: TrackerEvent;
  onEdit?: (id: string, payload: LogEventPayload) => void;
  /** Pre-set the start time (ISO string). Ignored when initialEvent is set. */
  initialStartedAt?: string;
  /** Pre-select this oz value when opening a bottle log. */
  suggestedOz?: number;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function LogSheet({
  visible,
  baby,
  eventType,
  onSubmit,
  onClose,
  initialEvent,
  onEdit,
  initialStartedAt,
  suggestedOz,
}: LogSheetProps) {
  const theme = useThemeContext();
  const isEditing = !!initialEvent;
  const [selectedOz, setSelectedOz] = useState<number>(initialEvent?.value ?? 4);
  const [ozInput, setOzInput] = useState<string>(String(initialEvent?.value ?? 4));
  const [selectedNursingMinutes, setSelectedNursingMinutes] = useState<number>(
    initialEvent?.value ?? 15,
  );
  const [selectedDiaper, setSelectedDiaper] = useState<DiaperOption>(
    (initialEvent?.notes as DiaperOption) ?? 'wet',
  );
  const [notesText, setNotesText] = useState<string>(
    eventType === 'food' || eventType === 'milestone' || eventType === 'medicine'
      ? (initialEvent?.notes ?? '')
      : '',
  );
  const [editStartedAt, setEditStartedAt] = useState<string>(
    initialEvent?.startedAt ?? initialStartedAt ?? new Date().toISOString(),
  );
  const [editEndedAt, setEditEndedAt] = useState<string>(
    initialEvent?.endedAt ?? new Date().toISOString(),
  );
  const [hasEndTime, setHasEndTime] = useState<boolean>(!!initialEvent?.endedAt);

  // Spring animation — sheet slides up with bounce, backdrop fades in
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const initStart = initialEvent?.startedAt ?? initialStartedAt ?? new Date().toISOString();
    setEditStartedAt(initStart);
    setHasEndTime(!!initialEvent?.endedAt);
    setEditEndedAt(initialEvent?.endedAt ?? new Date().toISOString());
    if (initialEvent) {
      setSelectedOz(initialEvent.value ?? 4);
      setOzInput(String(initialEvent.value ?? 4));
      setSelectedNursingMinutes(initialEvent.value ?? 15);
      setSelectedDiaper((initialEvent.notes as DiaperOption) ?? 'wet');
      setNotesText(initialEvent.notes ?? '');
    } else {
      setSelectedOz(suggestedOz ?? 4);
      setOzInput(String(suggestedOz ?? 4));
      setSelectedNursingMinutes(15);
      setSelectedDiaper('wet');
      setNotesText('');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visible) {
      translateY.setValue(600);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
          mass: 0.85,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  if (!baby || !eventType) {
    return null;
  }

  const typeLabel = i18n.t(`log_sheet.types.${eventType}`);

  function adjustTime(deltaMinutes: number) {
    setEditStartedAt(prev => {
      const d = new Date(prev);
      d.setMinutes(d.getMinutes() + deltaMinutes);
      return d.toISOString();
    });
  }

  function adjustDay(deltaDays: number) {
    setEditStartedAt(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + deltaDays);
      return d.toISOString();
    });
  }

  function adjustEndTime(deltaMinutes: number) {
    setEditEndedAt(prev => {
      const d = new Date(prev);
      d.setMinutes(d.getMinutes() + deltaMinutes);
      return d.toISOString();
    });
  }

  function adjustEndDay(deltaDays: number) {
    setEditEndedAt(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + deltaDays);
      return d.toISOString();
    });
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function handleSubmit() {
    if (!baby || !eventType) {
      return;
    }
    const payload: LogEventPayload = {
      babyId: baby.id,
      type: eventType,
      startedAt: editStartedAt,
    };
    if (eventType === 'bottle') {
      payload.value = parseFloat(ozInput) || selectedOz;
      payload.unit = 'oz';
    } else if (eventType === 'nursing') {
      payload.value = selectedNursingMinutes;
      payload.unit = 'min';
    } else if (eventType === 'diaper') {
      payload.notes = selectedDiaper;
    } else if (eventType === 'food' || eventType === 'milestone' || eventType === 'medicine') {
      payload.notes = notesText.trim();
    } else if (eventType === 'nap' || eventType === 'sleep') {
      if ((isEditing || !!initialStartedAt) && hasEndTime) {
        const endMs = new Date(editEndedAt).getTime();
        const startMs = new Date(editStartedAt).getTime();
        if (endMs > startMs) {
          payload.endedAt = editEndedAt;
        }
      }
    }
    if (isEditing && initialEvent && onEdit) {
      onEdit(initialEvent.id, payload);
    } else {
      onSubmit(payload);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Animated backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.backdropPress}
          onPress={onClose}
          accessibilityLabel="Close log sheet"
        />
      </Animated.View>

      {/* Animated sheet — springs up from bottom */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: theme.surface, borderTopColor: theme.border },
          { transform: [{ translateY }] },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            {isEditing && (
              <Text style={[styles.editLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}>
                {i18n.t('log_sheet.edit_label')}
              </Text>
            )}
            <Text style={[styles.babyName, { color: theme.text, fontFamily: fonts.display }]}>
              {baby.name}
            </Text>
            {isEditing && initialEvent?.loggedByName && (
              <View style={styles.loggedByRow}>
                <View
                  style={[
                    styles.loggedByAvatar,
                    { backgroundColor: authorColor(initialEvent.loggedByName) },
                  ]}
                >
                  <Text style={styles.loggedByInitial}>
                    {initialEvent.loggedByName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text
                  style={[styles.loggedByText, { color: theme.textMuted, fontFamily: fonts.mono }]}
                >
                  {i18n.t('log_sheet.logged_by', { name: initialEvent.loggedByName })}
                </Text>
              </View>
            )}
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Close" style={styles.closeBtn}>
            <CloseIcon size={20} color={theme.textDim} />
          </Pressable>
        </View>

        <Text style={[styles.eventTypeLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}>
          {typeLabel}
        </Text>

        <View style={styles.content}>
          {eventType === 'bottle' && (
            <View>
              <Text style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}>
                {i18n.t('log_sheet.amount_oz')}
              </Text>
              <View style={styles.pillRow}>
                {BOTTLE_OZ.map(oz => {
                  const active = selectedOz === oz;
                  return (
                    <Pressable
                      key={oz}
                      onPress={() => {
                        setSelectedOz(oz);
                        setOzInput(String(oz));
                      }}
                      accessibilityLabel={`${oz} oz`}
                      style={[
                        styles.pill,
                        { borderColor: theme.border },
                        active && { backgroundColor: theme.accent, borderColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          { color: active ? theme.bg : theme.text, fontFamily: fonts.mono },
                        ]}
                      >
                        {oz}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text
                style={[
                  styles.contentLabel,
                  { color: theme.textDim, fontFamily: fonts.mono, marginTop: spacing.md },
                ]}
              >
                {i18n.t('log_sheet.custom_amount_oz')}
              </Text>
              <TextInput
                value={ozInput}
                onChangeText={(v: string) => {
                  setOzInput(v);
                  const n = parseFloat(v);
                  if (!isNaN(n)) {
                    setSelectedOz(n);
                  }
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.notesInput,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontFamily: fonts.mono,
                  },
                ]}
              />
            </View>
          )}

          {eventType === 'nursing' && (
            <View>
              <Text style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}>
                {i18n.t('log_sheet.duration_min')}
              </Text>
              <View style={styles.pillRow}>
                {NURSING_MINUTES.map(m => {
                  const active = selectedNursingMinutes === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setSelectedNursingMinutes(m)}
                      accessibilityLabel={`${m} minutes`}
                      style={[
                        styles.pill,
                        { borderColor: theme.border },
                        active && { backgroundColor: theme.accent, borderColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          { color: active ? theme.bg : theme.text, fontFamily: fonts.mono },
                        ]}
                      >
                        {m}m
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {(eventType === 'food' || eventType === 'milestone' || eventType === 'medicine') && (
            <View>
              <Text style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}>
                {eventType === 'food'
                  ? i18n.t('log_sheet.what_did_they_eat')
                  : eventType === 'milestone'
                    ? i18n.t('log_sheet.describe_milestone')
                    : i18n.t('log_sheet.medicine_notes')}
              </Text>
              <TextInput
                value={notesText}
                onChangeText={setNotesText}
                placeholder={
                  eventType === 'food'
                    ? i18n.t('log_sheet.food_placeholder')
                    : eventType === 'milestone'
                      ? i18n.t('log_sheet.milestone_placeholder')
                      : i18n.t('log_sheet.medicine_placeholder')
                }
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.notesInput,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontFamily: fonts.mono,
                  },
                ]}
                multiline={false}
                returnKeyType="done"
              />
            </View>
          )}

          {eventType === 'diaper' && (
            <View style={styles.pillRow}>
              {DIAPER_OPTIONS.map(opt => {
                const active = selectedDiaper === opt;
                const label = opt.charAt(0).toUpperCase() + opt.slice(1);
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setSelectedDiaper(opt)}
                    accessibilityLabel={label}
                    style={[
                      styles.pill,
                      { borderColor: theme.border },
                      active && { backgroundColor: theme.accent, borderColor: theme.accent },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        { color: active ? theme.bg : theme.text, fontFamily: fonts.mono },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {eventType !== 'bottle' &&
            eventType !== 'diaper' &&
            eventType !== 'nap' &&
            eventType !== 'sleep' &&
            eventType !== 'food' &&
            eventType !== 'milestone' &&
            eventType !== 'medicine' &&
            !isEditing && (
              <Text style={[styles.confirmText, { color: theme.text, fontFamily: fonts.mono }]}>
                Log {typeLabel}
              </Text>
            )}

          {/* Date + time steppers — shown for all event types */}
          <Text
            style={[
              styles.contentLabel,
              { color: theme.textDim, fontFamily: fonts.mono, marginTop: 16 },
            ]}
          >
            {i18n.t('log_sheet.start_time')}
          </Text>
          {/* Day row */}
          <View style={[styles.timeStepRow, { marginBottom: 8 }]}>
            <Pressable
              onPress={() => adjustDay(-1)}
              accessibilityLabel="Previous day"
              style={[styles.stepBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}>
                −1d
              </Text>
            </Pressable>
            <Text style={[styles.timeValue, { color: theme.text, fontFamily: fonts.mono }]}>
              {formatDate(editStartedAt)}
            </Text>
            <Pressable
              onPress={() => adjustDay(1)}
              accessibilityLabel="Next day"
              style={[styles.stepBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}>
                +1d
              </Text>
            </Pressable>
          </View>
          {/* Time row */}
          <View style={styles.timeStepRow}>
            <Pressable
              onPress={() => adjustTime(-15)}
              accessibilityLabel="Subtract 15 minutes"
              style={[styles.stepBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}>
                −15m
              </Text>
            </Pressable>
            <Pressable
              onPress={() => adjustTime(-5)}
              accessibilityLabel="Subtract 5 minutes"
              style={[styles.stepBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}>
                −5m
              </Text>
            </Pressable>
            <Text style={[styles.timeValue, { color: theme.text, fontFamily: fonts.mono }]}>
              {formatTime(new Date(editStartedAt))}
            </Text>
            <Pressable
              onPress={() => adjustTime(5)}
              accessibilityLabel="Add 5 minutes"
              style={[styles.stepBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}>
                +5m
              </Text>
            </Pressable>
            <Pressable
              onPress={() => adjustTime(15)}
              accessibilityLabel="Add 15 minutes"
              style={[styles.stepBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}>
                +15m
              </Text>
            </Pressable>
          </View>

          {/* End time — only for history logs (editing or quick-add with a past start time), not live baby-card logs */}
          {(isEditing || !!initialStartedAt) && (eventType === 'nap' || eventType === 'sleep') && (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 20,
                  marginBottom: hasEndTime ? 0 : 4,
                }}
              >
                <Text
                  style={[
                    styles.contentLabel,
                    { color: theme.textDim, fontFamily: fonts.mono, marginTop: 0, flex: 1 },
                  ]}
                >
                  {i18n.t('log_sheet.end_time')}
                </Text>
                <Pressable
                  onPress={() => {
                    if (!hasEndTime) {
                      setEditEndedAt(new Date().toISOString());
                    }
                    setHasEndTime(v => !v);
                  }}
                  style={[
                    styles.endTimeToggle,
                    {
                      borderColor: theme.border,
                      backgroundColor: hasEndTime ? theme.accent : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.endTimeToggleText,
                      { color: hasEndTime ? theme.bg : theme.textMuted, fontFamily: fonts.mono },
                    ]}
                  >
                    {hasEndTime
                      ? i18n.t('log_sheet.end_time_set')
                      : i18n.t('log_sheet.still_sleeping')}
                  </Text>
                </Pressable>
              </View>
              {hasEndTime && (
                <>
                  <View style={[styles.timeStepRow, { marginBottom: 8 }]}>
                    <Pressable
                      onPress={() => adjustEndDay(-1)}
                      accessibilityLabel="End: previous day"
                      style={[styles.stepBtn, { borderColor: theme.border }]}
                    >
                      <Text
                        style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}
                      >
                        −1d
                      </Text>
                    </Pressable>
                    <Text style={[styles.timeValue, { color: theme.text, fontFamily: fonts.mono }]}>
                      {formatDate(editEndedAt)}
                    </Text>
                    <Pressable
                      onPress={() => adjustEndDay(1)}
                      accessibilityLabel="End: next day"
                      style={[styles.stepBtn, { borderColor: theme.border }]}
                    >
                      <Text
                        style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}
                      >
                        +1d
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.timeStepRow}>
                    <Pressable
                      onPress={() => adjustEndTime(-15)}
                      accessibilityLabel="End: subtract 15 minutes"
                      style={[styles.stepBtn, { borderColor: theme.border }]}
                    >
                      <Text
                        style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}
                      >
                        −15m
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => adjustEndTime(-5)}
                      accessibilityLabel="End: subtract 5 minutes"
                      style={[styles.stepBtn, { borderColor: theme.border }]}
                    >
                      <Text
                        style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}
                      >
                        −5m
                      </Text>
                    </Pressable>
                    <Text style={[styles.timeValue, { color: theme.text, fontFamily: fonts.mono }]}>
                      {formatTime(new Date(editEndedAt))}
                    </Text>
                    <Pressable
                      onPress={() => adjustEndTime(5)}
                      accessibilityLabel="End: add 5 minutes"
                      style={[styles.stepBtn, { borderColor: theme.border }]}
                    >
                      <Text
                        style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}
                      >
                        +5m
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => adjustEndTime(15)}
                      accessibilityLabel="End: add 15 minutes"
                      style={[styles.stepBtn, { borderColor: theme.border }]}
                    >
                      <Text
                        style={[styles.stepText, { color: theme.text, fontFamily: fonts.mono }]}
                      >
                        +15m
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        <Pressable
          onPress={handleSubmit}
          accessibilityLabel={`${isEditing ? 'Update' : 'Log'} ${typeLabel} for ${baby.name}`}
          style={[styles.submitBtn, { backgroundColor: theme.accent }]}
        >
          <Text style={[styles.submitText, { color: theme.bg, fontFamily: fonts.mono }]}>
            {isEditing
              ? i18n.t('log_sheet.update', { type: typeLabel })
              : i18n.t('log_sheet.log', { type: typeLabel })}
          </Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

LogSheet.propTypes = {
  visible: PropTypes.bool.isRequired,
  baby: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
  }),
  eventType: PropTypes.oneOf([
    'bottle',
    'nursing',
    'nap',
    'sleep',
    'diaper',
    'medicine',
    'food',
    'milestone',
  ] as const),
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    borderTopWidth: 1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  babyName: {
    fontSize: 24,
    fontWeight: '700',
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTypeLabel: {
    fontSize: 12,
    marginBottom: spacing.md,
  },
  content: {
    marginBottom: spacing.lg,
  },
  contentLabel: {
    fontSize: 12,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 14,
  },
  confirmText: {
    fontSize: 14,
  },
  submitBtn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
  },
  editLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  loggedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  loggedByAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loggedByInitial: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 11,
  },
  loggedByText: {
    fontSize: 11,
  },
  timeStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  stepBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: 14,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    fontSize: 16,
    minHeight: 56,
  },
  endTimeToggle: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  endTimeToggleText: {
    fontSize: 12,
  },
});
