/** Native bottom sheet for viewing and editing a baby's profile (name, DOB, sex, weight, height). */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Baby, BabySex } from '@tt/core';
import {
  i18n,
  useThemeContext,
  kgToLbs,
  lbsToKg,
  cmToIn,
  inToCm,
  formatLocalDateInputValue,
  isFutureLocalDateInputValue,
} from '@tt/core';
import { fonts, radius, spacing } from '../theme/tokens';
import { babyColorHex } from '../babyColors';
import { PersonIcon } from './icons/BabyIcons';

// Lazy-required so packages/ui doesn't declare a formal dep on a native-only package.
// Metro resolves it from apps/native/node_modules at bundle time.
// The .web.tsx sibling never loads this file, so the web build is unaffected.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const DateTimePicker: any = require('@react-native-community/datetimepicker').default;

const DISMISS_THRESHOLD_Y = 80;
const DISMISS_THRESHOLD_V = 0.5;

const TODAY = new Date();

export interface BabyProfileSaveData {
  name: string;
  birthDate: string | undefined;
  adjustedBirthDate: string | null;
  sex: BabySex;
  weightKg: number | null;
  heightCm: number | null;
}

interface BabyProfileSheetProps {
  visible: boolean;
  baby: Baby | null;
  onSave: (id: string, data: BabyProfileSaveData) => Promise<void>;
  onClose: () => void;
  /** Controls weight/height display and input units. Storage is always metric (kg/cm). */
  units?: 'metric' | 'imperial';
}

/** Format a YYYY-MM-DD string or ISO timestamp for display. */
function formatDOB(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return raw;
  }
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Parse a numeric string; return null when blank or invalid. */
function parseNumber(s: string): number | null {
  const v = parseFloat(s.replace(',', '.'));
  return isNaN(v) || v <= 0 ? null : v;
}

function formatEditableWeight(weightKg: number, isImperial: boolean): string {
  return isImperial ? kgToLbs(weightKg).toFixed(1) : weightKg.toFixed(1);
}

function formatEditableHeight(heightCm: number, isImperial: boolean): string {
  return isImperial ? cmToIn(heightCm).toFixed(1) : String(Math.round(heightCm));
}

const SEX_OPTIONS: { value: BabySex; labelKey: string }[] = [
  { value: 'male', labelKey: 'baby_profile.sex_male' },
  { value: 'female', labelKey: 'baby_profile.sex_female' },
];

