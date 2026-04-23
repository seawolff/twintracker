/** Web modal for viewing and editing a baby's profile (name, DOB, sex, weight, height). */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baby, BabyColor, BabySex } from '@tt/core';
import {
  i18n,
  useThemeContext,
  kgToLbs,
  lbsToKg,
  cmToIn,
  inToCm,
  todayLocalDateInputValue,
  isFutureLocalDateInputValue,
} from '@tt/core';
import { fonts, radius, spacing } from '../theme/tokens';
import { PersonIcon } from './icons/BabyIcons';

export interface BabyProfileSaveData {
  name: string;
  birthDate: string | undefined;
  sex: BabySex;
  weightKg: number | null;
  heightCm: number | null;
}

/** Hex values for each BabyColor — used for the avatar circle accent. */
const BABY_COLOR_HEX: Record<BabyColor, string> = {
  amber: '#f59e0b',
  emerald: '#10b981',
  slate: '#64748b',
  rose: '#fb7185',
  sky: '#38bdf8',
  violet: '#8b5cf6',
};

interface BabyProfileSheetProps {
  visible: boolean;
  baby: Baby | null;
  onSave: (id: string, data: BabyProfileSaveData) => Promise<void>;
  onClose: () => void;
  /** Controls weight/height display and input units. Storage is always metric (kg/cm). */
  units?: 'metric' | 'imperial';
}

