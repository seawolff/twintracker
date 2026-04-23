import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baby, EventType, LogEventPayload, TrackerEvent } from '@tt/core';
import {
  useThemeContext,
  BOTTLE_OZ,
  BOTTLE_SOURCE_OPTIONS,
  MAX_BOTTLE_OZ,
  MAX_PUMP_OZ,
  NURSING_MINUTES,
  NURSING_BREAST_OPTIONS,
  PUMP_MINUTES,
  PUMP_SIDE_OPTIONS,
  STASH_LOCATION_OPTIONS,
  STASH_BOTTLE_COUNTS,
  DIAPER_OPTIONS,
  i18n,
  authorColor,
  getSuggestedMilestones,
  milestoneLabel,
  parseMilestoneNotes,
  parseBottleNotes,
  parsePumpNotes,
  serializeMilestoneNotes,
  serializeBottleNotes,
  serializePumpNotes,
} from '@tt/core';
import type { BottleSource, DiaperOption, NursingBreast, PumpSide, StashLocation } from '@tt/core';
import { spacing, radius, fonts } from '../theme/tokens';
import { CloseIcon } from './icons/BabyIcons';

interface LogSheetProps {
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

function nowLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultEndTime(startVal: string): string {
  const d = new Date(startVal);
  d.setHours(d.getHours() + 1);
  return toDatetimeLocal(d.toISOString());
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
  const [selectedOz, setSelectedOz] = useState<number>(4);
  const [selectedBottleSource, setSelectedBottleSource] = useState<BottleSource>('formula');
  const [ozInput, setOzInput] = useState<string>('4');
  const [selectedNursingMinutes, setSelectedNursingMinutes] = useState<number>(15);
  const [selectedBreast, setSelectedBreast] = useState<NursingBreast>('left');
  const [selectedPumpMinutes, setSelectedPumpMinutes] = useState<number>(15);
  const [selectedPumpSide, setSelectedPumpSide] = useState<PumpSide>('both');
  const [selectedStashCount, setSelectedStashCount] = useState<number>(0);
  const [selectedStashOz, setSelectedStashOz] = useState<number>(4);
  const [selectedStashLocation, setSelectedStashLocation] = useState<StashLocation>('fridge');
  const [selectedDiaper, setSelectedDiaper] = useState<DiaperOption>('wet');
  const [notesText, setNotesText] = useState<string>(
    initialEvent?.type === 'milestone'
      ? ((parseMilestoneNotes(initialEvent.notes).detail ??
          parseMilestoneNotes(initialEvent.notes).legacyText ??
          '') as string)
      : '',
  );
  const [selectedMilestoneKey, setSelectedMilestoneKey] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(nowLocal);
  const [endTime, setEndTime] = useState(() => defaultEndTime(nowLocal()));

  // Spring-in animation — entry only, matches iOS Clear aesthetic
  const [isIn, setIsIn] = useState(false);

  useEffect(() => {
    if (visible) {
      // Double rAF ensures the initial off-screen state renders before transition fires
      requestAnimationFrame(() => requestAnimationFrame(() => setIsIn(true)));
    } else {
      setIsIn(false);
    }
  }, [visible]);

  // Reset/initialize state each time the sheet opens
  useEffect(() => {
    if (visible) {
      if (initialEvent) {
        setStartTime(toDatetimeLocal(initialEvent.startedAt));
        setEndTime(initialEvent.endedAt ? toDatetimeLocal(initialEvent.endedAt) : '');
        if (initialEvent.type === 'bottle') {
          // Coerce to Number — pg returns NUMERIC columns as strings at runtime.
          setSelectedOz(Number(initialEvent.value ?? 4));
          setOzInput(String(initialEvent.value ?? 4));
          setSelectedBottleSource(parseBottleNotes(initialEvent.notes).source ?? 'formula');
        }
        if (initialEvent.type === 'nursing') {
          setSelectedNursingMinutes(Number(initialEvent.value ?? 15));
          setSelectedBreast((initialEvent.notes as NursingBreast) ?? 'left');
        }
        if (initialEvent.type === 'pump') {
          const pump = parsePumpNotes(initialEvent.notes);
          setSelectedOz(Number(initialEvent.value ?? 4));
          setOzInput(String(initialEvent.value ?? 4));
          setSelectedPumpSide(pump.side);
          setSelectedStashCount(pump.stashCount);
          setSelectedStashOz(pump.stashOzPerBottle ?? 4);
          setSelectedStashLocation(pump.stashLocation ?? 'fridge');
          setSelectedPumpMinutes(
            initialEvent.endedAt
              ? Math.max(
                  1,
                  Math.round(
                    (new Date(initialEvent.endedAt).getTime() -
                      new Date(initialEvent.startedAt).getTime()) /
                      60000,
                  ),
                )
              : 15,
          );
        }
        if (initialEvent.type === 'diaper') {
          setSelectedDiaper((initialEvent.notes as DiaperOption) ?? 'wet');
        }
        if (
          initialEvent.type === 'food' ||
          initialEvent.type === 'milestone' ||
          initialEvent.type === 'medicine'
        ) {
          if (initialEvent.type === 'milestone') {
            const milestone = parseMilestoneNotes(initialEvent.notes);
            setSelectedMilestoneKey(milestone.key);
            setNotesText(milestone.detail ?? milestone.legacyText ?? '');
          } else {
            setSelectedMilestoneKey(null);
            setNotesText(initialEvent.notes ?? '');
          }
        }
      } else {
        const initStart = initialStartedAt ? toDatetimeLocal(initialStartedAt) : nowLocal();
        setStartTime(initStart);
        setEndTime('');
        setSelectedOz(suggestedOz ?? 4);
        setOzInput(String(suggestedOz ?? 4));
        setSelectedBottleSource('formula');
        setSelectedNursingMinutes(15);
        setSelectedBreast(suggestedBreast ?? 'left');
        setSelectedPumpMinutes(15);
        setSelectedPumpSide('both');
        setSelectedStashCount(0);
        setSelectedStashOz(4);
        setSelectedStashLocation('fridge');
        setSelectedDiaper('wet');
        setSelectedMilestoneKey(null);
        setNotesText('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialEvent]);

  const timePickerStyle = useMemo<React.CSSProperties>(
    () => ({
      width: '100%',
      height: 56,
      padding: '0 12px',
      fontSize: 16,
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      background: theme.surface,
      color: theme.text,
      fontFamily: fonts.mono,
      boxSizing: 'border-box',
      colorScheme: 'dark',
    }),
    [theme],
  );

  if (!visible || !baby || !eventType) {
    return null;
  }

  const typeLabel = i18n.t(`log_sheet.types.${eventType}`);
  const suggestedMilestones = eventType === 'milestone' ? getSuggestedMilestones(baby.birthDate) : [];

  function handleSubmit() {
    if (!baby || !eventType) {
      return;
    }
    const payload: LogEventPayload = {
      babyId: baby.id,
      type: eventType,
      startedAt: new Date(startTime).toISOString(),
    };
    if (eventType === 'bottle') {
      payload.value = Math.min(parseFloat(ozInput) || selectedOz, MAX_BOTTLE_OZ);
      payload.unit = 'oz';
      payload.notes = serializeBottleNotes({ source: selectedBottleSource });
    } else if (eventType === 'nursing') {
      payload.value = selectedNursingMinutes;
      payload.unit = 'min';
      payload.notes = selectedBreast;
    } else if (eventType === 'pump') {
      payload.value = Math.min(parseFloat(ozInput) || selectedOz, MAX_PUMP_OZ);
      payload.unit = 'oz';
      payload.notes = serializePumpNotes({
        side: selectedPumpSide,
        stashCount: selectedStashCount,
        stashOzPerBottle: selectedStashCount > 0 ? selectedStashOz : null,
        stashLocation: selectedStashCount > 0 ? selectedStashLocation : null,
      });
      payload.endedAt = new Date(
        new Date(startTime).getTime() + selectedPumpMinutes * 60_000,
      ).toISOString();
    } else if (eventType === 'diaper') {
      payload.notes = selectedDiaper;
    } else if (eventType === 'food' || eventType === 'medicine') {
      payload.notes = notesText.trim();
    } else if (eventType === 'milestone') {
      payload.notes = serializeMilestoneNotes(selectedMilestoneKey, notesText.trim());
    } else if (eventType === 'nap' || eventType === 'sleep') {
      if ((isEditing || !!initialStartedAt) && endTime !== '') {
        const endMs = new Date(endTime).getTime();
        const startMs = new Date(startTime).getTime();
        if (endMs > startMs) {
          payload.endedAt = new Date(endTime).toISOString();
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* Animated backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.32)',
          opacity: isIn ? 1 : 0,
          transition: 'opacity 220ms ease',
        }}
        onClick={onClose}
        aria-label="Close log sheet"
      />

      {/* Animated sheet — springs up from bottom */}
      <div
        style={{
          transform: `translateY(${isIn ? '0%' : '100%'})`,
          transition: 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          position: 'relative',
        }}
      >
        <View
          style={[styles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
        >
          {/* Header */}
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
            <Pressable onPress={onClose} accessibilityLabel="Close" style={styles.closeBtn}>
              <CloseIcon size={20} color={theme.textDim} />
            </Pressable>
          </View>

          <Text style={[styles.eventTypeLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}>
            {typeLabel}
          </Text>

          <View style={styles.content}>
            {/* Start time — always shown */}
            <Text style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}>
              {i18n.t('log_sheet.start_time')}
            </Text>
            <input
              type="datetime-local"
              value={startTime}
              max={nowLocal()}
              onChange={e => setStartTime(e.target.value)}
              style={timePickerStyle}
            />

            {/* End time — only for history logs (editing or quick-add with a past start time), not live baby-card logs */}
            {(isEditing || !!initialStartedAt) &&
              (eventType === 'nap' || eventType === 'sleep') && (
                <View style={{ marginTop: spacing.md }}>
                  <Text
                    style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                  >
                    {i18n.t('log_sheet.end_time')}
                  </Text>
                  <input
                    type="datetime-local"
                    value={endTime}
                    min={startTime}
                    max={nowLocal()}
                    onChange={e => setEndTime(e.target.value)}
                    style={timePickerStyle}
                  />
                </View>
              )}

            {eventType === 'bottle' && (
              <View style={{ marginTop: spacing.md }}>
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
                <View style={{ marginTop: spacing.sm }}>
                  <Text
                    style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                  >
                    {i18n.t('log_sheet.custom_amount_oz')}
                  </Text>
                  <input
                    type="number"
                    min="0"
                    max={MAX_BOTTLE_OZ}
                    step="0.5"
                    value={ozInput}
                    onChange={e => {
                      const n = parseFloat(e.target.value);
                      if (!isNaN(n) && n > MAX_BOTTLE_OZ) {
                        setOzInput(String(MAX_BOTTLE_OZ));
                        setSelectedOz(MAX_BOTTLE_OZ);
                      } else {
                        setOzInput(e.target.value);
                        if (!isNaN(n) && n > 0) {
                          setSelectedOz(n);
                        }
                      }
                    }}
                    style={{ ...timePickerStyle }}
                  />
                </View>
                <Text
                  style={[
                    styles.contentLabel,
                    { color: theme.textDim, fontFamily: fonts.mono, marginTop: spacing.md },
                  ]}
                >
                  {i18n.t('log_sheet.bottle_source')}
                </Text>
                <View style={styles.pillRow}>
                  {BOTTLE_SOURCE_OPTIONS.map(source => {
                    const active = selectedBottleSource === source;
                    return (
                      <Pressable
                        key={source}
                        onPress={() => setSelectedBottleSource(source)}
                        accessibilityLabel={i18n.t(`log_sheet.bottle_${source}`)}
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
                          {i18n.t(`log_sheet.bottle_${source}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {eventType === 'nursing' && (
              <View style={{ marginTop: spacing.md }}>
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
                    { color: theme.textDim, fontFamily: fonts.mono, marginTop: spacing.md },
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

            {eventType === 'pump' && (
              <View style={{ marginTop: spacing.md }}>
                <Text
                  style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                >
                  {i18n.t('log_sheet.pump_side')}
                </Text>
                <View style={styles.pillRow}>
                  {PUMP_SIDE_OPTIONS.map(side => {
                    const active = selectedPumpSide === side;
                    return (
                      <Pressable
                        key={side}
                        onPress={() => setSelectedPumpSide(side)}
                        accessibilityLabel={i18n.t(`log_sheet.pump_${side}`)}
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
                          {i18n.t(`log_sheet.pump_${side}`)}
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
                <View style={{ marginTop: spacing.sm }}>
                  <Text
                    style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                  >
                    {i18n.t('log_sheet.custom_amount_oz')}
                  </Text>
                  <input
                    type="number"
                    min="0"
                    max={MAX_PUMP_OZ}
                    step="0.5"
                    value={ozInput}
                    onChange={e => {
                      const n = parseFloat(e.target.value);
                      if (!isNaN(n) && n > MAX_PUMP_OZ) {
                        setOzInput(String(MAX_PUMP_OZ));
                        setSelectedOz(MAX_PUMP_OZ);
                      } else {
                        setOzInput(e.target.value);
                        if (!isNaN(n) && n > 0) {
                          setSelectedOz(n);
                        }
                      }
                    }}
                    style={{ ...timePickerStyle }}
                  />
                </View>
                <Text
                  style={[
                    styles.contentLabel,
                    { color: theme.textDim, fontFamily: fonts.mono, marginTop: spacing.md },
                  ]}
                >
                  {i18n.t('log_sheet.duration_min')}
                </Text>
                <View style={styles.pillRow}>
                  {PUMP_MINUTES.map(m => {
                    const active = selectedPumpMinutes === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setSelectedPumpMinutes(m)}
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
                <Text
                  style={[
                    styles.contentLabel,
                    { color: theme.textDim, fontFamily: fonts.mono, marginTop: spacing.md },
                  ]}
                >
                  {i18n.t('log_sheet.pump_stash_bottles')}
                </Text>
                <View style={styles.pillRow}>
                  <Pressable
                    onPress={() => setSelectedStashCount(0)}
                    accessibilityLabel={i18n.t('log_sheet.pump_stash_none')}
                    style={[
                      styles.pill,
                      { borderColor: theme.border },
                      selectedStashCount === 0 && {
                        backgroundColor: theme.accent,
                        borderColor: theme.accent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: selectedStashCount === 0 ? theme.bg : theme.text,
                          fontFamily: fonts.mono,
                        },
                      ]}
                    >
                      {i18n.t('log_sheet.pump_stash_none')}
                    </Text>
                  </Pressable>
                  {STASH_BOTTLE_COUNTS.map(count => {
                    const active = selectedStashCount === count;
                    return (
                      <Pressable
                        key={count}
                        onPress={() => setSelectedStashCount(count)}
                        accessibilityLabel={`${count} ${i18n.t('log_sheet.pump_stash_bottles')}`}
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
                          {count}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {selectedStashCount > 0 && (
                  <View style={{ marginTop: spacing.md }}>
                    <Text
                      style={[
                        styles.contentLabel,
                        { color: theme.textDim, fontFamily: fonts.mono },
                      ]}
                    >
                      {i18n.t('log_sheet.pump_stash_location')}
                    </Text>
                    <View style={styles.pillRow}>
                      {STASH_LOCATION_OPTIONS.map(location => {
                        const active = selectedStashLocation === location;
                        return (
                          <Pressable
                            key={location}
                            onPress={() => setSelectedStashLocation(location)}
                            accessibilityLabel={i18n.t(`log_sheet.stash_${location}`)}
                            style={[
                              styles.pill,
                              { borderColor: theme.border },
                              active && {
                                backgroundColor: theme.accent,
                                borderColor: theme.accent,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.pillText,
                                {
                                  color: active ? theme.bg : theme.text,
                                  fontFamily: fonts.mono,
                                },
                              ]}
                            >
                              {i18n.t(`log_sheet.stash_${location}`)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text
                      style={[
                        styles.contentLabel,
                        { color: theme.textDim, fontFamily: fonts.mono },
                      ]}
                    >
                      {i18n.t('log_sheet.pump_stash_oz_per_bottle')}
                    </Text>
                    <View style={styles.pillRow}>
                      {BOTTLE_OZ.map(oz => {
                        const active = selectedStashOz === oz;
                        return (
                          <Pressable
                            key={oz}
                            onPress={() => setSelectedStashOz(oz)}
                            accessibilityLabel={`${oz} oz`}
                            style={[
                              styles.pill,
                              { borderColor: theme.border },
                              active && {
                                backgroundColor: theme.accent,
                                borderColor: theme.accent,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.pillText,
                                {
                                  color: active ? theme.bg : theme.text,
                                  fontFamily: fonts.mono,
                                },
                              ]}
                            >
                              {oz}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            )}

            {(eventType === 'food' || eventType === 'milestone' || eventType === 'medicine') && (
              <View style={{ marginTop: spacing.md }}>
                {eventType === 'milestone' && suggestedMilestones.length > 0 && (
                  <View style={{ marginBottom: spacing.md }}>
                    <Text
                      style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                    >
                      {i18n.t('log_sheet.milestone_suggestions')}
                    </Text>
                    <View style={styles.pillRow}>
                      {suggestedMilestones.map(item => {
                        const active = selectedMilestoneKey === item.key;
                        return (
                          <Pressable
                            key={item.key}
                            onPress={() =>
                              setSelectedMilestoneKey(prev => (prev === item.key ? null : item.key))
                            }
                            accessibilityLabel={milestoneLabel(item.key)}
                            style={[
                              styles.pill,
                              { borderColor: theme.border },
                              active && {
                                backgroundColor: theme.accent,
                                borderColor: theme.accent,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.pillText,
                                {
                                  color: active ? theme.bg : theme.text,
                                  fontFamily: fonts.mono,
                                },
                              ]}
                            >
                              {milestoneLabel(item.key)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
                <Text
                  style={[styles.contentLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                >
                  {eventType === 'food'
                    ? i18n.t('log_sheet.what_did_they_eat')
                    : eventType === 'milestone'
                      ? selectedMilestoneKey
                        ? i18n.t('log_sheet.milestone_custom_note')
                        : i18n.t('log_sheet.describe_milestone')
                      : i18n.t('log_sheet.medicine_notes')}
                </Text>
                <input
                  type="text"
                  value={notesText}
                  onChange={e => setNotesText(e.target.value)}
                  placeholder={
                    eventType === 'food'
                      ? i18n.t('log_sheet.food_placeholder')
                      : eventType === 'milestone'
                        ? selectedMilestoneKey
                          ? i18n.t('log_sheet.milestone_note_placeholder')
                          : i18n.t('log_sheet.milestone_placeholder')
                        : i18n.t('log_sheet.medicine_placeholder')
                  }
                  style={{
                    ...timePickerStyle,
                    marginTop: 0,
                  }}
                />
              </View>
            )}

            {eventType === 'diaper' && (
              <View style={{ marginTop: spacing.md }}>
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
              </View>
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
        </View>
      </div>
    </div>
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
    'pump',
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
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
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
  },
  loggedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
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
});
