/** Bottom-sheet modal for choosing a feed type (Bottle / Nursing / Solids). */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EventType } from '@tt/core';
import { useThemeContext } from '@tt/core';
import { fonts, spacing, radius } from '../theme/tokens';
import { BottleIcon, NursingIcon, FoodIcon } from './icons/BabyIcons';

type IconComponent = (props: { size: number; color: string }) => React.JSX.Element;

const ICON_SIZE = 24;
const DISMISS_THRESHOLD_Y = 80;
const DISMISS_THRESHOLD_V = 0.5;

const OPTIONS: { type: EventType; label: string; Icon: IconComponent }[] = [
  { type: 'bottle', label: 'Bottle', Icon: BottleIcon as IconComponent },
  { type: 'nursing', label: 'Nursing', Icon: NursingIcon as IconComponent },
  { type: 'food', label: 'Solids', Icon: FoodIcon as IconComponent },
];

interface Props {
  visible: boolean;
  babyName: string;
  suggestedOz?: number;
  onSelect: (type: EventType, suggestedOz?: number) => void;
  onClose: () => void;
}

export function FeedPickerModal({ visible, babyName, suggestedOz, onSelect, onClose }: Props) {
  const theme = useThemeContext();
  const [pressedIndex, setPressedIndex] = useState(-1);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(300)).current;

  // Keep onClose stable across renders so PanResponder (created once) always calls the latest ref.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useRef(
    PanResponder.create({
      // Only capture vertical-dominant downward drags
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
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop fades in opacity only */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.backdropPress} onPress={onClose} />
      </Animated.View>

      {/* Sheet springs up; swipe down to dismiss */}
      <Animated.View
        style={[styles.sheetWrap, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <View
          style={[styles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
        >
          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          {/* Title */}
          <Text style={[styles.title, { color: theme.textMuted, fontFamily: fonts.mono }]}>
            {`Feed ${babyName}`}
          </Text>

          {/* Options */}
          {OPTIONS.map((opt, i) => (
            <Pressable
              key={opt.type}
              onPress={() => {
                onClose();
                onSelect(opt.type, opt.type === 'bottle' ? suggestedOz : undefined);
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
  backdropPress: {
    flex: 1,
  },
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
  optionBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
  optionLabel: {
    fontSize: 17,
  },
});