// Spring-in animation class injected once
const STYLE_ID = 'tt-baby-profile-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    @keyframes tt-sheet-slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .tt-profile-sheet {
      animation: tt-sheet-slide-up 0.22s cubic-bezier(0.32, 0.72, 0, 1) both;
    }
  `;
  document.head.appendChild(el);
}

const SEX_OPTIONS: { value: BabySex; labelKey: string }[] = [
  { value: 'male', labelKey: 'baby_profile.sex_male' },
  { value: 'female', labelKey: 'baby_profile.sex_female' },
];

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

export function BabyProfileSheet({
  visible,
  baby,
  onSave,
  onClose,
  units = 'metric',
}: BabyProfileSheetProps) {
  const isImperial = units === 'imperial';
  const theme = useThemeContext();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<BabySex>('male');
  const [weightStr, setWeightStr] = useState('');
  const [heightStr, setHeightStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [dobError, setDobError] = useState('');
  const [isIn, setIsIn] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Reset and focus on open
  useEffect(() => {
    if (visible && baby) {
      setName(baby.name);
      // Normalize to YYYY-MM-DD — API may return a full ISO string
      setBirthDate(baby.birthDate ? baby.birthDate.slice(0, 10) : '');
      setSex(baby.sex ?? 'male');
      setWeightStr(baby.weightKg != null ? formatEditableWeight(baby.weightKg, isImperial) : '');
      setHeightStr(baby.heightCm != null ? formatEditableHeight(baby.heightCm, isImperial) : '');
      setNameError('');
      setDobError('');
      setSaving(false);
      // Double rAF to let animation start before focusing
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setIsIn(true);
          nameInputRef.current?.select();
        }),
      );
    } else {
      setIsIn(false);
    }
  }, [visible, baby, isImperial]);

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
    const dob = birthDate.trim();
    if (isFutureLocalDateInputValue(dob)) {
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
        birthDate: birthDate.trim() || undefined,
        sex,
        weightKg: parsedWeight != null && isImperial ? lbsToKg(parsedWeight) : parsedWeight,
        heightCm: parsedHeight != null && isImperial ? inToCm(parsedHeight) : parsedHeight,
      });
      onClose();
    } catch {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'Enter') {
      handleSave();
    }
  }

  // Suppress unused variable warning — isIn is used to trigger focus side-effect
  void isIn;

  if (!visible || !baby) {
    return null;
  }

  const accentColor = BABY_COLOR_HEX[baby.color] ?? '#64748b';

  const inputStyle = {
    display: 'block' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: `${spacing.sm}px ${spacing.md}px`,
    height: 48,
    fontSize: 16,
    fontFamily: fonts.mono,
    color: theme.text,
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: radius.md,
    outline: 'none',
  };

  return (
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — web-only fixed overlay
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.32)',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={handleKeyDown}
    >
      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore — className on div */}
      <div
        className="tt-profile-sheet"
        style={{
          width: '100%',
          maxWidth: 480,
          margin: '0 auto',
          backgroundColor: theme.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          borderTop: `1px solid ${theme.border}`,
          paddingBottom: 48,
          paddingLeft: spacing.lg,
          paddingRight: spacing.lg,
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle visual */}
        <div
          style={{
            width: 32,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.border,
            margin: `18px auto ${spacing.md}px`,
          }}
        />

        {/* Avatar circle */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: accentColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: `0 auto ${spacing.lg}px`,
          }}
        >
          <PersonIcon size={36} color="#ffffff" />
        </div>

        {/* Name field */}
        <label
          style={{
            display: 'block',
            fontSize: 11,
            letterSpacing: 1,
            color: theme.textMuted,
            fontFamily: fonts.mono,
            marginBottom: spacing.xs,
            marginTop: spacing.md,
          }}
        >
          {i18n.t('baby_profile.name_label').toUpperCase()}
        </label>
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore — ref on input element */}
        <input
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={e => {
            setName(e.target.value);
            if (nameError) {
              setNameError('');
            }
          }}
          placeholder={i18n.t('baby_profile.name_placeholder')}
          disabled={saving}
          style={{
            ...inputStyle,
            border: `1px solid ${nameError ? '#ef4444' : theme.border}`,
          }}
        />
        {nameError && (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: '#ef4444',
              fontFamily: fonts.mono,
            }}
          >
            {nameError}
          </p>
        )}

        {/* Birth date field */}
        <label
          style={{
            display: 'block',
            fontSize: 11,
            letterSpacing: 1,
            color: theme.textMuted,
            fontFamily: fonts.mono,
            marginBottom: spacing.xs,
            marginTop: spacing.md,
          }}
        >
          {i18n.t('baby_profile.dob_label').toUpperCase()}
        </label>
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore — HTML date input */}
        <input
          type="date"
          value={birthDate}
          max={todayLocalDateInputValue()}
          onChange={e => {
            setBirthDate(e.target.value);
            if (dobError) {
              setDobError('');
            }
          }}
          disabled={saving}
          style={{
            ...inputStyle,
            border: `1px solid ${dobError ? '#ef4444' : theme.border}`,
            colorScheme: theme.mode === 'night' ? 'dark' : 'light',
          }}
        />
        {dobError && (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: '#ef4444',
              fontFamily: fonts.mono,
            }}
          >
            {dobError}
          </p>
        )}

        {/* Sex selector */}
        <label
          style={{
            display: 'block',
            fontSize: 11,
            letterSpacing: 1,
            color: theme.textMuted,
            fontFamily: fonts.mono,
            marginBottom: spacing.xs,
            marginTop: spacing.md,
          }}
        >
          {i18n.t('baby_profile.sex_label').toUpperCase()}
        </label>
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
            <label
              style={{
                display: 'block',
                fontSize: 11,
                letterSpacing: 1,
                color: theme.textMuted,
                fontFamily: fonts.mono,
                marginBottom: spacing.xs,
                marginTop: spacing.md,
              }}
            >
              {i18n
                .t(isImperial ? 'baby_profile.weight_label_imperial' : 'baby_profile.weight_label')
                .toUpperCase()}
            </label>
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-ignore — number input */}
            <input
              type="number"
              inputMode="decimal"
              value={weightStr}
              onChange={e => setWeightStr(e.target.value)}
              placeholder={i18n.t(
                isImperial
                  ? 'baby_profile.weight_placeholder_imperial'
                  : 'baby_profile.weight_placeholder',
              )}
              disabled={saving}
              min="0"
              step="0.1"
              style={inputStyle}
            />
          </View>
          <View style={styles.measureField}>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                letterSpacing: 1,
                color: theme.textMuted,
                fontFamily: fonts.mono,
                marginBottom: spacing.xs,
                marginTop: spacing.md,
              }}
            >
              {i18n
                .t(isImperial ? 'baby_profile.height_label_imperial' : 'baby_profile.height_label')
                .toUpperCase()}
            </label>
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-ignore — number input */}
            <input
              type="number"
              inputMode="decimal"
              value={heightStr}
              onChange={e => setHeightStr(e.target.value)}
              placeholder={i18n.t(
                isImperial
                  ? 'baby_profile.height_placeholder_imperial'
                  : 'baby_profile.height_placeholder',
              )}
              disabled={saving}
              min="0"
              step="0.1"
              style={inputStyle}
            />
          </View>
        </View>

        {/* Save button */}
        <View style={styles.saveBtnWrap}>
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
        </View>
      </div>
    </div>
  );
}

const styles = StyleSheet.create({
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
  saveBtnWrap: {
    marginTop: spacing.lg,
  },
  saveBtn: {
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
