/** Native bottom sheet for viewing and editing a baby's profile (name, DOB, sex, weight, height). */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Baby, BabyColor, BabySex } from '@tt/core';
import { i18n, useThemeContext } from '@tt/core';
import { fonts, radius, spacing } from '../theme/tokens';
import { PersonIcon } from './icons/BabyIcons';

/** Hex values for each BabyColor — used for the avatar circle. */
const BABY_COLOR_HEX: Record<BabyColor, string> = {
  amber: '#f59e0b',
  emerald: '#10b981',
  slate: '#64748b',
  rose: '#fb7185',
  sky: '#38bdf8',
  violet: '#8b5cf6',
};

export interface BabyProfileSaveData {
  name: string;
  birthDate: string | undefined;
  sex: BabySex;
  weightKg: number | null;
  heightCm: number | null;
}

interface BabyProfileSheetProps {
  visible: boolean;
  baby: Baby | null;
  onSave: (id: string, data: BabyProfileSaveData) => Promise<void>;
  onClose: () => void;
  /**
   * Native-only injection: open the platform date picker.
   * Called with the current DOB as a Date (or today if not set) and a
   * callback that receives the confirmed date.
   * When omitted the DOB field renders as a plain TextInput.
   */
  onOpenDatePicker?: (current: Date, onConfirm: (d: Date) => void) => void;
}

/** Format a YYYY-MM-DD string or ISO timestamp for display. */
function formatDOB(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return raw;
  }
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Convert a Date to YYYY-MM-DD string. */
function toYMD(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a numeric string; return null when blank or invalid. */
function parseNumber(s: string): number | null {
  const v = parseFloat(s.replace(',', '.'));
  return isNaN(v) || v <= 0 ? null : v;
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
  onOpenDatePicker,
}: BabyProfileSheetProps) {
  const theme = useThemeContext();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<BabySex>('male');
  const [weightStr, setWeightStr] = useState('');
  const [heightStr, setHeightStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [dobError, setDobError] = useState('');

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(400)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Reset form fields when baby changes or sheet opens
  useEffect(() => {
    if (visible && baby) {
      setName(baby.name);
      // Normalize to YYYY-MM-DD — API may return a full ISO string
      setBirthDate(baby.birthDate ? baby.birthDate.slice(0, 10) : '');
      setSex(baby.sex ?? 'male');
      setWeightStr(baby.weightKg != null ? String(baby.weightKg) : '');
      setHeightStr(baby.heightCm != null ? String(baby.heightCm) : '');
      setNameError('');
      setDobError('');
      setSaving(false);
    }
  }, [visible, baby]);

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
    if (birthDate && birthDate > new Date().toISOString().split('T')[0]) {
      setDobError(i18n.t('baby_profile.dob_future'));
      return;
    }
    setDobError('');
    setSaving(true);
    try {
      await onSave(baby.id, {
        name: trimmed,
        birthDate: birthDate || undefined,
        sex,
        weightKg: parseNumber(weightStr),
        heightCm: parseNumber(heightStr),
      });
      dismiss();
    } catch {
      setSaving(false);
    }
  }

  function handleDOBPress() {
    if (!onOpenDatePicker || saving) {
      return;
    }
    const current = birthDate ? new Date(birthDate) : new Date();
    onOpenDatePicker(current, d => setBirthDate(toYMD(d)));
  }

  if (!baby) {
    return null;
  }

  const accentColor = BABY_COLOR_HEX[baby.color] ?? theme.textDim;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.backdropPress} onPress={dismiss} />
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.kvContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]}>
          <View
            style={[styles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
          >
            {/* Drag handle */}
            <View style={[styles.handle, { backgroundColor: theme.border }]} />

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
              {onOpenDatePicker ? (
                <Pressable
                  onPress={handleDOBPress}
                  disabled={saving}
                  accessibilityLabel={i18n.t('baby_profile.dob_label')}
                  style={({ pressed }) => [
                    styles.input,
                    styles.dobPressable,
                    {
                      backgroundColor: theme.bg,
                      borderColor: theme.border,
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
              ) : (
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
                  value={birthDate}
                  onChangeText={setBirthDate}
                  placeholder={i18n.t('baby_profile.dob_placeholder')}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                  returnKeyType="done"
                  editable={!saving}
                />
              )}
              {!!dobError && (
                <Text style={[styles.errorText, { color: '#ef4444', fontFamily: fonts.mono }]}>
                  {dobError}
                </Text>
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
                    {i18n.t('baby_profile.weight_label').toUpperCase()}
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
                    placeholder={i18n.t('baby_profile.weight_placeholder')}
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
                    {i18n.t('baby_profile.height_label').toUpperCase()}
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
                    placeholder={i18n.t('baby_profile.height_placeholder')}
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
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  backdropPress: { flex: 1 },
  kvContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 48,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    marginTop: 18,
    marginBottom: spacing.md,
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
});