export function BabyProfileSheet({
  visible,
  baby,
  onSave,
  onClose,
  units = 'metric',
}: BabyProfileSheetProps) {
  const theme = useThemeContext();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [adjustedBirthDate, setAdjustedBirthDate] = useState('');
  const [sex, setSex] = useState<BabySex>('male');
  const [weightStr, setWeightStr] = useState('');
  const [heightStr, setHeightStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [dobError, setDobError] = useState('');
  // Inline DOB picker state
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [dobPickerDate, setDobPickerDate] = useState<Date>(TODAY);

  const isImperial = units === 'imperial';

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(400)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderGrant: () => {
        Keyboard.dismiss();
      },
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          translateY.setValue(gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > DISMISS_THRESHOLD_Y || gs.vy > DISMISS_THRESHOLD_V) {
          dismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 200,
            mass: 0.85,
          }).start();
        }
      },
    }),
  ).current;

  // Reset form fields when baby changes or sheet opens
  useEffect(() => {
    if (visible && baby) {
      setName(baby.name);
      // Normalize to YYYY-MM-DD — API may return a full ISO string
      setBirthDate(baby.birthDate ? baby.birthDate.slice(0, 10) : '');
      setAdjustedBirthDate(baby.adjustedBirthDate ? baby.adjustedBirthDate.slice(0, 10) : '');
      setSex(baby.sex ?? 'male');
      setWeightStr(baby.weightKg != null ? formatEditableWeight(baby.weightKg, isImperial) : '');
      setHeightStr(baby.heightCm != null ? formatEditableHeight(baby.heightCm, isImperial) : '');
      setNameError('');
      setDobError('');
      setSaving(false);
    }
  }, [visible, baby, isImperial]);

  // Spring-in animation
  useEffect(() => {
    if (visible) {
      translateY.setValue(400);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
          mass: 0.85,
        }),
      ]).start();
    }
  }, [visible, backdropOpacity, translateY]);

  function dismiss() {
    Keyboard.dismiss();
    translateY.setValue(400);
    onCloseRef.current();
  }

  async function handleSave() {
    if (!baby) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(i18n.t('baby_profile.name_required'));
      return;
    }
    setNameError('');
    if (isFutureLocalDateInputValue(birthDate)) {
      setDobError(i18n.t('baby_profile.dob_future'));
      return;
    }
    setDobError('');
    setSaving(true);
    try {
      const parsedWeight = parseNumber(weightStr);
      const parsedHeight = parseNumber(heightStr);
      await onSave(baby.id, {
        name: trimmed,
        birthDate: birthDate || undefined,
        adjustedBirthDate: adjustedBirthDate || null,
        sex,
        weightKg: parsedWeight != null && isImperial ? lbsToKg(parsedWeight) : parsedWeight,
        heightCm: parsedHeight != null && isImperial ? inToCm(parsedHeight) : parsedHeight,
      });
      dismiss();
    } catch {
      setSaving(false);
    }
  }

  function handleDOBPress() {
    if (saving) {
      return;
    }
    const current = birthDate ? new Date(birthDate) : TODAY;
    setDobPickerDate(current);
    setShowDobPicker(true);
  }

  function handleDobPickerConfirm() {
    setBirthDate(formatLocalDateInputValue(dobPickerDate));
    setShowDobPicker(false);
    if (dobError) {
      setDobError('');
    }
  }

  function handleDobPickerCancel() {
    setShowDobPicker(false);
  }

  if (!baby) {
    return null;
  }

  const accentColor = babyColorHex(baby.color) ?? theme.textDim;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.backdropPress} onPress={dismiss} />
      </Animated.View>

      {/* Sheet — same pattern as LogSheet: position+bottom on the Animated.View directly */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            paddingBottom: insets.bottom || 34,
          },
          { transform: [{ translateY }] },
        ]}
      >
        <View style={styles.dragHeader} {...panResponder.panHandlers}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Avatar circle */}
            <View style={[styles.avatarCircle, { backgroundColor: accentColor }]}>
              <PersonIcon size={36} color="#ffffff" />
            </View>

            {/* Name field */}
            <Text style={[styles.fieldLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}>
              {i18n.t('baby_profile.name_label').toUpperCase()}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.bg,
                  borderColor: nameError ? '#ef4444' : theme.border,
                  color: theme.text,
                  fontFamily: fonts.mono,
                },
              ]}
              value={name}
              onChangeText={v => {
                setName(v);
                if (nameError) {
                  setNameError('');
                }
              }}
              placeholder={i18n.t('baby_profile.name_placeholder')}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="words"
              returnKeyType="done"
              editable={!saving}
            />
            {!!nameError && (
              <Text style={[styles.errorText, { color: '#ef4444', fontFamily: fonts.mono }]}>
                {nameError}
              </Text>
            )}

            {/* Birth date field */}
            <Text style={[styles.fieldLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}>
              {i18n.t('baby_profile.dob_label').toUpperCase()}
            </Text>
            <Pressable
              onPress={handleDOBPress}
              disabled={saving}
              accessibilityLabel={i18n.t('baby_profile.dob_label')}
              style={({ pressed }) => [
                styles.input,
                styles.dobPressable,
                {
                  backgroundColor: theme.bg,
                  borderColor: dobError ? '#ef4444' : theme.border,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.dobText,
                  { color: birthDate ? theme.text : theme.textMuted, fontFamily: fonts.mono },
                ]}
              >
                {birthDate ? formatDOB(birthDate) : i18n.t('baby_profile.dob_placeholder')}
              </Text>
              <Text style={[styles.dobChevron, { color: theme.textMuted }]}>›</Text>
            </Pressable>
            {!!dobError && (
              <Text style={[styles.errorText, { color: '#ef4444', fontFamily: fonts.mono }]}>
                {dobError}
              </Text>
            )}

            {/* Inline DOB spinner — slides open within the sheet */}
            {showDobPicker && (
              <View style={[styles.dobPickerWrap, { borderColor: theme.border }]}>
                <DateTimePicker
                  value={dobPickerDate}
                  mode="date"
                  display="spinner"
                  maximumDate={TODAY}
                  onChange={(_: unknown, date?: Date) => {
                    if (date) {
                      setDobPickerDate(date);
                    }
                  }}
                  style={styles.dobPicker}
                  {...(Platform.OS === 'ios'
                    ? {
                        textColor: theme.text,
                        themeVariant: theme.mode === 'night' ? 'dark' : 'light',
                      }
                    : {})}
                />
                <View style={[styles.dobPickerActions, { borderTopColor: theme.border }]}>
                  <Pressable
                    onPress={handleDobPickerCancel}
                    style={styles.dobPickerBtn}
                    accessibilityLabel={i18n.t('common.cancel')}
                  >
                    <Text
                      style={[
                        styles.dobPickerCancelText,
                        { color: theme.textMuted, fontFamily: fonts.mono },
                      ]}
                    >
                      {i18n.t('common.cancel')}
                    </Text>
                  </Pressable>
                  <View style={[styles.dobPickerDivider, { backgroundColor: theme.border }]} />
                  <Pressable
                    onPress={handleDobPickerConfirm}
                    style={styles.dobPickerBtn}
                    accessibilityLabel={i18n.t('common.save')}
                  >
                    <Text
                      style={[
                        styles.dobPickerConfirmText,
                        { color: theme.text, fontFamily: fonts.mono },
                      ]}
                    >
                      {i18n.t('common.save')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Adjusted birth date — only shown when a birth date is set */}
            {!!birthDate && (
              <>
                <Text
                  style={[styles.fieldLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}
                >
                  {i18n.t('baby_profile.adjusted_dob_label').toUpperCase()}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.bg,
                      borderColor: theme.border,
                      color: theme.text,
                      fontFamily: fonts.mono,
                    },
                  ]}
                  value={adjustedBirthDate}
                  onChangeText={setAdjustedBirthDate}
                  placeholder={i18n.t('baby_profile.dob_placeholder')}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numbers-and-punctuation"
                  editable={!saving}
                  accessibilityLabel={i18n.t('baby_profile.adjusted_dob_label')}
                />
                <Text
                  style={[styles.fieldHint, { color: theme.textMuted, fontFamily: fonts.mono }]}
                >
                  {i18n.t('baby_profile.adjusted_dob_hint')}
                </Text>
              </>
            )}

            {/* Sex selector */}
            <Text style={[styles.fieldLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}>
              {i18n.t('baby_profile.sex_label').toUpperCase()}
            </Text>
            <View style={styles.sexRow}>
              {SEX_OPTIONS.map(opt => {
                const active = sex === opt.value;
                return (
                  <Pressable
                    key={String(opt.value)}
                    onPress={() => !saving && setSex(opt.value)}
                    accessibilityLabel={i18n.t(opt.labelKey)}
                    style={({ pressed }) => [
                      styles.sexBtn,
                      {
                        backgroundColor: active ? theme.text : theme.bg,
                        borderColor: theme.border,
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sexBtnText,
                        { color: active ? theme.bg : theme.textDim, fontFamily: fonts.mono },
                      ]}
                    >
                      {i18n.t(opt.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Weight + Height */}
            <View style={styles.measureRow}>
              <View style={styles.measureField}>
                <Text
                  style={[styles.fieldLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}
                >
                  {i18n
                    .t(
                      isImperial
                        ? 'baby_profile.weight_label_imperial'
                        : 'baby_profile.weight_label',
                    )
                    .toUpperCase()}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.bg,
                      borderColor: theme.border,
                      color: theme.text,
                      fontFamily: fonts.mono,
                    },
                  ]}
                  value={weightStr}
                  onChangeText={setWeightStr}
                  placeholder={i18n.t(
                    isImperial
                      ? 'baby_profile.weight_placeholder_imperial'
                      : 'baby_profile.weight_placeholder',
                  )}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  editable={!saving}
                />
              </View>
              <View style={styles.measureField}>
                <Text
                  style={[styles.fieldLabel, { color: theme.textMuted, fontFamily: fonts.mono }]}
                >
                  {i18n
                    .t(
                      isImperial
                        ? 'baby_profile.height_label_imperial'
                        : 'baby_profile.height_label',
                    )
                    .toUpperCase()}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.bg,
                      borderColor: theme.border,
                      color: theme.text,
                      fontFamily: fonts.mono,
                    },
                  ]}
                  value={heightStr}
                  onChangeText={setHeightStr}
                  placeholder={i18n.t(
                    isImperial
                      ? 'baby_profile.height_placeholder_imperial'
                      : 'baby_profile.height_placeholder',
                  )}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  editable={!saving}
                />
              </View>
            </View>

            {/* Save button */}
            <Pressable
              onPress={handleSave}
              disabled={saving}
              accessibilityLabel={i18n.t('baby_profile.edit_profile', { name: baby.name })}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: theme.text, opacity: pressed || saving ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.saveBtnText, { color: theme.bg, fontFamily: fonts.mono }]}>
                {saving ? i18n.t('baby_profile.saving') : i18n.t('common.save')}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  backdropPress: { flex: 1 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
  },
  dragHeader: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  dobPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dobText: {
    fontSize: 16,
    flex: 1,
  },
  dobChevron: {
    fontSize: 20,
    paddingLeft: 8,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  measureRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  measureField: {
    flex: 1,
  },
  sexRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sexBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sexBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  saveBtn: {
    marginTop: spacing.lg,
    borderRadius: radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  dobPickerWrap: {
    marginTop: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  dobPicker: {
    width: '100%',
    height: 216,
  },
  dobPickerActions: {
    flexDirection: 'row',
    height: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dobPickerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dobPickerDivider: {
    width: StyleSheet.hairlineWidth,
  },
  dobPickerCancelText: {
    fontSize: 16,
    fontWeight: '400',
  },
  dobPickerConfirmText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fieldHint: {
    fontSize: 11,
    marginTop: 4,
    marginBottom: spacing.xs,
  },
});
