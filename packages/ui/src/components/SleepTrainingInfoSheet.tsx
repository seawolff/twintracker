import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { i18n, useThemeContext } from '@tt/core';
import { fonts, spacing, radius } from '../theme/tokens';

const DISMISS_THRESHOLD_Y = 80;
const DISMISS_THRESHOLD_V = 0.5;

interface Props {
  visible: boolean;
  babyName: string;
  scheduleStage: 1 | 2 | 3;
  ageWeeks: number;
  onClose: () => void;
}

function BulletRow({ children }: { children: ReactNode }) {
  const theme = useThemeContext();
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bullet, { color: theme.text, fontFamily: fonts.mono }]}>•</Text>
      <Text style={[styles.bulletText, { color: theme.text }]}>{children}</Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const theme = useThemeContext();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: fonts.mono }]}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function SleepTrainingInfoSheet({
  visible,
  babyName,
  scheduleStage,
  ageWeeks,
  onClose,
}: Props) {
  const theme = useThemeContext();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(300)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
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
    if (!visible) {
      return;
    }
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
  }, [visible, backdropOpacity, translateY]);

  const scheduleTitle = i18n.t(`settings.sleep_training_schedule_stage${scheduleStage}_title`);
  const scheduleCycle = i18n.t(`settings.sleep_training_schedule_stage${scheduleStage}_cycle`);
  const scheduleBullet1 = i18n.t(
    `settings.sleep_training_schedule_stage${scheduleStage}_bullet1`,
  );
  const scheduleBullet2 = i18n.t(
    `settings.sleep_training_schedule_stage${scheduleStage}_bullet2`,
  );
  const scheduleBullet3 = i18n.t(
    `settings.sleep_training_schedule_stage${scheduleStage}_bullet3`,
  );
  const scheduleBullet4 = i18n.t(
    `settings.sleep_training_schedule_stage${scheduleStage}_bullet4`,
  );
  const waitRangeKey =
    ageWeeks < 4
      ? 'newborn'
      : ageWeeks < 12
        ? '4_to_12'
        : ageWeeks < 24
          ? '3_to_6'
          : ageWeeks < 36
            ? '6_to_9'
            : '9_plus';
  const waitTitle = i18n.t(`settings.sleep_training_waits_current_${waitRangeKey}_title`);
  const waitWindow = i18n.t(`settings.sleep_training_waits_current_${waitRangeKey}_window`);
  const waitBullet1 = i18n.t('settings.sleep_training_waits_current_support_1');
  const waitBullet2 = i18n.t('settings.sleep_training_waits_current_support_2');
  const waitBullet3 = i18n.t('settings.sleep_training_waits_current_support_3');
  const waitBullet4 = i18n.t('settings.sleep_training_waits_current_support_4');

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
      >
        <View
          style={[styles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
        >
          <View style={styles.dragHeader} {...panResponder.panHandlers}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <Text style={[styles.eyebrow, { color: theme.textMuted, fontFamily: fonts.mono }]}>
              {babyName}
            </Text>
            <Text style={[styles.title, { color: theme.text, fontFamily: fonts.display }]}>
              {i18n.t('settings.sleep_training_info_title')}
            </Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Section title={i18n.t('settings.sleep_training_checklist_title')}>
              <BulletRow>{i18n.t('settings.sleep_training_checklist_blackout')}</BulletRow>
              <BulletRow>{i18n.t('settings.sleep_training_checklist_swaddle')}</BulletRow>
              <BulletRow>{i18n.t('settings.sleep_training_checklist_noise')}</BulletRow>
              <BulletRow>{i18n.t('settings.sleep_training_checklist_drowsy')}</BulletRow>
              <BulletRow>{i18n.t('settings.sleep_training_checklist_ghost')}</BulletRow>
            </Section>

            <Section title={scheduleTitle}>
              <Text style={[styles.scheduleHeadline, { color: theme.text, fontFamily: fonts.mono }]}>
                {scheduleCycle}
              </Text>
              <BulletRow>{scheduleBullet1}</BulletRow>
              <BulletRow>{scheduleBullet2}</BulletRow>
              <BulletRow>{scheduleBullet3}</BulletRow>
              <BulletRow>{scheduleBullet4}</BulletRow>
            </Section>

            <Section title={i18n.t('settings.sleep_training_waits_title')}>
              <Text style={[styles.scheduleHeadline, { color: theme.text, fontFamily: fonts.mono }]}>
                {waitTitle}
              </Text>
              <BulletRow>{waitWindow}</BulletRow>
              <BulletRow>{waitBullet1}</BulletRow>
              <BulletRow>{waitBullet2}</BulletRow>
              <BulletRow>{waitBullet3}</BulletRow>
              <BulletRow>{waitBullet4}</BulletRow>
            </Section>

            <Section title={i18n.t('settings.sleep_training_notes_title')}>
              <BulletRow>{i18n.t('settings.sleep_training_notes_wake')}</BulletRow>
              <BulletRow>{i18n.t('settings.sleep_training_notes_crying')}</BulletRow>
              <BulletRow>{i18n.t('settings.sleep_training_notes_regressions')}</BulletRow>
            </Section>
          </ScrollView>
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
    maxHeight: '92%',
  },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  dragHeader: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: spacing.xs,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
    textAlign: 'center',
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    maxHeight: '100%',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 48,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionBody: {
    gap: spacing.sm,
  },
  scheduleHeadline: {
    fontSize: 16,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bullet: {
    fontSize: 16,
    lineHeight: 24,
    width: 12,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
  },
});
