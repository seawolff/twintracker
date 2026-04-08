import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TextInput = RNTextInput as any;
import type { Baby, EventType, LogEventPayload, TrackerEvent } from '@tt/core';
import {
  useThemeContext,
  BOTTLE_OZ,
  MAX_BOTTLE_OZ,
  NURSING_MINUTES,
  NURSING_BREAST_OPTIONS,
  DIAPER_OPTIONS,
  i18n,
  authorColor,
} from '@tt/core';
import type { DiaperOption, NursingBreast } from '@tt/core';
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
  /** Pre-select this breast side when opening a nursing log. */
  suggestedBreast?: NursingBreast;
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
  suggestedBreast,
}: LogSheetProps) {
  const theme = useThemeContext();
  const isEditing = !!initialEvent;
  const [selectedOz, setSelectedOz] = useState<number>(initialEvent?.value ?? 4);
  const [ozInput, setOzInput] = useState<string>(String(initialEvent?.value ?? 4));
  const [selectedNursingMinutes, setSelectedNursingMinutes] = useState<number>(
    initialEvent?.value ?? 15,
  );
  const [selectedBreast, setSelectedBreast] = useState<NursingBreast>(
    (initialEvent?.type === 'nursing' ? (initialEvent?.notes as NursingBreast) : null) ?? 'left',
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
  // Inline date/time picker overlay state — rendered inside this Modal so no stacking issues.
  const [picker, setPicker] = useState<{ field: 'startedAt' | 'endedAt'; value: Date } | null>(
    null,
  );

  // Captured sheet height — used to size the picker overlay to match the sheet exactly.
  const [sheetHeight, setSheetHeight] = useState(0);

  // Spring animation — sheet slides up with bounce, backdrop fades in
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  /** Tracks live drag offset during swipe-down gesture; combined with translateY via Animated.add. */
  const dragY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const initStart = initialEvent?.startedAt ?? initialStartedAt ?? new Date().toISOString();
    setEditStartedAt(initStart);
    setHasEndTime(!!initialEvent?.endedAt);
    setEditEndedAt(initialEvent?.endedAt ?? new Date().toISOString());
    if (initialEvent) {
      setSelectedOz(initialEvent.value ?? 4);
      setOzInput(String(initialEvent.value ?? 4));
      setSelectedNursingMinutes(initialEvent.value ?? 15);
      setSelectedBreast((initialEvent.notes as NursingBreast) ?? 'left');
      setSelectedDiaper((initialEvent.notes as DiaperOption) ?? 'wet');
      setNotesText(initialEvent.notes ?? '');
    } else {
      setSelectedOz(suggestedOz ?? 4);
      setOzInput(String(suggestedOz ?? 4));
      setSelectedNursingMinutes(15);
      setSelectedBreast(suggestedBreast ?? 'left');
      setSelectedDiaper('wet');
      setNotesText('');
    }
    setPicker(null);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visible) {
      translateY.setValue(600);
      dragY.setValue(0);
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
  }, [visible, translateY, dragY, backdropOpacity]);

  /** Minimum downward drag (px) before the sheet dismisses on release. */
  const SWIPE_DISMISS_THRESHOLD = 80;

  const panResponder = useRef(
    PanResponder.create({
      // Claim touches that start on the drag zone (pill + header).
      // The Pressable close button is deeper so it still wins for taps on it
      // (deepest component wins in the bubble phase). onMoveShouldSetPanResponderCapture
      // steals from it if the user turns a tap into a downward swipe.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          dragY.setValue(g.dy);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy >= SWIPE_DISMISS_THRESHOLD) {
          Animated.timing(dragY, {
            toValue: 600,
            duration: 150,
            useNativeDriver: true,
          }).start(onClose);
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 300,
          }).start();
        }
      },
    }),
  ).current;

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
      payload.value = Math.min(parseFloat(ozInput) || selectedOz, MAX_BOTTLE_OZ);
      payload.unit = 'oz';
    } else if (eventType === 'nursing') {
      payload.value = selectedNursingMinutes;
      payload.unit = 'min';
      payload.notes = selectedBreast;
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
      {/* Animated backdrop — sits behind the sheet */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.backdropPress}
          onPress={onClose}
          accessibilityLabel={i18n.t('log_sheet.close')}
        />
      </Animated.View>

      {/* Animated sheet — springs up from bottom; drag handle allows swipe-down dismiss */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: theme.surface, borderTopColor: theme.border },
          { transform: [{ translateY: Animated.add(translateY, dragY) }] },
        ]}
        onLayout={e => setSheetHeight(e.nativeEvent.layout.height)}
      >
        {/* Drag zone: pill handle + full header row — wide swipe target for dismiss gesture */}
        <View {...panResponder.panHandlers}>
          <View style={styles.dragHandleArea}>
            <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
          </View>

          {/* Header — lives outside ScrollView so the panResponder covers it */}
          <View style={styles.header}>
            <View>
              {isEditing && (
                <Text
                  style={[styles.editLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}
                >
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
                    style={[
                      styles.loggedByText,
                      { color: theme.textMuted, fontFamily: fonts.mono },
                    ]}
                  >
                    {i18n.t('log_sheet.logged_by', { name: initialEvent.loggedByName })}
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel={i18n.t('log_sheet.close')}
              style={styles.closeBtn}
            >
              <CloseIcon size={20} color={theme.textDim} />
            </Pressable>
          </View>
        </View>

        {/* ScrollView with automaticallyAdjustKeyboardInsets: the sheet stays pinned at the
            bottom and the scroll view adjusts its bottom inset so the focused input sits
            just above the keyboard — same feel as web. */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={[styles.eventTypeLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}>
            {typeLabel}
          </Text>

          <View style={styles.content}>
            {eventType === 'bottle' && (
              <View>
                <Text
                  style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                >
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
                    const n = parseFloat(v);
                    if (!isNaN(n) && n > MAX_BOTTLE_OZ) {
                      setOzInput(String(MAX_BOTTLE_OZ));
                      setSelectedOz(MAX_BOTTLE_OZ);
                    } else {
                      setOzInput(v);
                      if (!isNaN(n) && n > 0) {
                        setSelectedOz(n);
                      }
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
                <Text
                  style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                >
                  {i18n.t('log_sheet.nursing_breast')}
                </Text>
                <View style={styles.pillRow}>
                  {NURSING_BREAST_OPTIONS.map(side => {
                    const active = selectedBreast === side;
                    return (
                      <Pressable
                        key={side}
                        onPress={() => setSelectedBreast(side)}
                        accessibilityLabel={i18n.t(`log_sheet.nursing_${side}`)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
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
                          {i18n.t(`log_sheet.nursing_${side}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text
                  style={[
                    styles.contentLabel,
                    { color: theme.textDim, fontFamily: fonts.mono, marginTop: spacing.sm },
                  ]}
                >
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
                <Text
                  style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                >
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
              <Pressable
                onPress={() => setPicker({ field: 'startedAt', value: new Date(editStartedAt) })}
                accessibilityLabel={i18n.t('log_sheet.edit_start_time')}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.timeValue,
                    styles.timeValueTappable,
                    { color: theme.text, fontFamily: fonts.mono },
                  ]}
                >
                  {formatDate(editStartedAt)}
                </Text>
              </Pressable>
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
              <Pressable
                onPress={() => setPicker({ field: 'startedAt', value: new Date(editStartedAt) })}
                accessibilityLabel={i18n.t('log_sheet.edit_start_time')}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.timeValue,
                    styles.timeValueTappable,
                    { color: theme.text, fontFamily: fonts.mono },
                  ]}
                >
                  {formatTime(new Date(editStartedAt))}
                </Text>
              </Pressable>
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
            {(isEditing || !!initialStartedAt) &&
              (eventType === 'nap' || eventType === 'sleep') && (
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
                          {
                            color: hasEndTime ? theme.bg : theme.textMuted,
                            fontFamily: fonts.mono,
                          },
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
                        <Pressable
                          onPress={() =>
                            setPicker({ field: 'endedAt', value: new Date(editEndedAt) })
                          }
                          accessibilityLabel={i18n.t('log_sheet.edit_end_time')}
                          accessibilityRole="button"
                        >
                          <Text
                            style={[
                              styles.timeValue,
                              styles.timeValueTappable,
                              { color: theme.text, fontFamily: fonts.mono },
                            ]}
                          >
                            {formatDate(editEndedAt)}
                          </Text>
                        </Pressable>
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
                        <Pressable
                          onPress={() =>
                            setPicker({ field: 'endedAt', value: new Date(editEndedAt) })
                          }
                          accessibilityLabel={i18n.t('log_sheet.edit_end_time')}
                          accessibilityRole="button"
                        >
                          <Text
                            style={[
                              styles.timeValue,
                              styles.timeValueTappable,
                              { color: theme.text, fontFamily: fonts.mono },
                            ]}
                          >
                            {formatTime(new Date(editEndedAt))}
                          </Text>
                        </Pressable>
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
        </ScrollView>

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

      {/* Inline datetime picker overlay — rendered inside this Modal so it stacks correctly */}
      {picker !== null && (
        <>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)} />
          <View
            style={[
              styles.pickerOverlay,
              { backgroundColor: theme.surface, borderTopColor: theme.border },
              sheetHeight > 0 && { height: sheetHeight },
            ]}
          >
            <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.pickerTitle, { color: theme.text, fontFamily: fonts.mono }]}>
              {i18n.t(
                picker.field === 'startedAt'
                  ? 'log_sheet.edit_start_time'
                  : 'log_sheet.edit_end_time',
              )}
            </Text>
            <View style={[styles.pickerDivider, { backgroundColor: theme.border }]} />
            {/* Flex wrapper centers the spinner vertically in extra white space */}
            <View style={styles.pickerSpinnerWrap}>
              <DateTimePicker
                value={picker.value}
                mode="datetime"
                display="spinner"
                onChange={(_: DateTimePickerEvent, d?: Date) => {
                  if (d) {
                    setPicker(p => (p ? { ...p, value: d } : p));
                  }
                }}
                style={styles.dtPicker}
                {...(Platform.OS === 'ios'
                  ? {
                      textColor: theme.text,
                      themeVariant: theme.mode === 'night' ? 'dark' : 'light',
                    }
                  : {})}
              />
            </View>
            <View style={[styles.pickerDivider, { backgroundColor: theme.border }]} />
            <View style={styles.pickerActions}>
              <Pressable
                style={styles.pickerActionBtn}
                onPress={() => setPicker(null)}
                accessibilityLabel={i18n.t('common.cancel')}
              >
                <Text style={[styles.pickerCancelText, { color: theme.textMuted }]}>
                  {i18n.t('common.cancel')}
                </Text>
              </Pressable>
              <View style={[styles.pickerActionDivider, { backgroundColor: theme.border }]} />
              <Pressable
                style={styles.pickerActionBtn}
                onPress={() => {
                  if (picker.field === 'startedAt') {
                    setEditStartedAt(picker.value.toISOString());
                  } else {
                    setEditEndedAt(picker.value.toISOString());
                  }
                  setPicker(null);
                }}
                accessibilityLabel={i18n.t('common.save')}
              >
                <Text style={[styles.pickerSaveText, { color: theme.accent }]}>
                  {i18n.t('common.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
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
    paddingTop: spacing.sm,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginHorizontal: -spacing.lg,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
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
  timeValueTappable: {
    textDecorationLine: 'underline',
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
  // Inline picker overlay — sits above the sheet inside the same Modal
  pickerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 12,
    paddingBottom: 36,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  pickerDivider: {
    height: StyleSheet.hairlineWidth,
  },
  dtPicker: {
    width: '100%',
    height: 216,
  },
  pickerActions: {
    flexDirection: 'row',
    height: 56,
  },
  pickerActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerActionDivider: {
    width: StyleSheet.hairlineWidth,
  },
  pickerCancelText: {
    fontSize: 17,
    fontWeight: '400',
  },
  pickerSaveText: {
    fontSize: 17,
    fontWeight: '600',
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  pickerSpinnerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
