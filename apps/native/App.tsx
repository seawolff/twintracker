/**
 * App.tsx — Native entry point (Expo / React Native)
 *
 * Component tree:
 *   App
 *   └── ThemeProvider          wraps everything; provides useThemeContext()
 *       └── AppContent         auth, prefs, event store, tab state
 *           ├── LoginScreen    sign-in / sign-up / join-with-code
 *           ├── HomeScreen     onboarding + baby cards (the 3am screen)
 *           ├── HistoryScreen  chronological event log with swipe-to-delete
 *           ├── AnalyticsScreen  weekly stats per baby
 *           ├── SettingsScreen   preferences + admin tools
 *           └── TabBar         bottom navigation
 */
import { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { Nunito_700Bold } from '@expo-google-fonts/nunito';
import * as Notifications from 'expo-notifications';
import {
  requestNotificationPermission,
  scheduleAlarmAt,
  setupNotificationChannel,
} from './notifications';

// Tell Expo how to display notifications while the app is foregrounded.
// Must be set before any notification is delivered.
// Alarm notifications are intercepted in-app (via addNotificationReceivedListener) so we
// suppress the banner for them — showing an Alert instead is less disruptive.
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const data = notification.request.content.data as { alarmId?: string };
    if (data?.alarmId) {
      // Handled in-app when foregrounded; keep in notification centre but skip banner/sound
      return {
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  configure,
  useAuth,
  useEventStore,
  usePreferences,
  useAlarms,
  setNightBoundaries,
  setSleepActive,
  api,
  generateMockEvents,
  computeAnalytics,
  ThemeProvider,
  useThemeContext,
  initI18n,
  useTranslation,
  NAP_CHECK_MINUTES,
  BEDTIME_HOURS,
  WAKE_HOURS,
  hourLabel,
  findUnsyncedBaby,
  getActiveEvent,
  findSyncedNapBaby,
  getDiaperReminderIntervalMs,
  getFeedReminderIntervalMs,
  formatReminderInterval,
  isNightFireTime,
} from '@tt/core';
import type {
  Baby,
  BabyAnalytics,
  EventType,
  LogEventPayload,
  SyncableEventType,
  TrackerEvent,
} from '@tt/core';
import * as Localization from 'expo-localization';

// Initialise i18n once using device locale.
initI18n(Localization.getLocales()[0]?.languageTag ?? 'en');
import {
  BabyCard,
  LogSheet,
  HistoryFeed,
  BottleIcon,
  MoonIcon,
  HotelIcon,
  DiaperIcon,
  FoodIcon,
  MilestoneIcon,
} from '@tt/ui';
import { asyncStorage } from './storage';

configure(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000');

type Tab = 'home' | 'history' | 'settings';

// ---------------------------------------------------------------------------
// LoginScreen
// Three modes: sign-in (default), sign-up (new account), join (invite code).
// Mode toggles are inline links below the submit button.
// ---------------------------------------------------------------------------
function LoginScreen({
  login,
  register,
  join,
}: {
  login: (email: string, password: string) => Promise<unknown>;
  register: (email: string, password: string, name?: string) => Promise<unknown>;
  join: (email: string, password: string, code: string, name?: string) => Promise<unknown>;
}) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signin' | 'signup' | 'join'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await login(email, password);
      } else if (mode === 'signup') {
        await register(email, password, name.trim() || undefined);
      } else {
        await join(email, password, inviteCode, name.trim() || undefined);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = [
    loginStyles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
  ];

  return (
    <KeyboardAvoidingView
      style={[loginStyles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style={theme.mode === 'night' ? 'light' : 'dark'} />
      <View style={loginStyles.inner}>
        <Text style={[loginStyles.title, { color: theme.text }]}>{t('auth.title')}</Text>
        <Text style={[loginStyles.tagline, { color: theme.textMuted }]}>{t('auth.tagline')}</Text>

        <TextInput
          style={inputStyle}
          placeholder={t('auth.email')}
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel={t('auth.email')}
        />
        <TextInput
          style={inputStyle}
          placeholder={t('auth.password')}
          placeholderTextColor={theme.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          accessibilityLabel={t('auth.password')}
        />
        {mode === 'join' && (
          <TextInput
            style={[...inputStyle, loginStyles.inviteInput]}
            placeholder={t('auth.invite_code').toUpperCase()}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="characters"
            maxLength={8}
            value={inviteCode}
            onChangeText={v => setInviteCode(v.toUpperCase())}
            accessibilityLabel={t('auth.invite_code')}
          />
        )}
        {(mode === 'signup' || mode === 'join') && (
          <TextInput
            style={inputStyle}
            placeholder={t('auth.your_name')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
            accessibilityLabel={t('auth.your_name')}
          />
        )}

        {error ? (
          <Text style={[loginStyles.error, { color: theme.urgencyOverdue }]}>{error}</Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            loginStyles.submitBtn,
            { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityLabel={
            mode === 'signin'
              ? t('auth.sign_in')
              : mode === 'signup'
                ? t('auth.sign_up')
                : t('auth.join')
          }
        >
          {submitting ? (
            <ActivityIndicator color={theme.bg} />
          ) : (
            <Text style={[loginStyles.submitText, { color: theme.bg }]}>
              {mode === 'signin'
                ? t('auth.sign_in')
                : mode === 'signup'
                  ? t('auth.sign_up')
                  : t('auth.join')}
            </Text>
          )}
        </Pressable>

        {mode === 'signin' ? (
          <>
            <Pressable
              onPress={() => setMode('signup')}
              style={loginStyles.linkBtn}
              accessibilityLabel={t('auth.no_account')}
            >
              <Text style={[loginStyles.linkText, { color: theme.textMuted }]}>
                {t('auth.no_account')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('join')}
              style={loginStyles.linkBtn}
              accessibilityLabel={t('auth.join_with_code')}
            >
              <Text style={[loginStyles.linkText, { color: theme.textMuted }]}>
                {t('auth.join_with_code')}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => setMode('signin')}
            style={loginStyles.linkBtn}
            accessibilityLabel={t('auth.back_to_sign_in')}
          >
            <Text style={[loginStyles.linkText, { color: theme.textMuted }]}>
              {t('auth.back_to_sign_in')}
            </Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// HomeScreen
// The primary screen parents use at 3am. Shows baby cards for each child in
// the household. Also owns the two-step onboarding flow when babies.length===0:
//   Step 1 — enter baby name(s)
//   Step 2 — set bedtime, wake time, sleep training preference
// ---------------------------------------------------------------------------
function HomeScreen({
  babies,
  setBabies,
  babiesLoading,
  resetHour,
  napCheckMinutes,
  twinSync,
  bedtimeHour,
  setBedtimeHour,
  wakeHour,
  setWakeHour,
  sleepTraining,
  setSleepTraining,
  diaperNotifications,
  setDiaperNotifications,
  bottleNotifications,
  setBottleNotifications,
  latest,
  events,
  logEvent,
  closeNap,
  onOpenAnalytics,
  onRefresh,
  isTablet = false,
}: {
  babies: Baby[];
  setBabies: (b: Baby[]) => void;
  babiesLoading: boolean;
  resetHour: number;
  napCheckMinutes: number;
  twinSync: boolean;
  bedtimeHour: number;
  setBedtimeHour: (h: number) => void;
  wakeHour: number;
  setWakeHour: (h: number) => void;
  sleepTraining: boolean;
  setSleepTraining: (v: boolean) => void;
  diaperNotifications: boolean;
  setDiaperNotifications: (v: boolean) => void;
  bottleNotifications: boolean;
  setBottleNotifications: (v: boolean) => void;
  latest: ReturnType<typeof useEventStore>['latest'];
  events: ReturnType<typeof useEventStore>['events'];
  logEvent: ReturnType<typeof useEventStore>['logEvent'];
  closeNap: ReturnType<typeof useEventStore>['closeNap'];
  onOpenAnalytics: (babyId: string) => void;
  onRefresh: ReturnType<typeof useEventStore>['poll'];
  isTablet?: boolean;
}) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  // maps alarmId → local notification identifier (for cancellation on dismiss/wake)
  const alarmNotifIds = useRef<Map<string, string>>(new Map());
  // maps babyId → scheduled diaper-reminder notification identifier
  const diaperNotifIds = useRef<Map<string, string>>(new Map());
  // maps babyId → scheduled feed-reminder notification identifier
  const bottleNotifIds = useRef<Map<string, string>>(new Map());

  /**
   * Cancel the local notification for a given alarm ID.
   * Uses the in-memory map first (same session), then falls back to scanning
   * all OS-scheduled notifications by data.alarmId (survives app restarts).
   */
  async function cancelAlarmNotification(alarmId: string): Promise<void> {
    const notifId = alarmNotifIds.current.get(alarmId);
    if (notifId) {
      await Notifications.cancelScheduledNotificationAsync(notifId).catch(console.error);
      alarmNotifIds.current.delete(alarmId);
      return;
    }
    // In-memory map was cleared (app restarted) — scan OS-scheduled notifications.
    const pending = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    for (const n of pending) {
      if ((n.content.data as Record<string, unknown>)?.alarmId === alarmId) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(console.error);
        break;
      }
    }
  }

  const { alarms, createAlarm, dismissAlarm, rescheduleAlarm, getAlarmForBaby } = useAlarms();

  // Set up notification channel (Android) and request permission once on mount
  useEffect(() => {
    setupNotificationChannel().catch(console.error);
    requestNotificationPermission().catch(console.error);
  }, []);

  // Cancel local notifications for alarms that were dismissed on another device
  useEffect(() => {
    alarmNotifIds.current.forEach((_notifId, alarmId) => {
      if (!alarms.find(a => a.id === alarmId)) {
        cancelAlarmNotification(alarmId);
      }
    });
  }, [alarms]);

  // Creates a server-side alarm and schedules a local notification for it.
  async function handleSetAlarm(baby: Baby, durationMs: number, isCustomTimer: boolean) {
    const minutes = Math.round(durationMs / 60_000);
    const label = isCustomTimer
      ? `Your ${minutes} min timer is up.`
      : `Your ${minutes} min timer is up. Do you need to check on ${baby.name}?`;
    const firesAt = new Date(Date.now() + durationMs).toISOString();
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert('Permission required', 'Allow notifications in Settings to set alarms.');
      return;
    }
    try {
      const alarm = await createAlarm(baby.id, firesAt, durationMs, label);
      const notifId = await scheduleAlarmAt(firesAt, 'TwinTracker', label, {
        alarmId: alarm.id,
        babyId: baby.id,
        isCustomTimer,
      });
      if (notifId) {
        alarmNotifIds.current.set(alarm.id, notifId);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Could not set alarm', 'There was a problem creating the alarm.');
    }
  }

  const [entries, setEntries] = useState<{ name: string; birthDate: string }[]>([
    { name: '', birthDate: '' },
  ]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [showPrefsStep, setShowPrefsStep] = useState(false);
  // Single atomic state — eliminates the split-update race where sheetBaby/sheetType turned
  // visible=true one render before sheetSuggestedOz arrived, making the init useEffect in
  // LogSheet capture suggestedOz=undefined and default the oz input to 4.
  const [sheet, setSheet] = useState<{ baby: Baby; type: EventType; suggestedOz?: number } | null>(
    null,
  );
  const [syncSuggestion, setSyncSuggestion] = useState<{
    type: 'nap' | 'bottle' | 'nursing' | 'diaper' | 'food';
    forBabyId: string;
    suggestedOz?: number;
  } | null>(null);

  // Creates babies from the dynamic entries list then advances to the schedule-preferences step.
  const handleCreateBabies = async () => {
    if (!entries.some(en => en.name.trim())) {
      setCreateError('Enter at least one name');
      return;
    }
    setCreateError('');
    setCreating(true);
    try {
      const created: Baby[] = [];
      for (const en of entries) {
        if (en.name.trim()) {
          created.push(
            await api.babies.create({
              name: en.name.trim(),
              ...(en.birthDate ? { birthDate: en.birthDate } : {}),
            }),
          );
        }
      }
      setBabies(created);
      setShowPrefsStep(true);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create babies');
    } finally {
      setCreating(false);
    }
  };

  // Main action handler from BabyCard buttons.
  // - nap/sleep while active → close the event (wake up) + dismiss any active alarm
  // - anything else → open the log sheet
  const handleLog = (baby: Baby, type: EventType, suggestedOz?: number) => {
    if (type === 'nap' || type === 'sleep') {
      const active = getActiveEvent(baby.id, type, latest);
      if (active) {
        // Dismiss server-side alarm and cancel local notification
        const existingAlarm = getAlarmForBaby(baby.id);
        if (existingAlarm) {
          dismissAlarm(existingAlarm.id).catch(console.error);
          cancelAlarmNotification(existingAlarm.id);
        }
        const endedAt = new Date().toISOString();
        closeNap(active, endedAt).catch(console.error);
        // If twinSync is on, offer to wake the other baby if their nap started around the same time
        if (twinSync && babies.length >= 2) {
          const syncedBaby = findSyncedNapBaby(baby.id, active, babies, latest);
          if (syncedBaby) {
            const otherActive =
              getActiveEvent(syncedBaby.id, 'nap', latest) ??
              getActiveEvent(syncedBaby.id, 'sleep', latest);
            if (otherActive) {
              Alert.alert(
                `Wake ${syncedBaby.name} too?`,
                `${syncedBaby.name}'s nap started around the same time.`,
                [
                  { text: 'No', style: 'cancel' },
                  {
                    text: 'Yes, wake both',
                    onPress: () => {
                      closeNap(otherActive, endedAt).catch(console.error);
                      const otherAlarm = getAlarmForBaby(syncedBaby.id);
                      if (otherAlarm) {
                        dismissAlarm(otherAlarm.id).catch(console.error);
                        cancelAlarmNotification(otherAlarm.id);
                      }
                    },
                  },
                ],
              );
            }
          }
        }
        return;
      }
    }
    setSheet({ baby, type, suggestedOz });
  };

  // Called when the LogSheet form is submitted.
  // Logs the event and evaluates whether a twin-sync suggestion banner should appear.
  const handleSheetSubmit = async (payload: LogEventPayload) => {
    const baby = sheet?.baby;
    const suggestedOz = sheet?.suggestedOz;
    setSheet(null);
    try {
      await logEvent(payload);

      // Diaper reminder: cancel any previous reminder for this baby, schedule age-adaptive interval out.
      // Skip if the fire time would land during the night window (bedtime→wake).
      if (payload.type === 'diaper' && baby && diaperNotifications) {
        const prevId = diaperNotifIds.current.get(baby.id);
        if (prevId) {
          Notifications.cancelScheduledNotificationAsync(prevId).catch(console.error);
        }
        const intervalMs = getDiaperReminderIntervalMs(baby.birthDate);
        if (!isNightFireTime(Date.now() + intervalMs, bedtimeHour, wakeHour)) {
          const notifId = await scheduleAlarmAt(
            new Date(Date.now() + intervalMs).toISOString(),
            'TwinTracker',
            `It's been about ${formatReminderInterval(intervalMs)}. Time to change ${baby.name}?`,
            { type: 'diaper', babyId: baby.id },
          );
          if (notifId) {
            diaperNotifIds.current.set(baby.id, notifId);
          }
        }
      }

      // Nap/sleep started: cancel any pending feed reminder — don't interrupt a sleeping baby.
      if ((payload.type === 'nap' || payload.type === 'sleep') && baby) {
        const prevId = bottleNotifIds.current.get(baby.id);
        if (prevId) {
          Notifications.cancelScheduledNotificationAsync(prevId).catch(console.error);
          bottleNotifIds.current.delete(baby.id);
        }
      }

      // Feed reminder: cancel any previous reminder for this baby, schedule age-adaptive interval out.
      // Skip if the fire time would land during the night window (bedtime→wake).
      if (
        (payload.type === 'bottle' || payload.type === 'nursing') &&
        baby &&
        bottleNotifications
      ) {
        const prevId = bottleNotifIds.current.get(baby.id);
        if (prevId) {
          Notifications.cancelScheduledNotificationAsync(prevId).catch(console.error);
        }
        const intervalMs = getFeedReminderIntervalMs(baby.birthDate);
        if (!isNightFireTime(Date.now() + intervalMs, bedtimeHour, wakeHour)) {
          const notifId = await scheduleAlarmAt(
            new Date(Date.now() + intervalMs).toISOString(),
            'TwinTracker',
            `It's been about ${formatReminderInterval(intervalMs)}. Time to feed ${baby.name}?`,
            { type: 'feed', babyId: baby.id },
          );
          if (notifId) {
            bottleNotifIds.current.set(baby.id, notifId);
          }
        }
      }

      // Twin sync: if twinSync is on and the other baby's matching event is stale, show a one-tap banner.
      const syncableTypes: SyncableEventType[] = ['nap', 'bottle', 'nursing', 'diaper', 'food'];
      if (
        twinSync &&
        baby &&
        babies.length >= 2 &&
        syncableTypes.includes(payload.type as SyncableEventType)
      ) {
        const type = payload.type as SyncableEventType;
        const unsynced = findUnsyncedBaby(type, baby.id, babies, latest);
        if (unsynced) {
          setSyncSuggestion({ type, forBabyId: unsynced.id, suggestedOz });
        }
      }
    } catch (err) {
      console.error('logEvent failed:', err);
    }
  };

  const inputStyle = [
    homeStyles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
  ];

  if (babiesLoading) {
    return (
      <View style={[homeStyles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.text} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {babies.length === 0 ? (
        /* Onboarding step 1 — ScrollView so keyboard doesn't clip inputs */
        <ScrollView contentContainerStyle={homeStyles.scroll}>
          <View style={homeStyles.onboarding}>
            <Text style={[homeStyles.onboardTitle, { color: theme.text }]}>
              {t('onboarding.welcome')}
            </Text>
            <Text style={[homeStyles.onboardSub, { color: theme.textMuted }]}>
              {t('onboarding.subtitle')}
            </Text>
            {entries.map((en, i) => (
              <View key={i}>
                <View style={homeStyles.entryHeader}>
                  <Text style={[homeStyles.entryLabel, { color: theme.textMuted }]}>
                    {t('onboarding.baby_n', { n: i + 1 })}
                  </Text>
                  {entries.length > 1 && (
                    <Pressable
                      onPress={() => setEntries(prev => prev.filter((_, j) => j !== i))}
                      accessibilityLabel={`Remove baby ${i + 1}`}
                      style={({ pressed }) => [
                        { opacity: pressed ? 0.6 : 1, paddingHorizontal: 8 },
                      ]}
                    >
                      <Text style={{ color: theme.urgencyOverdue, fontSize: 20 }}>×</Text>
                    </Pressable>
                  )}
                </View>
                <TextInput
                  style={inputStyle}
                  placeholder={t('onboarding.dob_placeholder', { n: i + 1 })}
                  placeholderTextColor={theme.textMuted}
                  value={en.name}
                  onChangeText={v =>
                    setEntries(prev => prev.map((e, j) => (j === i ? { ...e, name: v } : e)))
                  }
                  accessibilityLabel={t('onboarding.baby_n', { n: i + 1 })}
                />
                <Text style={[homeStyles.dobLabel, { color: theme.textMuted }]}>
                  {t('onboarding.dob_label')}
                </Text>
                <TextInput
                  style={inputStyle}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textMuted}
                  value={en.birthDate}
                  onChangeText={v =>
                    setEntries(prev => prev.map((e, j) => (j === i ? { ...e, birthDate: v } : e)))
                  }
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            ))}
            <Pressable
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, marginBottom: 16 }]}
              onPress={() => setEntries(prev => [...prev, { name: '', birthDate: '' }])}
            >
              <Text style={[homeStyles.addAnotherText, { color: theme.accent }]}>
                {t('onboarding.add_another')}
              </Text>
            </Pressable>
            {createError ? (
              <Text style={[homeStyles.error, { color: theme.urgencyOverdue }]}>{createError}</Text>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                homeStyles.submitBtn,
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={handleCreateBabies}
              disabled={creating}
              accessibilityLabel={t('onboarding.get_started')}
            >
              {creating ? (
                <ActivityIndicator color={theme.bg} />
              ) : (
                <Text style={[homeStyles.submitText, { color: theme.bg }]}>
                  {t('onboarding.get_started')}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      ) : showPrefsStep ? (
        /* Onboarding step 2 — schedule setup */
        <ScrollView contentContainerStyle={homeStyles.scroll}>
          <View style={homeStyles.onboarding}>
            <Text style={[homeStyles.onboardTitle, { color: theme.text }]}>
              {t('onboarding.prefs_heading')}
            </Text>
            <Text style={[homeStyles.onboardSub, { color: theme.textMuted }]}>
              {t('onboarding.prefs_subtitle')}
            </Text>

            <View style={settingsStyles.adminSection}>
              <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
                {t('settings.bedtime_title').toUpperCase()}
              </Text>
              <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
                {t('settings.bedtime_hint')}
              </Text>
              <View style={settingsStyles.pillGrid}>
                {BEDTIME_HOURS.map(h => {
                  const active = bedtimeHour === h;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => setBedtimeHour(h)}
                      accessibilityLabel={hourLabel(h)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      style={[
                        settingsStyles.pill,
                        { borderColor: active ? theme.accent : theme.border },
                        active && { backgroundColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[settingsStyles.pillText, { color: active ? theme.bg : theme.text }]}
                      >
                        {hourLabel(h)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={settingsStyles.adminSection}>
              <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
                {t('settings.wake_title').toUpperCase()}
              </Text>
              <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
                {t('settings.wake_hint')}
              </Text>
              <View style={settingsStyles.pillGrid}>
                {WAKE_HOURS.map(h => {
                  const active = wakeHour === h;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => setWakeHour(h)}
                      accessibilityLabel={hourLabel(h)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      style={[
                        settingsStyles.pill,
                        { borderColor: active ? theme.accent : theme.border },
                        active && { backgroundColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[settingsStyles.pillText, { color: active ? theme.bg : theme.text }]}
                      >
                        {hourLabel(h)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={settingsStyles.adminSection}>
              <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
                {t('settings.sleep_training_title').toUpperCase()}
              </Text>
              <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
                {t('settings.sleep_training_hint')}
              </Text>
              <Pressable
                onPress={() => setSleepTraining(!sleepTraining)}
                style={[
                  settingsStyles.pill,
                  {
                    borderColor: sleepTraining ? theme.accent : theme.border,
                    flex: undefined,
                    width: '100%',
                  },
                  sleepTraining && { backgroundColor: theme.accent },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: sleepTraining }}
              >
                <Text
                  style={[
                    settingsStyles.pillText,
                    { color: sleepTraining ? theme.bg : theme.text },
                  ]}
                >
                  {sleepTraining
                    ? t('settings.sleep_training_enabled')
                    : t('settings.sleep_training_enable')}
                </Text>
              </Pressable>
            </View>

            <View style={settingsStyles.adminSection}>
              <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
                {t('settings.diaper_notifications_title').toUpperCase()}
              </Text>
              <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
                {t('settings.diaper_notifications_hint')}
              </Text>
              <Pressable
                onPress={() => setDiaperNotifications(!diaperNotifications)}
                style={[
                  settingsStyles.pill,
                  {
                    borderColor: diaperNotifications ? theme.accent : theme.border,
                    flex: undefined,
                    width: '100%',
                  },
                  diaperNotifications && { backgroundColor: theme.accent },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: diaperNotifications }}
              >
                <Text
                  style={[
                    settingsStyles.pillText,
                    { color: diaperNotifications ? theme.bg : theme.text },
                  ]}
                >
                  {diaperNotifications
                    ? t('settings.diaper_notifications_enabled')
                    : t('settings.diaper_notifications_enable')}
                </Text>
              </Pressable>
            </View>

            <View style={settingsStyles.adminSection}>
              <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
                {t('settings.bottle_notifications_title').toUpperCase()}
              </Text>
              <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
                {t('settings.bottle_notifications_hint')}
              </Text>
              <Pressable
                onPress={() => setBottleNotifications(!bottleNotifications)}
                style={[
                  settingsStyles.pill,
                  {
                    borderColor: bottleNotifications ? theme.accent : theme.border,
                    flex: undefined,
                    width: '100%',
                  },
                  bottleNotifications && { backgroundColor: theme.accent },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: bottleNotifications }}
              >
                <Text
                  style={[
                    settingsStyles.pillText,
                    { color: bottleNotifications ? theme.bg : theme.text },
                  ]}
                >
                  {bottleNotifications
                    ? t('settings.bottle_notifications_enabled')
                    : t('settings.bottle_notifications_enable')}
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                homeStyles.submitBtn,
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1, marginTop: 8 },
              ]}
              onPress={() => setShowPrefsStep(false)}
              accessibilityLabel={t('onboarding.done')}
            >
              <Text style={[homeStyles.submitText, { color: theme.bg }]}>
                {t('onboarding.done')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                onRefresh().finally(() => setRefreshing(false));
              }}
              tintColor={theme.accent}
            />
          }
        >
          {syncSuggestion &&
            (() => {
              const syncBaby = babies.find(b => b.id === syncSuggestion.forBabyId);
              if (!syncBaby) {
                return null;
              }
              const SYNC_KEY: Record<string, string> = {
                nap: 'home.sync_put_down',
                bottle: 'home.sync_feed',
                nursing: 'home.sync_feed',
                diaper: 'home.sync_diaper',
                food: 'home.sync_food',
              };
              const label = t(SYNC_KEY[syncSuggestion.type] ?? 'home.sync_feed', {
                name: syncBaby.name,
              });
              return (
                <View
                  style={[
                    homeStyles.syncBanner,
                    { backgroundColor: theme.surface, borderBottomColor: theme.border },
                  ]}
                >
                  <Text style={[homeStyles.syncBannerText, { color: theme.text }]}>{label}</Text>
                  <View style={homeStyles.syncBannerActions}>
                    <Pressable
                      style={[homeStyles.syncBtn, { backgroundColor: theme.accent }]}
                      onPress={() => {
                        const type = syncSuggestion.type;
                        const oz = syncSuggestion.suggestedOz;
                        setSyncSuggestion(null);
                        if (
                          type === 'bottle' ||
                          type === 'nursing' ||
                          type === 'diaper' ||
                          type === 'food'
                        ) {
                          // Open LogSheet for the twin so the user can confirm/adjust
                          // the amount, type, or notes — never auto-log with a guessed value.
                          setSheet({
                            baby: syncBaby,
                            type,
                            suggestedOz: type === 'bottle' ? oz : undefined,
                          });
                        } else {
                          // nap: no variable input, safe to log directly
                          logEvent({
                            babyId: syncBaby.id,
                            type,
                            startedAt: new Date().toISOString(),
                          }).catch(console.error);
                        }
                      }}
                    >
                      <Text style={[homeStyles.syncBtnText, { color: theme.bg }]}>
                        {t('common.yes')}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[homeStyles.syncBtn, { borderColor: theme.border, borderWidth: 1 }]}
                      onPress={() => setSyncSuggestion(null)}
                    >
                      <Text style={[homeStyles.syncBtnText, { color: theme.text }]}>
                        {t('common.skip')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })()}
          {/* Baby cards — row on tablet, column on phone */}
          <View style={[homeStyles.babyGrid, isTablet && homeStyles.babyGridTablet]}>
            {babies.map(baby => (
              <BabyCard
                key={baby.id}
                baby={baby}
                latest={latest}
                events={events}
                onLog={(type, oz) => handleLog(baby, type, oz)}
                onOpenAnalytics={onOpenAnalytics}
                resetHour={resetHour}
                bedtimeHour={bedtimeHour}
                wakeHour={wakeHour}
                sleepTraining={sleepTraining}
                napCheckMinutes={napCheckMinutes}
                activeAlarm={getAlarmForBaby(baby.id)}
                onSetAlarm={(durationMs, isCustomTimer) =>
                  handleSetAlarm(baby, durationMs, isCustomTimer)
                }
                onDismissAlarm={() => {
                  const alarm = getAlarmForBaby(baby.id);
                  if (alarm) {
                    dismissAlarm(alarm.id).catch(console.error);
                    cancelAlarmNotification(alarm.id);
                  }
                }}
                onRescheduleAlarm={(firesAt, durationMs) => {
                  const alarm = getAlarmForBaby(baby.id);
                  if (alarm) {
                    rescheduleAlarm(alarm.id, firesAt, durationMs).catch(console.error);
                    cancelAlarmNotification(alarm.id);
                    scheduleAlarmAt(firesAt, 'TwinTracker', `Time to wake ${baby.name}`, {
                      alarmId: alarm.id,
                    })
                      .then(notifId => {
                        if (notifId) {
                          alarmNotifIds.current.set(alarm.id, notifId);
                        }
                      })
                      .catch(console.error);
                  }
                }}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <LogSheet
        visible={sheet !== null}
        baby={sheet?.baby ?? null}
        eventType={sheet?.type ?? null}
        suggestedOz={sheet?.suggestedOz}
        onSubmit={handleSheetSubmit}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// HistoryScreen
// Chronological list of all events, grouped by daily reset period.
// Swipe left on any row to delete. Tap to edit.
// The quick-add panel (+ button in section header) lets parents back-fill
// missed logs for a past day.
// ---------------------------------------------------------------------------
function HistoryScreen({
  babies,
  resetHour,
  events,
  loading,
  deleteEvent,
  editEvent,
  logEvent,
  onRefresh,
}: {
  babies: Baby[];
  resetHour: number;
  events: ReturnType<typeof useEventStore>['events'];
  loading: ReturnType<typeof useEventStore>['loading'];
  deleteEvent: ReturnType<typeof useEventStore>['deleteEvent'];
  editEvent: ReturnType<typeof useEventStore>['editEvent'];
  logEvent: ReturnType<typeof useEventStore>['logEvent'];
  onRefresh: ReturnType<typeof useEventStore>['poll'];
}) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const [editingEvent, setEditingEvent] = useState<TrackerEvent | null>(null);
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);
  const [quickBaby, setQuickBaby] = useState<Baby | null>(null);
  const [quickType, setQuickType] = useState<EventType | null>(null);

  const EVENT_TYPES: EventType[] = [
    'bottle',
    'nap',
    'sleep',
    'diaper',
    'nursing',
    'medicine',
    'food',
    'milestone',
  ];

  function handleAddForDay(date: Date) {
    const now = new Date();
    // Current period: period start is within last 24h → use current time
    // Past period: use noon of that calendar day (sensible default to adjust from)
    const isCurrentPeriod = date.getTime() + 24 * 60 * 60 * 1000 > now.getTime();
    const adjusted = isCurrentPeriod
      ? now
      : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    setQuickAddDate(adjusted);
    setQuickBaby(null);
    setQuickType(null);
  }

  function handleQuickSubmit(payload: LogEventPayload) {
    logEvent(payload).catch(console.error);
    setQuickAddDate(null);
    setQuickBaby(null);
    setQuickType(null);
  }

  if (loading) {
    return (
      <View style={[homeStyles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <HistoryFeed
        events={events}
        babies={babies}
        resetHour={resetHour}
        onDelete={id => deleteEvent(id).catch(console.error)}
        onEdit={setEditingEvent}
        onAddForDay={handleAddForDay}
        onRefresh={onRefresh}
      />

      {/* Edit existing event */}
      <LogSheet
        visible={editingEvent !== null}
        baby={babies.find(b => b.id === editingEvent?.babyId) ?? null}
        eventType={editingEvent?.type ?? null}
        initialEvent={editingEvent ?? undefined}
        onEdit={(id, payload) => {
          editEvent(id, payload).catch(console.error);
          setEditingEvent(null);
        }}
        onSubmit={() => setEditingEvent(null)}
        onClose={() => setEditingEvent(null)}
      />

      {/* Quick-add: baby selector → type selector → LogSheet */}
      {quickAddDate !== null && quickBaby === null && (
        <View
          style={[
            quickStyles.panel,
            { backgroundColor: theme.surface, borderTopColor: theme.border },
          ]}
        >
          <Text style={[quickStyles.label, { color: theme.textMuted }]}>SELECT BABY</Text>
          <View style={quickStyles.pillRow}>
            {babies.map(b => (
              <Pressable
                key={b.id}
                onPress={() => setQuickBaby(b)}
                style={[quickStyles.pill, { borderColor: theme.border }]}
              >
                <Text style={[quickStyles.pillText, { color: theme.text }]}>{b.name}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setQuickAddDate(null)} style={quickStyles.cancelBtn}>
            <Text style={[quickStyles.cancelText, { color: theme.textMuted }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      )}
      {quickAddDate !== null && quickBaby !== null && quickType === null && (
        <View
          style={[
            quickStyles.panel,
            { backgroundColor: theme.surface, borderTopColor: theme.border },
          ]}
        >
          <Text style={[quickStyles.label, { color: theme.textMuted }]}>SELECT TYPE</Text>
          <View style={quickStyles.pillRow}>
            {EVENT_TYPES.map(type => (
              <Pressable
                key={type}
                onPress={() => setQuickType(type)}
                style={[quickStyles.pill, { borderColor: theme.border }]}
              >
                <Text style={[quickStyles.pillText, { color: theme.text }]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setQuickBaby(null)} style={quickStyles.cancelBtn}>
            <Text style={[quickStyles.cancelText, { color: theme.textMuted }]}>
              {t('common.back')}
            </Text>
          </Pressable>
        </View>
      )}
      <LogSheet
        visible={quickAddDate !== null && quickBaby !== null && quickType !== null}
        baby={quickBaby}
        eventType={quickType}
        initialStartedAt={quickAddDate?.toISOString()}
        onSubmit={handleQuickSubmit}
        onClose={() => {
          setQuickAddDate(null);
          setQuickBaby(null);
          setQuickType(null);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Analytics Screen
// ---------------------------------------------------------------------------
function formatMs(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

function formatInterval(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h === 0) {
    return `${m} min`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function AnalyticsScreen({
  baby,
  events,
  resetHour,
  sleepTraining,
  onBack,
}: {
  baby: Baby;
  events: TrackerEvent[];
  resetHour: number;
  sleepTraining: boolean;
  onBack: () => void;
}) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const now = new Date();
  const a: BabyAnalytics = computeAnalytics(
    events.filter(e => e.babyId === baby.id),
    now,
    resetHour,
    period,
    baby.birthDate,
  );

  const periodDays = period === 'day' ? 1 : period === 'month' ? 30 : 7;
  const periodLabel = period === 'day' ? 'today' : period === 'month' ? 'this month' : 'this week';

  const weekEnd = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString(
    undefined,
    { month: 'short', day: 'numeric' },
  );
  const periodHeader =
    period === 'day'
      ? 'Today'
      : period === 'month'
        ? 'Last 30 days'
        : t('analytics.this_week', { range: `${weekStart} – ${weekEnd}` });

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={analyticsStyles.scroll}
    >
      <Pressable
        onPress={onBack}
        style={analyticsStyles.backBtn}
        accessibilityLabel={t('common.back')}
      >
        <Text style={[analyticsStyles.backText, { color: theme.textMuted }]}>
          {t('common.back')}
        </Text>
      </Pressable>
      <Text style={[analyticsStyles.heading, { color: theme.text }]}>
        {t('analytics.heading', { name: baby.name })}
      </Text>
      <Text style={[analyticsStyles.subheading, { color: theme.textMuted }]}>{periodHeader}</Text>

      <View style={analyticsStyles.periodTabs}>
        {(['day', 'week', 'month'] as const).map(p => (
          <Pressable
            key={p}
            style={[
              analyticsStyles.periodTab,
              { borderColor: theme.border },
              period === p && { backgroundColor: theme.accent, borderColor: theme.accent },
            ]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={[
                analyticsStyles.periodTabText,
                { color: period === p ? theme.bg : theme.textMuted },
              ]}
            >
              {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
            </Text>
          </Pressable>
        ))}
      </View>

      {a.dataSpanDays < periodDays - 1 && (
        <Text
          style={[
            analyticsStyles.dataNotice,
            { color: theme.textMuted, borderColor: theme.border },
          ]}
        >
          {`Only ${Math.ceil(a.dataSpanDays)} day${Math.ceil(a.dataSpanDays) === 1 ? '' : 's'} of data — partial ${period} view.`}
        </Text>
      )}

      <View
        style={[
          analyticsStyles.block,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={analyticsStyles.blockHeader}>
          <BottleIcon size={14} color={theme.textMuted} />
          <Text style={[analyticsStyles.blockTitle, { color: theme.textMuted }]}>
            {t('analytics.feeding')}
          </Text>
        </View>
        {a.totalOzThisWeek > 0 ? (
          <>
            <Text style={[analyticsStyles.stat, { color: theme.text }]}>
              {t('analytics.feeding_oz', { total: a.totalOzThisWeek })}
            </Text>
            {a.avgOzPerFeed != null && (
              <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
                {t('analytics.feeding_avg_oz', { avg: a.avgOzPerFeed.toFixed(1) })}
              </Text>
            )}
            {a.avgFeedIntervalMs != null && (
              <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
                {t('analytics.feeding_interval', { interval: formatInterval(a.avgFeedIntervalMs) })}
              </Text>
            )}
            <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
              {`${a.avgFeedsPerDay.toFixed(1)} feeds/day`}
            </Text>
            <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
              {`Target: ${a.targetOzPerFeed} oz/feed · every ${formatInterval(a.targetFeedIntervalMs)}`}
            </Text>
            <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
              {`Avg: ${a.avgOzPerDay.toFixed(1)} oz/day · Max rec: ${a.targetDailyOzMax} oz/day`}
            </Text>
          </>
        ) : (
          <Text style={[analyticsStyles.empty, { color: theme.textMuted }]}>
            {t('analytics.feeding_empty', { period: periodLabel })}
          </Text>
        )}
      </View>

      <View
        style={[
          analyticsStyles.block,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={analyticsStyles.blockHeader}>
          <MoonIcon size={14} color={theme.textMuted} />
          <Text style={[analyticsStyles.blockTitle, { color: theme.textMuted }]}>
            {t('analytics.naps')}
          </Text>
        </View>
        {a.napCountThisWeek > 0 ? (
          <>
            <Text style={[analyticsStyles.stat, { color: theme.text }]}>
              {a.napCountThisWeek === 1
                ? t('analytics.naps_total', {
                    total: formatMs(a.totalNapMsThisWeek),
                    count: a.napCountThisWeek,
                    period: periodLabel,
                  })
                : t('analytics.naps_total_plural', {
                    total: formatMs(a.totalNapMsThisWeek),
                    count: a.napCountThisWeek,
                    period: periodLabel,
                  })}
            </Text>
            {a.avgNapDurationMs != null && (
              <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
                {t('analytics.naps_avg', { avg: formatMs(a.avgNapDurationMs) })}
              </Text>
            )}
            {a.longestNapMs != null && (
              <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
                {t('analytics.naps_longest', { longest: formatMs(a.longestNapMs) })}
              </Text>
            )}
            <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
              {`Target nap: ${formatMs(a.targetNapDurationMs)}`}
            </Text>
          </>
        ) : (
          <Text style={[analyticsStyles.empty, { color: theme.textMuted }]}>
            {t('analytics.naps_empty', { period: periodLabel })}
          </Text>
        )}
      </View>

      <View
        style={[
          analyticsStyles.block,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={analyticsStyles.blockHeader}>
          <HotelIcon size={14} color={theme.textMuted} />
          <Text style={[analyticsStyles.blockTitle, { color: theme.textMuted }]}>
            {t('analytics.night_sleep')}
          </Text>
        </View>
        {a.nightSleepCountThisWeek > 0 ? (
          <>
            <Text style={[analyticsStyles.stat, { color: theme.text }]}>
              {a.nightSleepCountThisWeek === 1
                ? t('analytics.night_sleep_total', {
                    total: formatMs(a.totalNightSleepMsThisWeek),
                    count: a.nightSleepCountThisWeek,
                    period: periodLabel,
                  })
                : t('analytics.night_sleep_total_plural', {
                    total: formatMs(a.totalNightSleepMsThisWeek),
                    count: a.nightSleepCountThisWeek,
                    period: periodLabel,
                  })}
            </Text>
            {a.avgNightSleepDurationMs != null && (
              <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
                {t('analytics.night_sleep_avg', { avg: formatMs(a.avgNightSleepDurationMs) })}
              </Text>
            )}
            {a.sleepDeltaVsLastWeek != null && (
              <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
                {a.sleepDeltaVsLastWeek >= 0
                  ? t('analytics.sleep_more', { delta: formatMs(Math.abs(a.sleepDeltaVsLastWeek)) })
                  : t('analytics.sleep_less', {
                      delta: formatMs(Math.abs(a.sleepDeltaVsLastWeek)),
                    })}
              </Text>
            )}
            <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
              {`Avg daily sleep: ${formatMs(a.avgDailySleepMs)} · Target: ${formatMs(a.targetDailySleepMs.minMs)}–${formatMs(a.targetDailySleepMs.maxMs)}`}
            </Text>
          </>
        ) : (
          <Text style={[analyticsStyles.empty, { color: theme.textMuted }]}>
            {t('analytics.night_sleep_empty', { period: periodLabel })}
          </Text>
        )}
      </View>

      <View
        style={[
          analyticsStyles.block,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={analyticsStyles.blockHeader}>
          <DiaperIcon size={14} color={theme.textMuted} />
          <Text style={[analyticsStyles.blockTitle, { color: theme.textMuted }]}>
            {t('analytics.diapers')}
          </Text>
        </View>
        {a.diaperCountThisWeek > 0 ? (
          <>
            <Text style={[analyticsStyles.stat, { color: theme.text }]}>
              {t('analytics.diapers_count', { count: a.diaperCountThisWeek, period: periodLabel })}
            </Text>
            <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
              {t('analytics.diapers_per_day', { avg: a.avgDiapersPerDay.toFixed(1) })}
            </Text>
            {a.targetMinWetDiapersPerDay != null && (
              <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
                {`Min wet diapers/day: ${a.targetMinWetDiapersPerDay} (newborn adequacy)`}
              </Text>
            )}
          </>
        ) : (
          <Text style={[analyticsStyles.empty, { color: theme.textMuted }]}>
            {t('analytics.diapers_empty', { period: periodLabel })}
          </Text>
        )}
        {a.msSinceLastDirty != null && (
          <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
            {`Last dirty: ${formatInterval(a.msSinceLastDirty)} ago`}
          </Text>
        )}
      </View>

      {a.foodCountThisWeek > 0 && (
        <View
          style={[
            analyticsStyles.block,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={analyticsStyles.blockHeader}>
            <FoodIcon size={14} color={theme.textMuted} />
            <Text style={[analyticsStyles.blockTitle, { color: theme.textMuted }]}>
              {t('analytics.solids')}
            </Text>
          </View>
          <Text style={[analyticsStyles.stat, { color: theme.text }]}>
            {a.foodCountThisWeek === 1
              ? t('analytics.solids_count_one', { count: a.foodCountThisWeek, period: periodLabel })
              : t('analytics.solids_count_other', {
                  count: a.foodCountThisWeek,
                  period: periodLabel,
                })}
          </Text>
          <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
            {t('analytics.solids_note', { name: baby.name })}
          </Text>
        </View>
      )}

      {sleepTraining && (
        <View
          style={[
            analyticsStyles.block,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={analyticsStyles.blockHeader}>
            <MoonIcon size={14} color={theme.textMuted} />
            <Text style={[analyticsStyles.blockTitle, { color: theme.textMuted }]}>
              {'SLEEP TRAINING'}
            </Text>
          </View>
          <Text style={[analyticsStyles.stat, { color: theme.text }]}>
            {`Self-soothing wait: ${formatInterval(a.selfSoothingWaitMs)}`}
          </Text>
          <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
            {'When nap crying starts, wait before responding. Reset timer if crying pauses.'}
          </Text>
          <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
            {'After wait: respond with a feed only — no rocking or comfort.'}
          </Text>
        </View>
      )}

      {a.milestones.length > 0 && (
        <View
          style={[
            analyticsStyles.block,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={analyticsStyles.blockHeader}>
            <MilestoneIcon size={14} color={theme.textMuted} />
            <Text style={[analyticsStyles.blockTitle, { color: theme.textMuted }]}>
              {t('analytics.milestones')}
            </Text>
          </View>
          {a.milestones.map(m => (
            <Text key={m.id} style={[analyticsStyles.milestone, { color: theme.text }]}>
              {t('analytics.milestone_row', { notes: m.notes, date: formatDate(m.startedAt) })}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// SettingsScreen
// All user-configurable preferences. Pill-button grids for numeric options,
// toggle pills for booleans. Admin section (mock data, clear logs) only
// visible to admin accounts.
// ---------------------------------------------------------------------------
function SettingsScreen({
  napCheckMinutes,
  setNapCheckMinutes,
  twinSync,
  setTwinSync,
  bedtimeHour,
  setBedtimeHour,
  wakeHour,
  setWakeHour,
  sleepTraining,
  setSleepTraining,
  diaperNotifications,
  setDiaperNotifications,
  bottleNotifications,
  setBottleNotifications,
  babiesCount,
  isAdmin,
  clearAllEvents,
  onLogout,
  inviteCode,
  mockMode,
  generating,
  mockProgress,
  onToggleMockData,
  displayName,
  updateDisplayName,
}: {
  napCheckMinutes: number;
  setNapCheckMinutes: (m: number) => void;
  twinSync: boolean;
  setTwinSync: (v: boolean) => void;
  bedtimeHour: number;
  setBedtimeHour: (h: number) => void;
  wakeHour: number;
  setWakeHour: (h: number) => void;
  sleepTraining: boolean;
  setSleepTraining: (v: boolean) => void;
  diaperNotifications: boolean;
  setDiaperNotifications: (v: boolean) => void;
  bottleNotifications: boolean;
  setBottleNotifications: (v: boolean) => void;
  babiesCount: number;
  isAdmin: boolean;
  clearAllEvents: () => Promise<void>;
  onLogout: () => void;
  inviteCode: string | null;
  mockMode: boolean;
  generating: boolean;
  mockProgress: { done: number; total: number } | null;
  onToggleMockData: () => void;
  displayName: string | null;
  updateDisplayName: (name: string) => Promise<void>;
}) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const [nameInput, setNameInput] = useState(() => displayName ?? '');
  const [nameSaved, setNameSaved] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  function handleClearLogs() {
    Alert.alert(t('settings.clear_logs'), t('settings.clear_hint'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setClearing(true);
          try {
            await clearAllEvents();
            setCleared(true);
            setTimeout(() => setCleared(false), 3000);
          } catch {
            Alert.alert('Error', 'Failed to clear logs');
          } finally {
            setClearing(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={homeStyles.scroll}>
      <Text style={[homeStyles.onboardTitle, { color: theme.text }]}>{t('settings.heading')}</Text>

      {!sleepTraining && (
        <>
          <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
            {t('settings.nap_check_title').toUpperCase()}
          </Text>
          <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
            {t('settings.nap_check_hint')}
          </Text>
          <View style={settingsStyles.pillGrid}>
            {NAP_CHECK_MINUTES.map(m => {
              const active = napCheckMinutes === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setNapCheckMinutes(m)}
                  accessibilityLabel={t('settings.nap_check_minutes', { n: m })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={[
                    settingsStyles.pill,
                    { borderColor: active ? theme.accent : theme.border },
                    active && { backgroundColor: theme.accent },
                  ]}
                >
                  <Text
                    style={[settingsStyles.pillText, { color: active ? theme.bg : theme.text }]}
                  >
                    {t('settings.nap_check_minutes', { n: m })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {babiesCount >= 2 && (
        <View style={settingsStyles.adminSection}>
          <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
            {t('settings.twin_sync_title').toUpperCase()}
          </Text>
          <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
            {t('settings.twin_sync_hint')}
          </Text>
          <Pressable
            onPress={() => setTwinSync(!twinSync)}
            style={[
              settingsStyles.pill,
              {
                borderColor: twinSync ? theme.accent : theme.border,
                flex: undefined,
                width: '100%',
              },
              twinSync && { backgroundColor: theme.accent },
            ]}
            accessibilityRole="switch"
            accessibilityState={{ checked: twinSync }}
          >
            <Text style={[settingsStyles.pillText, { color: twinSync ? theme.bg : theme.text }]}>
              {twinSync ? t('settings.twin_sync_enabled') : t('settings.twin_sync_enable')}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={settingsStyles.adminSection}>
        <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
          {t('settings.diaper_notifications_title').toUpperCase()}
        </Text>
        <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
          {t('settings.diaper_notifications_hint')}
        </Text>
        <Pressable
          onPress={() => setDiaperNotifications(!diaperNotifications)}
          style={[
            settingsStyles.pill,
            {
              borderColor: diaperNotifications ? theme.accent : theme.border,
              flex: undefined,
              width: '100%',
            },
            diaperNotifications && { backgroundColor: theme.accent },
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: diaperNotifications }}
        >
          <Text
            style={[
              settingsStyles.pillText,
              { color: diaperNotifications ? theme.bg : theme.text },
            ]}
          >
            {diaperNotifications
              ? t('settings.diaper_notifications_enabled')
              : t('settings.diaper_notifications_enable')}
          </Text>
        </Pressable>
      </View>

      <View style={settingsStyles.adminSection}>
        <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
          {t('settings.bottle_notifications_title').toUpperCase()}
        </Text>
        <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
          {t('settings.bottle_notifications_hint')}
        </Text>
        <Pressable
          onPress={() => setBottleNotifications(!bottleNotifications)}
          style={[
            settingsStyles.pill,
            {
              borderColor: bottleNotifications ? theme.accent : theme.border,
              flex: undefined,
              width: '100%',
            },
            bottleNotifications && { backgroundColor: theme.accent },
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: bottleNotifications }}
        >
          <Text
            style={[
              settingsStyles.pillText,
              { color: bottleNotifications ? theme.bg : theme.text },
            ]}
          >
            {bottleNotifications
              ? t('settings.bottle_notifications_enabled')
              : t('settings.bottle_notifications_enable')}
          </Text>
        </Pressable>
      </View>

      <View style={settingsStyles.adminSection}>
        <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
          {t('settings.sleep_training_title').toUpperCase()}
        </Text>
        <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
          {t('settings.sleep_training_hint')}
        </Text>
        <Pressable
          onPress={() => setSleepTraining(!sleepTraining)}
          style={[
            settingsStyles.pill,
            {
              borderColor: sleepTraining ? theme.accent : theme.border,
              flex: undefined,
              width: '100%',
            },
            sleepTraining && { backgroundColor: theme.accent },
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: sleepTraining }}
        >
          <Text style={[settingsStyles.pillText, { color: sleepTraining ? theme.bg : theme.text }]}>
            {sleepTraining
              ? t('settings.sleep_training_enabled')
              : t('settings.sleep_training_enable')}
          </Text>
        </Pressable>
      </View>

      <View style={settingsStyles.adminSection}>
        <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
          {t('settings.wake_title').toUpperCase()}
        </Text>
        <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
          {t('settings.wake_hint')}
        </Text>
        <View style={settingsStyles.pillGrid}>
          {WAKE_HOURS.map(h => {
            const active = wakeHour === h;
            return (
              <Pressable
                key={h}
                onPress={() => setWakeHour(h)}
                accessibilityLabel={hourLabel(h)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={[
                  settingsStyles.pill,
                  { borderColor: active ? theme.accent : theme.border },
                  active && { backgroundColor: theme.accent },
                ]}
              >
                <Text style={[settingsStyles.pillText, { color: active ? theme.bg : theme.text }]}>
                  {hourLabel(h)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={settingsStyles.adminSection}>
        <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
          {t('settings.bedtime_title').toUpperCase()}
        </Text>
        <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
          {t('settings.bedtime_hint')}
        </Text>
        <View style={settingsStyles.pillGrid}>
          {BEDTIME_HOURS.map(h => {
            const active = bedtimeHour === h;
            return (
              <Pressable
                key={h}
                onPress={() => setBedtimeHour(h)}
                accessibilityLabel={hourLabel(h)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={[
                  settingsStyles.pill,
                  { borderColor: active ? theme.accent : theme.border },
                  active && { backgroundColor: theme.accent },
                ]}
              >
                <Text style={[settingsStyles.pillText, { color: active ? theme.bg : theme.text }]}>
                  {hourLabel(h)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {inviteCode && (
        <View style={settingsStyles.adminSection}>
          <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
            {t('settings.invite_title').toUpperCase()}
          </Text>
          <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
            {t('settings.invite_hint')}
          </Text>
          <View style={[settingsStyles.codeRow, { borderColor: theme.border }]}>
            <Text style={[settingsStyles.codeText, { color: theme.text }]}>{inviteCode}</Text>
            <Pressable
              onPress={() =>
                Share.share({ message: t('settings.invite_share_message', { code: inviteCode }) })
              }
              style={[settingsStyles.shareBtn, { borderColor: theme.border }]}
              accessibilityLabel={t('settings.invite_share')}
            >
              <Text style={[settingsStyles.shareBtnText, { color: theme.text }]}>
                {t('settings.invite_share')} ›
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={settingsStyles.adminSection}>
        <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
          {t('settings.profile_title').toUpperCase()}
        </Text>
        <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
          {t('settings.your_name_label')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TextInput
            style={[
              {
                flex: 1,
                height: 44,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                fontSize: 14,
              },
              { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
            ]}
            placeholder={t('settings.your_name_placeholder')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="words"
            value={nameInput}
            onChangeText={v => {
              setNameInput(v);
              setNameSaved(false);
            }}
            accessibilityLabel={t('settings.your_name_label')}
          />
          <Pressable
            style={({ pressed }) => [
              settingsStyles.pill,
              {
                width: 'auto',
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
                paddingHorizontal: 16,
              },
            ]}
            onPress={async () => {
              await updateDisplayName(nameInput);
              setNameSaved(true);
              setTimeout(() => setNameSaved(false), 2000);
            }}
            accessibilityLabel={t('settings.save_name')}
          >
            <Text style={[settingsStyles.pillText, { color: theme.text }]}>
              {nameSaved ? '✓' : t('settings.save_name')}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={settingsStyles.adminSection}>
        <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
          {t('settings.account_title').toUpperCase()}
        </Text>
        <Pressable
          onPress={onLogout}
          style={[settingsStyles.dangerBtn, { borderColor: theme.border }]}
          accessibilityLabel={t('settings.sign_out')}
        >
          <Text style={[settingsStyles.dangerText, { color: theme.text }]}>
            {t('settings.sign_out')}
          </Text>
        </Pressable>
      </View>

      {isAdmin && (
        <View style={settingsStyles.adminSection}>
          <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
            {t('settings.admin_title').toUpperCase()}
          </Text>
          <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
            {t('settings.mock_hint')}
          </Text>
          <Pressable
            onPress={onToggleMockData}
            disabled={generating}
            style={[
              settingsStyles.dangerBtn,
              { borderColor: mockMode ? theme.accent : theme.border },
              mockMode && { backgroundColor: theme.accent },
            ]}
            accessibilityLabel={mockMode ? t('settings.mock_on') : t('settings.mock_off')}
          >
            <Text style={[settingsStyles.dangerText, { color: mockMode ? theme.bg : theme.text }]}>
              {generating
                ? mockProgress
                  ? t(mockMode ? 'settings.mock_restoring' : 'settings.mock_generating', {
                      done: mockProgress.done,
                      total: mockProgress.total,
                    })
                  : t('settings.mock_working')
                : mockMode
                  ? t('settings.mock_on')
                  : t('settings.mock_off')}
            </Text>
          </Pressable>
          <Text style={[settingsStyles.hint, { color: theme.textMuted, marginTop: 24 }]}>
            {t('settings.clear_hint')}
          </Text>
          <Pressable
            onPress={handleClearLogs}
            disabled={clearing}
            style={[settingsStyles.dangerBtn, settingsStyles.dangerBtnFilled]}
            accessibilityLabel={t('settings.clear_logs')}
          >
            <Text style={settingsStyles.dangerTextFilled}>
              {clearing
                ? t('settings.clearing')
                : cleared
                  ? `${t('settings.clear_logs')} ✓`
                  : t('settings.clear_logs')}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// TabBar
// Three-tab bottom bar: Home / History / Settings.
// ---------------------------------------------------------------------------
function TabBar({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (tab: Tab) => void }) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'home', icon: '⌂', label: t('nav.home') },
    { key: 'history', icon: '◷', label: t('nav.history') },
    { key: 'settings', icon: '⚙', label: t('nav.settings') },
  ];

  return (
    <View style={[tabStyles.bar, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
      {tabs.map(tab => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={tabStyles.item}
            onPress={() => onTabChange(tab.key)}
            accessibilityLabel={`${tab.label} tab`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[tabStyles.icon, { color: active ? theme.text : theme.textMuted }]}>
              {tab.icon}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// useLayout — responsive breakpoints derived from screen width.
// Updates automatically on orientation change.
//   isTablet  ≥ 768pt  — iPad portrait+    (side-by-side baby cards)
//   isLarge   ≥ 1024pt — iPad landscape+   (side nav rail replaces bottom bar)
// ---------------------------------------------------------------------------
function useLayout() {
  const { width } = useWindowDimensions();
  return {
    isTablet: width >= 768,
    isLarge: width >= 1024,
    width,
  };
}

// ---------------------------------------------------------------------------
// SideNav — vertical nav rail for iPad landscape (mirrors the web sidebar).
// Shown instead of the bottom TabBar when isLarge is true.
// ---------------------------------------------------------------------------
function SideNav({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (tab: Tab) => void }) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'home', icon: '⌂', label: t('nav.home') },
    { key: 'history', icon: '◷', label: t('nav.history') },
    { key: 'settings', icon: '⚙', label: t('nav.settings') },
  ];
  return (
    <View
      style={[sideNavStyles.rail, { backgroundColor: theme.bg, borderRightColor: theme.border }]}
    >
      {tabs.map(tab => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={sideNavStyles.item}
            onPress={() => onTabChange(tab.key)}
            accessibilityLabel={`${tab.label} tab`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[sideNavStyles.icon, { color: active ? theme.text : theme.textMuted }]}>
              {tab.icon}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// AppContent — root coordinator (inside ThemeProvider)
// Owns: auth state, preferences, event store, tab routing, baby list,
//       analytics drill-down, and mock-data toggle.
// Passes slices of this state down to each screen component.
// ---------------------------------------------------------------------------
function AppContent() {
  const {
    loading: authLoading,
    isAuthenticated,
    isAdmin,
    inviteCode,
    login,
    register,
    join,
    logout,
    displayName,
    updateDisplayName,
    emailVerified,
    refreshEmailVerified,
    resendVerification,
  } = useAuth(asyncStorage);
  const [verifyResendSent, setVerifyResendSent] = useState(false);
  const [verifyResendLoading, setVerifyResendLoading] = useState(false);

  // When the app comes to the foreground while emailVerified is still false,
  // re-fetch from the API — handles the case where the user verified in a browser
  // and then returned to the app via deep link or app switcher.
  // Also checks immediately on mount to handle cold-launch via twintracker:// deep link
  // (AppState starts as 'active' and never fires a 'change' event in that case).
  useEffect(() => {
    if (emailVerified !== false) {
      return;
    }
    refreshEmailVerified();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshEmailVerified();
      }
    });
    return () => sub.remove();
  }, [emailVerified, refreshEmailVerified]);

  async function handleResendVerification() {
    setVerifyResendLoading(true);
    try {
      await resendVerification();
      setVerifyResendSent(true);
      setTimeout(() => setVerifyResendSent(false), 4000);
    } catch {
      // silent
    } finally {
      setVerifyResendLoading(false);
    }
  }
  const {
    prefs,
    setNapCheckMinutes,
    setTwinSync,
    setBedtimeHour,
    setWakeHour,
    setSleepTraining,
    setDiaperNotifications,
    setBottleNotifications,
  } = usePreferences(asyncStorage);

  const { t } = useTranslation();

  // Sync bedtime/wake settings into the theme engine so night mode transitions correctly
  useEffect(() => {
    setNightBoundaries(prefs.wakeHour, prefs.bedtimeHour);
  }, [prefs.wakeHour, prefs.bedtimeHour]);

  const {
    latest,
    events,
    loading: eventsLoading,
    logEvent,
    closeNap,
    deleteEvent,
    editEvent,
    clearAllEvents,
    poll,
  } = useEventStore(!authLoading && isAuthenticated);
  const theme = useThemeContext();
  const { isTablet, isLarge } = useLayout();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [babies, setBabies] = useState<Baby[]>([]);
  const [babiesLoading, setBabiesLoading] = useState(true);

  // Flip to night mode while any baby has an active sleep (night) event.
  // Naps do not trigger night mode.
  useEffect(() => {
    const anySleepActive = babies.some(baby => getActiveEvent(baby.id, 'sleep', latest) != null);
    setSleepActive(anySleepActive);
  }, [babies, latest]);

  // Refs so the notification response handler always sees current state without re-subscribing
  const babiesRef = useRef<Baby[]>([]);
  useEffect(() => {
    babiesRef.current = babies;
  }, [babies]);
  const eventsRef = useRef<TrackerEvent[]>([]);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  const twinSyncRef = useRef<boolean>(false);
  useEffect(() => {
    twinSyncRef.current = prefs.twinSync;
  }, [prefs.twinSync]);
  const eventsLoadingRef = useRef<boolean>(true);
  useEffect(() => {
    eventsLoadingRef.current = eventsLoading;
  }, [eventsLoading]);
  // Stores notification data received before babies/events finish loading (cold launch).
  // Processed by the effect below once the store is ready.
  const pendingAlarmNotifRef = useRef<{ alarmId: string; babyId: string } | null>(null);
  const [analyticsBabyId, setAnalyticsBabyId] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [mockProgress, setMockProgress] = useState<{ done: number; total: number } | null>(null);

  // Load persisted mock mode on mount
  useEffect(() => {
    Promise.resolve(asyncStorage.getItem('tt_mock_mode'))
      .then((v: string | null) => {
        if (v === 'true') {
          setMockMode(true);
        }
      })
      .catch(console.error);
  }, []);

  // Toggles between real event data and generated mock data for demo/testing.
  // On enable: snapshots real events to AsyncStorage, clears DB, writes mock events.
  // On disable: clears mock events, restores the snapshot.
  async function handleToggleMockData() {
    setGenerating(true);
    setMockProgress(null);
    try {
      if (!mockMode) {
        const real: TrackerEvent[] = await api.events.list();
        const snapshot: LogEventPayload[] = real.map(e => ({
          babyId: e.babyId,
          type: e.type,
          startedAt: e.startedAt,
          endedAt: e.endedAt ?? undefined,
          value: e.value ?? undefined,
          unit: e.unit ?? undefined,
          notes: e.notes ?? undefined,
        }));
        await asyncStorage.setItem('tt_real_events_snapshot', JSON.stringify(snapshot));
        await clearAllEvents();
        const payloads = generateMockEvents(babies);
        setMockProgress({ done: 0, total: payloads.length });
        for (let i = 0; i < payloads.length; i++) {
          await api.events.create(payloads[i]);
          setMockProgress({ done: i + 1, total: payloads.length });
        }
        await asyncStorage.setItem('tt_mock_mode', 'true');
        setMockMode(true);
      } else {
        await clearAllEvents();
        const raw = await Promise.resolve(asyncStorage.getItem('tt_real_events_snapshot'));
        if (raw) {
          const snapshot: LogEventPayload[] = JSON.parse(raw);
          setMockProgress({ done: 0, total: snapshot.length });
          for (let i = 0; i < snapshot.length; i++) {
            await api.events.create(snapshot[i]);
            setMockProgress({ done: i + 1, total: snapshot.length });
          }
          await asyncStorage.removeItem('tt_real_events_snapshot');
        }
        await asyncStorage.setItem('tt_mock_mode', 'false');
        setMockMode(false);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to toggle mock data');
    } finally {
      setGenerating(false);
      setMockProgress(null);
    }
  }

  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      return;
    }
    api.babies
      .list()
      .then(setBabies)
      .catch(console.error)
      .finally(() => setBabiesLoading(false));
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    // Shared handler for when an alarm fires while the app is open (foregrounded)
    // or when the user taps an alarm notification from the background.
    function handleAlarmFired(alarmId: string, babyId: string | undefined) {
      api.alarms.update(alarmId, { dismissedAt: new Date().toISOString() }).catch(console.error);
      // Cold launch: babies/events haven't loaded yet — store and process once ready.
      if (!babyId || babiesRef.current.length === 0 || eventsLoadingRef.current) {
        if (babyId) {
          pendingAlarmNotifRef.current = { alarmId, babyId };
        }
        return;
      }
      const currentBabies = babiesRef.current;
      const currentEvents = eventsRef.current;
      const showStillSleepingAlert = (name: string, napId: string, onDone?: () => void) => {
        Alert.alert('Still sleeping?', `Is ${name} still asleep?`, [
          { text: 'Yes', style: 'default', onPress: onDone },
          {
            text: 'No — cancel nap',
            style: 'destructive',
            onPress: () => {
              deleteEvent(napId).catch(console.error);
              onDone?.();
            },
          },
        ]);
      };
      const napBaby = currentBabies.find(b => b.id === babyId);
      if (!napBaby) {
        return;
      }
      const activeNap = currentEvents.find(
        e => e.babyId === napBaby.id && (e.type === 'nap' || e.type === 'sleep') && !e.endedAt,
      );
      if (!activeNap) {
        return;
      }
      const otherBaby = twinSyncRef.current ? currentBabies.find(b => b.id !== napBaby.id) : null;
      const otherActiveNap = otherBaby
        ? currentEvents.find(
            e =>
              e.babyId === otherBaby.id && (e.type === 'nap' || e.type === 'sleep') && !e.endedAt,
          )
        : null;
      showStillSleepingAlert(
        napBaby.name,
        activeNap.id,
        otherBaby && otherActiveNap
          ? () => showStillSleepingAlert(otherBaby.name, otherActiveNap.id)
          : undefined,
      );
    }

    // App is foregrounded when alarm fires — banner is suppressed by setNotificationHandler above;
    // show the in-app Alert directly instead.
    const recvSub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data as {
        alarmId?: string;
        babyId?: string;
        isCustomTimer?: boolean;
      };
      if (!data.alarmId || data.isCustomTimer) {
        return;
      }
      handleAlarmFired(data.alarmId, data.babyId);
    });

    // App is backgrounded when alarm fires — user taps the notification to open the app;
    // show the in-app Alert after the app comes to foreground.
    const tapSub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as {
        alarmId?: string;
        babyId?: string;
        isCustomTimer?: boolean;
      };
      if (!data.alarmId || data.isCustomTimer) {
        return;
      }
      handleAlarmFired(data.alarmId, data.babyId);
    });

    return () => {
      recvSub.remove();
      tapSub.remove();
    };
  }, [deleteEvent]);

  // Process any alarm notification that arrived before babies/events finished loading
  // (cold launch — app was killed when the alarm fired and the user tapped the notification).
  useEffect(() => {
    const pending = pendingAlarmNotifRef.current;
    if (!pending || babies.length === 0 || eventsLoading) {
      return;
    }
    pendingAlarmNotifRef.current = null;
    const napBaby = babies.find(b => b.id === pending.babyId);
    if (!napBaby) {
      return;
    }
    const activeNap = events.find(
      e => e.babyId === napBaby.id && (e.type === 'nap' || e.type === 'sleep') && !e.endedAt,
    );
    if (!activeNap) {
      return;
    }
    const showAlert = (name: string, napId: string, onDone?: () => void) => {
      Alert.alert('Still sleeping?', `Is ${name} still asleep?`, [
        { text: 'Yes', style: 'default', onPress: onDone },
        {
          text: 'No — cancel nap',
          style: 'destructive',
          onPress: () => {
            deleteEvent(napId).catch(console.error);
            onDone?.();
          },
        },
      ]);
    };
    const otherBaby = prefs.twinSync ? babies.find(b => b.id !== napBaby.id) : null;
    const otherNap = otherBaby
      ? events.find(
          e => e.babyId === otherBaby.id && (e.type === 'nap' || e.type === 'sleep') && !e.endedAt,
        )
      : null;
    showAlert(
      napBaby.name,
      activeNap.id,
      otherBaby && otherNap ? () => showAlert(otherBaby.name, otherNap.id) : undefined,
    );
  }, [babies, events, eventsLoading, prefs.twinSync, deleteEvent]);

  if (authLoading) {
    return (
      <SafeAreaView style={[appStyles.container, { backgroundColor: theme.bg }]}>
        <StatusBar style={theme.mode === 'night' ? 'light' : 'dark'} />
        <ActivityIndicator color={theme.text} size="large" />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen login={login} register={register} join={join} />;
  }

  const analyticsBaby = analyticsBabyId
    ? (babies.find(b => b.id === analyticsBabyId) ?? null)
    : null;

  if (analyticsBaby) {
    return (
      <SafeAreaView style={[appStyles.container, { backgroundColor: theme.bg }]}>
        <StatusBar style={theme.mode === 'night' ? 'light' : 'dark'} />
        <AnalyticsScreen
          baby={analyticsBaby}
          events={events}
          resetHour={prefs.wakeHour}
          sleepTraining={prefs.sleepTraining}
          onBack={() => setAnalyticsBabyId(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[appStyles.container, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'night' ? 'light' : 'dark'} />
      {emailVerified === false ? (
        /* ── Full-screen email gate: block app until verified ── */
        <View style={[homeStyles.centered, { flex: 1, backgroundColor: theme.bg }]}>
          <Text style={[homeStyles.onboardTitle, { color: theme.text, textAlign: 'center' }]}>
            {t('auth.check_email_heading')}
          </Text>
          <Text
            style={[
              homeStyles.onboardSub,
              { color: theme.textMuted, textAlign: 'center', paddingHorizontal: 32 },
            ]}
          >
            {t('auth.verify_banner')}
          </Text>
          <Pressable
            onPress={handleResendVerification}
            disabled={verifyResendLoading || verifyResendSent}
            style={({ pressed }) => [
              homeStyles.submitBtn,
              {
                backgroundColor: theme.accent,
                opacity: pressed ? 0.8 : 1,
                marginTop: 8,
                paddingHorizontal: 32,
              },
            ]}
          >
            <Text style={[homeStyles.submitText, { color: theme.bg }]}>
              {verifyResendSent
                ? t('auth.check_email_resent')
                : verifyResendLoading
                  ? '…'
                  : t('auth.check_email_resend')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* isLarge: side-by-side SideNav + content; otherwise stacked with bottom TabBar */}
          <View style={{ flex: 1, flexDirection: isLarge ? 'row' : 'column' }}>
            {isLarge && <SideNav activeTab={activeTab} onTabChange={setActiveTab} />}
            <View style={{ flex: 1 }}>
              {activeTab === 'home' ? (
                <HomeScreen
                  babies={babies}
                  setBabies={setBabies}
                  babiesLoading={babiesLoading}
                  resetHour={prefs.wakeHour}
                  napCheckMinutes={prefs.napCheckMinutes}
                  twinSync={prefs.twinSync}
                  bedtimeHour={prefs.bedtimeHour}
                  setBedtimeHour={setBedtimeHour}
                  wakeHour={prefs.wakeHour}
                  setWakeHour={setWakeHour}
                  sleepTraining={prefs.sleepTraining}
                  setSleepTraining={setSleepTraining}
                  diaperNotifications={prefs.diaperNotifications}
                  setDiaperNotifications={setDiaperNotifications}
                  bottleNotifications={prefs.bottleNotifications}
                  setBottleNotifications={setBottleNotifications}
                  latest={latest}
                  events={events}
                  logEvent={logEvent}
                  closeNap={closeNap}
                  onOpenAnalytics={setAnalyticsBabyId}
                  onRefresh={poll}
                  isTablet={isTablet}
                />
              ) : null}
              {activeTab === 'history' && (
                <HistoryScreen
                  babies={babies}
                  resetHour={prefs.wakeHour}
                  events={events}
                  loading={eventsLoading}
                  deleteEvent={deleteEvent}
                  editEvent={editEvent}
                  logEvent={logEvent}
                  onRefresh={poll}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsScreen
                  napCheckMinutes={prefs.napCheckMinutes}
                  setNapCheckMinutes={setNapCheckMinutes}
                  twinSync={prefs.twinSync}
                  setTwinSync={setTwinSync}
                  bedtimeHour={prefs.bedtimeHour}
                  setBedtimeHour={setBedtimeHour}
                  wakeHour={prefs.wakeHour}
                  setWakeHour={setWakeHour}
                  sleepTraining={prefs.sleepTraining}
                  setSleepTraining={setSleepTraining}
                  diaperNotifications={prefs.diaperNotifications}
                  setDiaperNotifications={setDiaperNotifications}
                  bottleNotifications={prefs.bottleNotifications}
                  setBottleNotifications={setBottleNotifications}
                  babiesCount={babies.length}
                  isAdmin={isAdmin}
                  clearAllEvents={clearAllEvents}
                  onLogout={() => {
                    logout().catch(console.error);
                    setActiveTab('home');
                  }}
                  inviteCode={inviteCode}
                  mockMode={mockMode}
                  generating={generating}
                  mockProgress={mockProgress}
                  onToggleMockData={handleToggleMockData}
                  displayName={displayName}
                  updateDisplayName={updateDisplayName}
                />
              )}
            </View>
            {!isLarge && <TabBar activeTab={activeTab} onTabChange={setActiveTab} />}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

import { registerRootComponent } from 'expo';

// ---------------------------------------------------------------------------
// App — top-level export
// Wraps everything in ThemeProvider (which reads bedtime/wake from module-level
// state updated via setNightBoundaries) and loads custom fonts before rendering.
// ---------------------------------------------------------------------------
function App() {
  const [fontsLoaded] = useFonts({ Nunito: Nunito_700Bold });
  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

registerRootComponent(App);

// ---------------------------------------------------------------------------
// Styles (structural only — colors applied inline from theme)
// ---------------------------------------------------------------------------
const loginStyles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 36, fontWeight: '700', marginBottom: 8 },
  tagline: { fontSize: 13, marginBottom: 40, letterSpacing: 0.5 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  inviteInput: { letterSpacing: 4 },
  error: { fontSize: 13, marginBottom: 8, textAlign: 'center' },
  submitBtn: {
    width: '100%',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  submitText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  linkBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  linkText: { fontSize: 13 },
});

const homeStyles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onboarding: { marginTop: 48 },
  onboardTitle: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  onboardSub: { fontSize: 13, marginBottom: 32 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 4,
  },
  entryLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  dobLabel: { fontSize: 13, marginBottom: 4, marginTop: -4 },
  addAnotherText: { fontSize: 14, fontWeight: '600', marginBottom: 16 },
  error: { fontSize: 13, marginBottom: 8 },
  submitBtn: { borderRadius: 10, height: 52, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 15, fontWeight: '700' },
  babyGrid: { flex: 1, padding: 16, paddingBottom: 8, gap: 12 },
  babyGridTablet: { flexDirection: 'row', padding: 24, gap: 20 },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  syncBannerText: { flex: 1, fontSize: 14 },
  syncBannerActions: { flexDirection: 'row', gap: 8 },
  syncBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: { fontSize: 13, fontWeight: '600' },
});

const tabStyles = StyleSheet.create({
  bar: { height: 56, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  icon: { fontSize: 22 },
});

const sideNavStyles = StyleSheet.create({
  rail: {
    width: 60,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 32,
    alignItems: 'center',
    gap: 4,
  },
  item: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  icon: { fontSize: 22 },
});

const appStyles = StyleSheet.create({
  container: { flex: 1 },
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.3)',
    backgroundColor: 'rgba(128,128,128,0.08)',
    gap: 8,
  },
  verifyBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'DM Mono',
    color: 'rgba(128,128,128,0.9)',
    lineHeight: 16,
  },
  verifyBannerBtn: {
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.4)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  verifyBannerBtnText: {
    fontSize: 12,
    fontFamily: 'DM Mono',
    color: 'rgba(128,128,128,0.9)',
  },
});

const quickStyles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    paddingBottom: 24,
  },
  label: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 20,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: 14 },
  cancelBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13 },
});

const settingsStyles = StyleSheet.create({
  sectionTitle: { fontSize: 11, letterSpacing: 1, marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 16, lineHeight: 18 },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    width: '22%',
    height: 52,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: 13 },
  adminSection: { marginTop: 32 },
  dangerBtn: {
    height: 52,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  dangerBtnFilled: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  dangerText: { fontSize: 15, fontWeight: '700' },
  dangerTextFilled: { fontSize: 15, fontWeight: '700', color: '#fff' },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 12,
    paddingHorizontal: 16,
    height: 52,
  },
  codeText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
  },
  shareBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: { fontSize: 14, fontWeight: '600' },
});

const analyticsStyles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  backBtn: { minHeight: 44, justifyContent: 'center', marginBottom: 8 },
  backText: { fontSize: 15 },
  heading: { fontSize: 26, fontWeight: '700', marginBottom: 4 },
  subheading: { fontSize: 13, marginBottom: 16 },
  periodTabs: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  periodTab: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTabText: { fontSize: 12 },
  block: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, marginBottom: 8 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  blockTitle: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700', textTransform: 'uppercase' },
  stat: { fontSize: 17, fontWeight: '600', marginBottom: 6 },
  detail: { fontSize: 14, marginBottom: 4, lineHeight: 20 },
  empty: { fontSize: 14, fontStyle: 'italic' },
  milestone: { fontSize: 14, marginBottom: 6, lineHeight: 20 },
  benchmark: { fontSize: 11, marginBottom: 2 },
  dataNotice: {
    fontSize: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
});
