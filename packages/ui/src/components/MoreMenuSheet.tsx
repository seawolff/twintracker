/** Bottom-sheet for "more" actions: Medicine, Milestone, Set Timer. */
import { useEffect, useRef, useState, type JSX } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EventType } from '@tt/core';
import { useThemeContext } from '@tt/core';
import { fonts, spacing, radius } from '../theme/tokens';
import { MedicineIcon, MilestoneIcon, TimerIcon } from './icons/BabyIcons';

const DISMISS_THRESHOLD_Y = 80;
const DISMISS_THRESHOLD_V = 0.5;
const ICON_SIZE = 24;

interface Props {
  visible: boolean;
  babyName: string;
  showTimer: boolean;
  onLog: (type: EventType) => void;
  onOpenTimer: () => void;
  onClose: () => void;
}

type Option =
  | {
      type: EventType;
      label: string;
      Icon: (p: { size: number; color: string }) => JSX.Element | null;
    }
  | { type: null; label: string; Icon: (p: { size: number; color: string }) => JSX.Element | null };

const OPTIONS: Option[] = [
  { type: 'medicine', label: 'Medicine', Icon: MedicineIcon },
  { type: 'milestone', label: 'Milestone', Icon: MilestoneIcon },
];

export function MoreMenuSheet({
  visible,
  babyName,
  showTimer,
  onLog,
  onOpenTimer,
  onClose,
}: Props) {
  const theme = useThemeContext();
  const [pressedIndex, setPressedIndex] = useState(-1);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(300)).current;

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
          translateY.setValue(300);
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
      translateY.setValue(300);
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

  const allOptions: Option[] = [
    ...OPTIONS,
    ...(showTimer ? [{ type: null as null, label: 'Set timer', Icon: TimerIcon }] : []),
  ];

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
            {babyName}
          </Text>

          {allOptions.map((opt, i) => (
            <Pressable
              key={opt.label}
              onPress={() => {
                onClose();
                if (opt.type) {
                  onLog(opt.type);
                } else {
                  onOpenTimer();
                }
              }}
              onPressIn={() => setPressedIndex(i)}
              onPressOut={() => setPressedIndex(-1)}
              accessibilityLabel={`${opt.label} for ${babyName}`}
              accessibilityRole="button"
              style={[
                styles.option,
                i > 0 && [styles.optionBorder, { borderTopColor: theme.border }],
              ]}
            >
              {pressedIndex === i && (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    styles.stateLayer,
                    { backgroundColor: theme.text },
                  ]}
                  pointerEvents="none"
                />
              )}
              <View style={styles.leadingIcon}>
                <opt.Icon size={ICON_SIZE} color={theme.text} />
              </View>
              <Text style={[styles.optionLabel, { color: theme.text, fontFamily: fonts.mono }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
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
    paddingHorizontal: spacing.md,
    minHeight: 56,
    overflow: 'hidden',
  },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  leadingIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stateLayer: {
    opacity: 0.08,
  },
  optionLabel: { fontSize: 17 },
});
