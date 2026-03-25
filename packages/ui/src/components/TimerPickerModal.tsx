/** Bottom-sheet modal for setting a custom countdown timer (5 / 10 / 15 / 20 / 30 min or custom). */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useThemeContext } from '@tt/core';
import { fonts, spacing, radius } from '../theme/tokens';

const PRESETS = [5, 10, 15, 20, 30] as const;

const DISMISS_THRESHOLD_Y = 80;
const DISMISS_THRESHOLD_V = 0.5;

interface Props {
  visible: boolean;
  babyName: string;
  onSetAlarm: (durationMs: number) => void;
  onClose: () => void;
}

export function TimerPickerModal({ visible, babyName, onSetAlarm, onClose }: Props) {
  const theme = useThemeContext();
  const [customText, setCustomText] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [pressedLabel, setPressedLabel] = useState('');
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(400)).current;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          translateY.setValue(gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > DISMISS_THRESHOLD_Y || gs.vy > DISMISS_THRESHOLD_V) {
          translateY.setValue(400);
          onCloseRef.current();
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

  useEffect(() => {
    if (visible) {
      setCustomText('');
      setCustomOpen(false);
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

  function confirm(minutes: number) {
    if (minutes < 1) {
      return;
    }
    onSetAlarm(minutes * 60_000);
    onClose();
  }

  function confirmCustom() {
    const mins = parseInt(customText, 10);
    if (!isNaN(mins) && mins >= 1) {
      confirm(mins);
    }
  }

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
        <Pressable style={styles.backdropPress} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[styles.sheetWrap, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <View
          style={[styles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <Text style={[styles.title, { color: theme.textMuted, fontFamily: fonts.mono }]}>
            {`Timer for ${babyName}`}
          </Text>

          {/* Preset rows */}
          {PRESETS.map((m, i) => (
            <Pressable
              key={m}
              onPress={() => confirm(m)}
              onPressIn={() => setPressedLabel(String(m))}
              onPressOut={() => setPressedLabel('')}
              accessibilityLabel={`${m} minute timer`}
              accessibilityRole="button"
              style={[
                styles.option,
                i > 0 && [styles.optionBorder, { borderTopColor: theme.border }],
              ]}
            >
              {pressedLabel === String(m) && (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    styles.stateLayer,
                    { backgroundColor: theme.text },
                  ]}
                  pointerEvents="none"
                />
              )}
              <Text style={[styles.optionLabel, { color: theme.text, fontFamily: fonts.mono }]}>
                {`${m} min`}
              </Text>
            </Pressable>
          ))}

          {/* Custom option */}
          <Pressable
            onPress={() => setCustomOpen(o => !o)}
            onPressIn={() => setPressedLabel('custom')}
            onPressOut={() => setPressedLabel('')}
            accessibilityLabel="Custom timer duration"
            accessibilityRole="button"
            style={[styles.option, styles.optionBorder, { borderTopColor: theme.border }]}
          >
            {pressedLabel === 'custom' && (
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  styles.stateLayer,
                  { backgroundColor: theme.text },
                ]}
                pointerEvents="none"
              />
            )}
            <Text style={[styles.optionLabel, { color: theme.text, fontFamily: fonts.mono }]}>
              Custom…
            </Text>
          </Pressable>

          {customOpen && (
            <View style={[styles.customRow, { borderTopColor: theme.border }]}>
              <TextInput
                value={customText}
                onChangeText={setCustomText}
                keyboardType="number-pad"
                placeholder="minutes"
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.customInput,
                  { color: theme.text, borderColor: theme.border, fontFamily: fonts.mono },
                ]}
                returnKeyType="done"
                onSubmitEditing={confirmCustom}
                autoFocus
              />
              <Pressable
                onPress={confirmCustom}
                onPressIn={() => setPressedLabel('set')}
                onPressOut={() => setPressedLabel('')}
                accessibilityLabel="Set custom timer"
                style={[styles.customBtn, { backgroundColor: theme.accent }]}
              >
                {pressedLabel === 'set' && (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      styles.stateLayerInverse,
                      { backgroundColor: theme.bg },
                    ]}
                    pointerEvents="none"
                  />
                )}
                <Text style={[styles.customBtnText, { color: theme.bg, fontFamily: fonts.mono }]}>
                  Set
                </Text>
              </Pressable>
            </View>
          )}
        </View>
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
  sheetWrap: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 48,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    marginTop: 18,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    minHeight: 56,
    overflow: 'hidden',
  },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  stateLayer: { opacity: 0.08 },
  stateLayerInverse: { opacity: 0.12 },
  optionLabel: { fontSize: 17 },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  customInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 17,
  },
  customBtn: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  customBtnText: { fontSize: 15 },
});
