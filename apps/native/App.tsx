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
import { useEffect, useMemo, useRef, useState } from 'react';
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
  Animated,
  AppState,
  InteractionManager,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';
import { DateTimePickerSheet } from './DateTimePickerSheet';
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
  computeTrendData,
  detectTransitionSignals,
  computeLearnedStats,
  computeWeightPercentile,
  computeHeightPercentile,
  formatPercentile,
  ageInMonths,
  ThemeProvider,
  useThemeContext,
  i18n,
  initI18n,
  useTranslation,
  NAP_CHECK_MINUTES,
  BEDTIME_HOURS,
  WAKE_HOURS,
  hourLabel,
  findUnsyncedBaby,
  getActiveEvent,
  findSyncedNapBaby,
  MIN_DAYS_FOR_MONTH_VIEW,
  EVENT_TYPES,
  applyHistoryFilters,
  emptyFilters,
  isFilterActive,
  getAgeWeeks,
  authorColor,
} from '@tt/core';
import type {
  Baby,
  BabyAnalytics,
  EventType,
  HistoryFilters,
  LogEventPayload,
  SyncableEventType,
  TrackerEvent,
  TrendPoint,
} from '@tt/core';
import * as Localization from 'expo-localization';

// Initialise i18n once using device locale.
initI18n(Localization.getLocales()[0]?.languageTag ?? 'en');
import {
  BabyCard,
  BabyProfileSheet,
  LogSheet,
  HistoryFeed,
  BottleIcon,
  MoonIcon,
  HotelIcon,
  DiaperIcon,
  FoodIcon,
  MilestoneIcon,
  SettingsIcon,
  FilterIcon,
  PersonIcon,
} from '@tt/ui';
import { asyncStorage } from './storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

configure(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000');

// Configure Google Sign-In once at module load.
// webClientId is the OAuth 2.0 Web client ID from Google Cloud Console.
// iosClientId is optional — falls back to webClientId for token verification.
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
});

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
  loginWithGoogle,
}: {
  login: (email: string, password: string) => Promise<unknown>;
  register: (email: string, password: string, name?: string) => Promise<unknown>;
  join: (email: string, password: string, code: string, name?: string) => Promise<unknown>;
  loginWithGoogle: (idToken: string, inviteCode?: string) => Promise<unknown>;
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

  const handleGoogleSignIn = async () => {
    setError('');
    setSubmitting(true);
    try {
      await GoogleSignin.hasPlayServices();
      const { data } = await GoogleSignin.signIn();
      if (!data?.idToken) {
        throw new Error('Google sign-in did not return an ID token');
      }
      await loginWithGoogle(data.idToken, inviteCode || undefined);
    } catch (e: unknown) {
      // User cancelled — no error shown
      const code = (e as { code?: string }).code;
      if (code !== 'SIGN_IN_CANCELLED' && code !== 'statusCodes.SIGN_IN_CANCELLED') {
        setError(e instanceof Error ? e.message : 'Google sign-in failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

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

        {/* ── Google Sign-In ──────────────────────────────────────── */}
        <View style={loginStyles.dividerRow}>
          <View style={[loginStyles.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={[loginStyles.dividerText, { color: theme.textMuted }]}>
            {t('auth.or_divider')}
          </Text>
          <View style={[loginStyles.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <Pressable
          style={({ pressed }) => [
            loginStyles.googleBtn,
            {
              borderColor: theme.border,
              backgroundColor: theme.surface,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          onPress={handleGoogleSignIn}
          disabled={submitting}
          accessibilityLabel={t('auth.sign_in_google')}
        >
          <Text style={[loginStyles.googleBtnText, { color: theme.text }]}>
            {t('auth.sign_in_google')}
          </Text>
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
// ---------------------------------------------------------------------------
// SkeletonHomeScreen — ghost cards shown while babies list is loading.
// Mirrors the real babyGrid layout so the transition is seamless.
// ---------------------------------------------------------------------------
/** Number of placeholder cards to render during load. */
const SKELETON_CARD_COUNT = 2;

function SkeletonHomeScreen({ isTablet = false }: { isTablet?: boolean }) {
  const theme = useThemeContext();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
          // Don't block InteractionManager — the loop never ends so without this
          // runAfterInteractions would never fire while a skeleton is mounted.
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const cards = Array.from({ length: SKELETON_CARD_COUNT });

  return (
    <View
      style={[
        isTablet ? homeStyles.babyGridTablet : homeStyles.babyGrid,
        { backgroundColor: theme.bg },
      ]}
    >
      {cards.map((_, i) => (
        // Card stays at full opacity so the border is always visible — matches web behaviour
        // where the card outline is static and only the inner shapes pulse.
        <View
          key={i}
          style={[
            skeletonStyles.card,
            { backgroundColor: theme.surface, borderColor: theme.border, flex: 1 },
          ]}
        >
          {/* Inner shapes pulse together */}
          <Animated.View style={[skeletonStyles.shapes, { opacity: pulse }]}>
            {/* Baby name line — matches web: 45% wide, 18px tall */}
            <View
              style={[
                skeletonStyles.line,
                { width: '45%', height: 18, backgroundColor: theme.border },
              ]}
            />
            {/* Detail line — matches web: 30% wide, 13px tall */}
            <View
              style={[
                skeletonStyles.line,
                { width: '30%', height: 13, backgroundColor: theme.border },
              ]}
            />
            {/* 4 action buttons — matches web button count */}
            <View style={skeletonStyles.actions}>
              {[0, 1, 2, 3].map(j => (
                <View key={j} style={[skeletonStyles.btn, { backgroundColor: theme.border }]} />
              ))}
            </View>
          </Animated.View>
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  shapes: {
    gap: 12,
  },
  line: {
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 999,
  },
});

// ---------------------------------------------------------------------------
// HomeScreen
// The primary screen parents use at 3am. Shows baby cards for each child in
function formatBabyNames(bs: { name: string }[]): string {
  if (bs.length === 0) {
    return 'your baby';
  }
  if (bs.length === 1) {
    return bs[0].name;
  }
  if (bs.length === 2) {
    return `${bs[0].name} and ${bs[1].name}`;
  }
  return (
    bs
      .slice(0, -1)
      .map(b => b.name)
      .join(', ') +
    ', and ' +
    bs[bs.length - 1].name
  );
}

/** Formats a YYYY-MM-DD string for display (e.g. "Jan 1, 2024"). */
/** Parse a numeric string; return undefined when blank or non-positive. */
function parseNumber(s: string): number | undefined {
  const v = parseFloat(s.replace(',', '.'));
  return isNaN(v) || v <= 0 ? undefined : v;
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// the household. Also owns the two-step onboarding flow when babies.length===0:
//   Step 1 — enter baby name(s)
//   Step 2 — schedule (bedtime + wake) then preferences (sleep training, reminders)
// ---------------------------------------------------------------------------
function HomeScreen({
  babies,
  setBabies,
  babiesLoading,
  resetHour,
  napCheckMinutes,
  twinSync,
  setTwinSync,
  bedtimeHour,
  setBedtimeHour,
  wakeHour,
  setWakeHour,
  sleepTraining,
  setSleepTraining,
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
  setTwinSync: (v: boolean) => void;
  bedtimeHour: number;
  setBedtimeHour: (h: number) => void;
  wakeHour: number;
  setWakeHour: (h: number) => void;
  sleepTraining: boolean;
  setSleepTraining: (v: boolean) => void;
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
  // maps babyId → "wake to feed" notification for newborns sleeping > 4h (< 4 weeks old)
  const newbornFeedNotifIds = useRef<Map<string, string>>(new Map());
  // tracks last-seen latest snapshot to detect new events from polling (cross-device logs)
  const prevLatestRef = useRef<ReturnType<typeof useEventStore>['latest']>({});

  /**
   * Cancel all pending reminder notifications for a given baby and type.
   * Clears the in-memory ref, then scans the OS queue by data payload so
   * stale notifications are cancelled even when events arrive via polling
   * from web or another device (where handleSheetSubmit never ran).
   */
  async function cancelNewbornFeedNotif(babyId: string): Promise<void> {
    const cachedId = newbornFeedNotifIds.current.get(babyId);
    if (cachedId) {
      await Notifications.cancelScheduledNotificationAsync(cachedId).catch(console.error);
      newbornFeedNotifIds.current.delete(babyId);
    }
    // Scan OS queue — catches notifications scheduled in a previous session or by another device.
    const pending = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    for (const n of pending) {
      const data = n.content.data as Record<string, unknown>;
      if (data?.type === 'newborn-feed' && data?.babyId === babyId) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(console.error);
      }
    }
  }

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

  // Schedule/cancel newborn feed wake alert (AAP: wake to feed if sleeping > 4h, < 4 weeks old).
  useEffect(() => {
    const prev = prevLatestRef.current;
    prevLatestRef.current = latest;

    babies.forEach(baby => {
      const currNap = latest[`${baby.id}:nap`];
      const currSleep = latest[`${baby.id}:sleep`];
      const prevNap = prev[`${baby.id}:nap`];
      const prevSleep = prev[`${baby.id}:sleep`];
      const napJustStarted =
        currNap && !currNap.endedAt && currNap.startedAt !== prevNap?.startedAt;
      const sleepJustStarted =
        currSleep && !currSleep.endedAt && currSleep.startedAt !== prevSleep?.startedAt;

      // ── Newborn feed wake alert (< 4 weeks): schedule when sleep starts ────
      if (napJustStarted || sleepJustStarted) {
        if (getAgeWeeks(baby.birthDate) < 4) {
          const activeEvt = napJustStarted ? currNap! : currSleep!;
          const fireAt = new Date(activeEvt.startedAt).getTime() + 4 * 60 * 60_000;
          if (fireAt > Date.now()) {
            (async () => {
              await cancelNewbornFeedNotif(baby.id);
              const notifId = await scheduleAlarmAt(
                new Date(fireAt).toISOString(),
                'TwinTracker',
                t('notifications.newborn_feed_body', { name: baby.name }),
                { type: 'newborn-feed', babyId: baby.id },
              );
              if (notifId) {
                newbornFeedNotifIds.current.set(baby.id, notifId);
              }
            })().catch(console.error);
          }
        }
      }

      // ── Cancel newborn feed alert when sleep ends ───────────────────────────
      const napJustEnded = currNap?.endedAt && currNap.endedAt !== prevNap?.endedAt;
      const sleepJustEnded = currSleep?.endedAt && currSleep.endedAt !== prevSleep?.endedAt;
      if (napJustEnded || sleepJustEnded) {
        cancelNewbornFeedNotif(baby.id).catch(console.error);
      }
    });
  }, [latest, babies, t]);

  // Creates a server-side alarm and schedules a local notification for it.
  async function handleSetAlarm(baby: Baby, durationMs: number, isCustomTimer: boolean) {
    const minutes = Math.round(durationMs / 60_000);
    const label = isCustomTimer
      ? t('notifications.alarm_timer', { minutes })
      : t('notifications.alarm_nap_check', { minutes, name: baby.name });
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

  const [entries, setEntries] = useState<
    { name: string; birthDate: string; weightKg: string; heightCm: string }[]
  >([{ name: '', birthDate: '', weightKg: '', heightCm: '' }]);
  // DateTimePickerSheet state — covers DOB pickers and LogSheet date/time fields.
  // DateTimePickerSheet for DOB — outside any Modal so stacking is not an issue.
  const [dtPicker, setDtPicker] = useState<{
    title: string;
    value: Date;
    mode: 'date' | 'time' | 'datetime';
    maximumDate?: Date;
    onConfirm: (d: Date) => void;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [showPrefsStep, setShowPrefsStep] = useState(false);
  const [prefsSubStep, setPrefsSubStep] = useState<1 | 2>(1);
  // Single atomic state — eliminates the split-update race where sheetBaby/sheetType turned
  // visible=true one render before sheetSuggestedOz arrived, making the init useEffect in
  const [profileBaby, setProfileBaby] = useState<Baby | null>(null);

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
      setCreateError(t('onboarding.error_name_required'));
      return;
    }
    if (entries.some(en => en.name.trim() && !en.birthDate.trim())) {
      setCreateError(t('onboarding.error_dob_required'));
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    if (entries.some(en => en.name.trim() && en.birthDate > today)) {
      setCreateError(t('onboarding.error_dob_future'));
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
              birthDate: en.birthDate,
              weightKg: parseNumber(en.weightKg),
              heightCm: parseNumber(en.heightCm),
            }),
          );
        }
      }
      setBabies(created);
      setShowPrefsStep(true);
      setPrefsSubStep(1);
      setSleepTraining(true);
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
    return <SkeletonHomeScreen isTablet={isTablet} />;
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
                <Pressable
                  style={[inputStyle, { justifyContent: 'center' }]}
                  onPress={() =>
                    setDtPicker({
                      title: t('onboarding.dob_label'),
                      value: en.birthDate
                        ? new Date(en.birthDate + 'T12:00:00')
                        : new Date(2023, 0, 1),
                      mode: 'date',
                      maximumDate: new Date(),
                      onConfirm: (d: Date) => {
                        const iso = d.toISOString().split('T')[0];
                        setEntries(prev =>
                          prev.map((e, j) => (j === i ? { ...e, birthDate: iso } : e)),
                        );
                        setDtPicker(null);
                      },
                    })
                  }
                  accessibilityLabel={t('onboarding.dob_label')}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: 'DM Mono',
                      color: en.birthDate ? theme.text : theme.textMuted,
                    }}
                  >
                    {en.birthDate ? formatDisplayDate(en.birthDate) : t('onboarding.dob_label')}
                  </Text>
                </Pressable>
                {/* Weight + height fields hidden until metric/imperial toggle is implemented */}
              </View>
            ))}
            <Pressable
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, marginBottom: 16 }]}
              onPress={() =>
                setEntries(prev => [
                  ...prev,
                  { name: '', birthDate: '', weightKg: '', heightCm: '' },
                ])
              }
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
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1, marginTop: 24 },
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
        /* Onboarding step 2 — schedule + preferences (two sub-steps) */
        <ScrollView contentContainerStyle={homeStyles.scroll}>
          <View style={homeStyles.onboarding}>
            <Text style={[homeStyles.onboardTitle, { color: theme.text }]}>
              {t('onboarding.prefs_heading')}
            </Text>
            <Text style={[homeStyles.onboardSub, { color: theme.textDim }]}>
              {prefsSubStep === 1 &&
              !(
                babies.length > 0 &&
                babies.every(b => b.birthDate != null && getAgeWeeks(b.birthDate) < 15)
              )
                ? t('onboarding.prefs_subtitle')
                : t('onboarding.prefs_step2_sub')}
            </Text>

            {prefsSubStep === 1 &&
            !(
              babies.length > 0 &&
              babies.every(b => b.birthDate != null && getAgeWeeks(b.birthDate) < 15)
            ) ? (
              <>
                {/* Bedtime question */}
                <View style={settingsStyles.adminSection}>
                  <Text style={[homeStyles.onboardQuestion, { color: theme.text }]}>
                    {t('onboarding.bedtime_question', { names: formatBabyNames(babies) })}
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
                            style={[
                              settingsStyles.pillText,
                              { color: active ? theme.bg : theme.text },
                            ]}
                          >
                            {hourLabel(h)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Wake question */}
                <View style={settingsStyles.adminSection}>
                  <Text style={[homeStyles.onboardQuestion, { color: theme.text }]}>
                    {t('onboarding.wake_question', { names: formatBabyNames(babies) })}
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
                            style={[
                              settingsStyles.pillText,
                              { color: active ? theme.bg : theme.text },
                            ]}
                          >
                            {hourLabel(h)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    homeStyles.submitBtn,
                    { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1, marginTop: 8 },
                  ]}
                  onPress={() => setPrefsSubStep(2)}
                  accessibilityLabel={t('onboarding.step_next')}
                >
                  <Text style={[homeStyles.submitText, { color: theme.bg }]}>
                    {t('onboarding.step_next')}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* Sleep training */}
                <Pressable
                  onPress={() => setSleepTraining(!sleepTraining)}
                  style={[
                    switchRowStyles.row,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: sleepTraining }}
                >
                  <View style={switchRowStyles.content}>
                    <Text style={[switchRowStyles.label, { color: theme.text }]}>
                      {t('settings.sleep_training_title')}
                    </Text>
                    <Text style={[switchRowStyles.hint, { color: theme.textMuted }]}>
                      {t('onboarding.sleep_training_onboard_desc')}
                    </Text>
                  </View>
                  <View
                    style={[
                      switchRowStyles.track,
                      { backgroundColor: sleepTraining ? theme.accent : theme.border },
                    ]}
                  >
                    <View
                      style={[
                        switchRowStyles.thumb,
                        { backgroundColor: theme.bg },
                        sleepTraining && switchRowStyles.thumbOn,
                      ]}
                    />
                  </View>
                </Pressable>

                {/* Twin sync — only for ≥2 babies */}
                {babies.length >= 2 && (
                  <Pressable
                    onPress={() => setTwinSync(!twinSync)}
                    style={[
                      switchRowStyles.row,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: twinSync }}
                  >
                    <View style={switchRowStyles.content}>
                      <Text style={[switchRowStyles.label, { color: theme.text }]}>
                        {t('settings.twin_sync_title')}
                      </Text>
                      <Text style={[switchRowStyles.hint, { color: theme.textMuted }]}>
                        {t('settings.twin_sync_hint')}
                      </Text>
                    </View>
                    <View
                      style={[
                        switchRowStyles.track,
                        { backgroundColor: twinSync ? theme.accent : theme.border },
                      ]}
                    >
                      <View
                        style={[
                          switchRowStyles.thumb,
                          { backgroundColor: theme.bg },
                          twinSync && switchRowStyles.thumbOn,
                        ]}
                      />
                    </View>
                  </Pressable>
                )}

                <Pressable
                  style={({ pressed }) => [
                    homeStyles.submitBtn,
                    { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1, marginTop: 24 },
                  ]}
                  onPress={() => setShowPrefsStep(false)}
                  accessibilityLabel={t('onboarding.finished')}
                >
                  <Text style={[homeStyles.submitText, { color: theme.bg }]}>
                    {t('onboarding.finished')}
                  </Text>
                </Pressable>
              </>
            )}
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
                onOpenProfile={() => setProfileBaby(baby)}
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
                    scheduleAlarmAt(
                      firesAt,
                      'TwinTracker',
                      t('notifications.alarm_wake', { name: baby.name }),
                      {
                        alarmId: alarm.id,
                      },
                    )
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
        suggestedBreast={
          sheet?.baby
            ? latest[`${sheet.baby.id}:nursing`]?.notes === 'left'
              ? 'right'
              : 'left'
            : 'left'
        }
        onSubmit={handleSheetSubmit}
        onClose={() => setSheet(null)}
      />

      <BabyProfileSheet
        visible={profileBaby !== null}
        baby={profileBaby}
        onSave={async (id, data) => {
          await api.babies.update(id, {
            name: data.name,
            birthDate: data.birthDate ?? null,
            sex: data.sex,
            weightKg: data.weightKg,
            heightCm: data.heightCm,
          });
          const updated = await api.babies.list();
          setBabies(updated);
        }}
        onClose={() => setProfileBaby(null)}
        onOpenDatePicker={(current, onConfirm) => {
          setDtPicker({
            title: i18n.t('baby_profile.dob_label'),
            value: current,
            mode: 'date',
            maximumDate: new Date(),
            onConfirm: d => {
              onConfirm(d);
              setDtPicker(null);
            },
          });
        }}
      />

      {/* DOB picker — outside any Modal so DateTimePickerSheet stacks correctly */}
      <DateTimePickerSheet
        visible={dtPicker !== null}
        title={dtPicker?.title ?? ''}
        value={dtPicker?.value ?? new Date()}
        mode={dtPicker?.mode ?? 'date'}
        maximumDate={dtPicker?.maximumDate}
        onConfirm={d => dtPicker?.onConfirm(d)}
        onCancel={() => setDtPicker(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// HistoryScreen
// Chronological list of all events, grouped by daily reset period.
// Swipe left on any row to delete. Tap to edit.
// ---------------------------------------------------------------------------
// SkeletonHistoryScreen — ghost rows shown while the event store is loading.
// Mirrors the grouped history list layout (section header + rows).
// ---------------------------------------------------------------------------
/** Number of day groups to render in the history skeleton. */
const SKELETON_HISTORY_GROUPS = 3;
/** Number of event rows per skeleton group. */
const SKELETON_HISTORY_ROWS = 4;

function SkeletonHistoryScreen() {
  const theme = useThemeContext();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[skeletonHistoryStyles.container, { opacity: pulse, backgroundColor: theme.bg }]}
    >
      {Array.from({ length: SKELETON_HISTORY_GROUPS }).map((_, g) => (
        <View key={g} style={skeletonHistoryStyles.group}>
          {/* Section header — date label + add button */}
          <View style={[skeletonHistoryStyles.sectionHeader, { borderBottomColor: theme.border }]}>
            <View
              style={[skeletonHistoryStyles.pill, { width: 72, backgroundColor: theme.border }]}
            />
          </View>
          {/* Event rows */}
          {Array.from({ length: SKELETON_HISTORY_ROWS }).map((_, r) => (
            <View key={r} style={[skeletonHistoryStyles.row, { borderBottomColor: theme.border }]}>
              {/* Author dot */}
              <View style={[skeletonHistoryStyles.dot, { backgroundColor: theme.border }]} />
              {/* Event type label — matches web: 56px wide, 14px tall */}
              <View
                style={[
                  skeletonHistoryStyles.pill,
                  { width: 56, height: 14, backgroundColor: theme.border },
                ]}
              />
              {/* Detail — matches web: flex fill, 14px tall */}
              <View
                style={[
                  skeletonHistoryStyles.pill,
                  { flex: 1, height: 14, backgroundColor: theme.border },
                ]}
              />
              {/* Time — matches web: 44px wide, 13px tall */}
              <View
                style={[skeletonHistoryStyles.pill, { width: 44, backgroundColor: theme.border }]}
              />
            </View>
          ))}
        </View>
      ))}
    </Animated.View>
  );
}

const skeletonHistoryStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
  },
  group: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 58,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  pill: {
    height: 13,
    borderRadius: 4,
  },
});

// ---------------------------------------------------------------------------
// The quick-add panel (+ button in section header) lets parents back-fill
// missed logs for a past day.
// ---------------------------------------------------------------------------
function HistoryScreen({
  babies,
  events,
  loading,
  deleteEvent,
  editEvent,
  logEvent,
  onRefresh,
}: {
  babies: Baby[];
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
  const [filters, setFilters] = useState<HistoryFilters>(emptyFilters());
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Derive authors from the full unfiltered list so pills don't disappear mid-filter
  const availableAuthors = useMemo(
    () => [...new Set(events.map(e => e.loggedByName).filter((n): n is string => Boolean(n)))],
    [events],
  );

  const filteredEvents = useMemo(() => applyHistoryFilters(events, filters), [events, filters]);

  const filterActive = isFilterActive(filters);

  function toggleBaby(id: string) {
    setFilters(f => {
      const next = new Set(f.babyIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...f, babyIds: next };
    });
  }

  function toggleType(type: EventType) {
    setFilters(f => {
      const next = new Set(f.types);
      next.has(type) ? next.delete(type) : next.add(type);
      return { ...f, types: next };
    });
  }

  function toggleAuthor(author: string) {
    setFilters(f => {
      const next = new Set(f.authors);
      next.has(author) ? next.delete(author) : next.add(author);
      return { ...f, authors: next };
    });
  }

  function handleAddForDay(date: Date) {
    const now = new Date();
    // Current period: period start is within last 24h → use current time
    // Past period: use noon of that calendar day (sensible default to adjust from)
    const isCurrentPeriod = date.getTime() + 24 * 60 * 60 * 1000 > now.getTime();
    const adjusted = isCurrentPeriod
      ? now
      : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    setFilterSheetOpen(false);
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
    return <SkeletonHistoryScreen />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <HistoryFeed
        events={filteredEvents}
        babies={babies}
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

      {/* Filter FAB — bottom-right, above tab bar (covered by Modal when sheet opens) */}
      <Pressable
        onPress={() => setFilterSheetOpen(true)}
        style={[
          filterStyles.fabFloat,
          filterStyles.fab,
          { backgroundColor: theme.bg, borderColor: theme.border },
        ]}
        accessibilityLabel={t('history.filter_open')}
      >
        <FilterIcon size={20} color={theme.text} />
        {filterActive && <View style={[filterStyles.badge, { backgroundColor: theme.accent }]} />}
      </Pressable>

      {/* Filter bottom sheet */}
      <Modal
        visible={filterSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <Pressable style={filterStyles.backdrop} onPress={() => setFilterSheetOpen(false)} />
        {/* FAB sits just above the sheet inside the modal */}
        <View style={filterStyles.fabRow}>
          <Pressable
            onPress={() => setFilterSheetOpen(false)}
            style={[filterStyles.fab, { backgroundColor: theme.bg, borderColor: theme.border }]}
            accessibilityLabel={t('history.filter_open')}
          >
            <FilterIcon size={20} color={theme.text} />
            {filterActive && (
              <View style={[filterStyles.badge, { backgroundColor: theme.accent }]} />
            )}
          </Pressable>
        </View>
        <View
          style={[
            filterStyles.sheet,
            { backgroundColor: theme.surface, borderTopColor: theme.border },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {babies.length > 1 && (
              <>
                <Text style={[filterStyles.sectionLabel, { color: theme.textMuted }]}>
                  {t('history.filter_babies')}
                </Text>
                <View style={filterStyles.pillRow}>
                  {babies.map(b => (
                    <Pressable
                      key={b.id}
                      onPress={() => toggleBaby(b.id)}
                      style={[
                        filterStyles.pill,
                        { borderColor: filters.babyIds.has(b.id) ? theme.accent : theme.border },
                        filters.babyIds.has(b.id) && { backgroundColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[
                          filterStyles.pillText,
                          { color: filters.babyIds.has(b.id) ? theme.bg : theme.text },
                        ]}
                      >
                        {b.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={[filterStyles.sectionLabel, { color: theme.textMuted }]}>
              {t('history.filter_types')}
            </Text>
            <View style={filterStyles.pillRow}>
              {EVENT_TYPES.map(type => (
                <Pressable
                  key={type}
                  onPress={() => toggleType(type)}
                  style={[
                    filterStyles.pill,
                    { borderColor: filters.types.has(type) ? theme.accent : theme.border },
                    filters.types.has(type) && { backgroundColor: theme.accent },
                  ]}
                >
                  <Text
                    style={[
                      filterStyles.pillText,
                      { color: filters.types.has(type) ? theme.bg : theme.text },
                    ]}
                  >
                    {t(`log_sheet.types.${type}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {availableAuthors.length > 1 && (
              <>
                <Text style={[filterStyles.sectionLabel, { color: theme.textMuted }]}>
                  {t('history.filter_authors')}
                </Text>
                <View style={filterStyles.pillRow}>
                  {availableAuthors.map(author => (
                    <Pressable
                      key={author}
                      onPress={() => toggleAuthor(author)}
                      style={[
                        filterStyles.pill,
                        { borderColor: filters.authors.has(author) ? theme.accent : theme.border },
                        filters.authors.has(author) && { backgroundColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[
                          filterStyles.pillText,
                          { color: filters.authors.has(author) ? theme.bg : theme.text },
                        ]}
                      >
                        {author}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Pressable
              onPress={() => {
                setFilters(emptyFilters());
                setFilterSheetOpen(false);
              }}
              style={filterStyles.clearAllBtn}
            >
              <Text style={[filterStyles.clearAllText, { color: theme.textMuted }]}>
                {t('history.filter_clear_all')}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Analytics Screen
// ---------------------------------------------------------------------------
function fmtMs(ms: number): string {
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

// ── Native trend charts ───────────────────────────────────────────────────────

const BAR_GAP_RATIO = 0.3;

function NativeTrendBars({
  data,
  height = 64,
  benchmarkValue,
  benchmarkLabel,
  color,
}: {
  data: TrendPoint[];
  height?: number;
  benchmarkValue?: number;
  benchmarkLabel?: string;
  color: string;
}) {
  const nonNull = data.map(p => p.value).filter((v): v is number => v !== null);
  if (nonNull.length === 0) {
    return <View style={{ height }} />;
  }

  const WIDTH = 300; // logical units — SVG scales to container width
  const topPad = 4;
  const drawH = height - topPad;
  const maxVal = Math.max(...nonNull, benchmarkValue ?? 0);
  const count = data.length;
  const slotW = WIDTH / count;
  const barW = slotW * (1 - BAR_GAP_RATIO);
  const gapW = slotW * BAR_GAP_RATIO;

  function barH(val: number): number {
    return maxVal > 0 ? (val / maxVal) * drawH : 0;
  }

  const benchmarkY =
    benchmarkValue !== undefined && maxVal > 0
      ? topPad + drawH - (benchmarkValue / maxVal) * drawH
      : null;

  return (
    <View>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
      >
        {data.map((point, i) => {
          if (point.value === null) {
            return null;
          }
          const bh = barH(point.value);
          const x = i * slotW + gapW / 2;
          const y = topPad + drawH - bh;
          return (
            <Rect
              key={point.dayMs}
              x={x}
              y={y}
              width={barW}
              height={bh}
              fill={color}
              opacity={0.7}
              rx={1.5}
            />
          );
        })}
        {benchmarkY !== null && (
          <Line
            x1={0}
            y1={benchmarkY}
            x2={WIDTH}
            y2={benchmarkY}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
        )}
      </Svg>
      {benchmarkLabel != null && (
        <View
          style={{ position: 'absolute', top: benchmarkY != null ? benchmarkY - 14 : 0, right: 0 }}
        >
          <Text style={{ fontSize: 9, opacity: 0.5, color }}>{benchmarkLabel}</Text>
        </View>
      )}
    </View>
  );
}

function NativeTrendSparkline({
  data,
  height = 48,
  benchmarkValue,
  color,
}: {
  data: TrendPoint[];
  height?: number;
  benchmarkValue?: number;
  color: string;
}) {
  const nonNull = data.map(p => p.value).filter((v): v is number => v !== null);
  if (nonNull.length < 2) {
    return <View style={{ height }} />;
  }

  const WIDTH = 300;
  const topPad = 4;
  const botPad = 4;
  const drawH = height - topPad - botPad;
  const maxVal = Math.max(...nonNull, benchmarkValue ?? 0);
  const minVal = Math.min(...nonNull, benchmarkValue ?? Infinity);
  const range = maxVal - minVal || 1;
  const count = data.length;

  function xPos(i: number): number {
    return count > 1 ? (i / (count - 1)) * WIDTH : WIDTH / 2;
  }
  function yPos(val: number): number {
    return topPad + drawH - ((val - minVal) / range) * drawH;
  }

  // Build polyline segments — break on null gaps
  const segments: string[][] = [];
  let current: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i].value;
    if (v !== null) {
      current.push(`${xPos(i)},${yPos(v)}`);
    } else {
      if (current.length >= 2) {
        segments.push(current);
      }
      current = [];
    }
  }
  if (current.length >= 2) {
    segments.push(current);
  }

  const benchmarkY = benchmarkValue !== undefined ? yPos(Math.min(benchmarkValue, maxVal)) : null;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
      {benchmarkY !== null && (
        <Line
          x1={0}
          y1={benchmarkY}
          x2={WIDTH}
          y2={benchmarkY}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.4}
        />
      )}
      {segments.map((pts, idx) => (
        <Polyline
          key={idx}
          points={pts.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {data.map((point, i) => {
        if (point.value === null) {
          return null;
        }
        return <Circle key={point.dayMs} cx={xPos(i)} cy={yPos(point.value)} r={2} fill={color} />;
      })}
    </Svg>
  );
}

// ── Analytics skeleton ────────────────────────────────────────────────────────

function AnalyticsSkeleton({ onBack }: { onBack: () => void }) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  // A single pulsing block
  function SkeletonBlock({ w, h, style }: { w: string | number; h: number; style?: object }) {
    return (
      <Animated.View
        style={[
          {
            height: h,
            width: w,
            borderRadius: 4,
            backgroundColor: theme.surface,
            opacity: pulse,
          },
          style,
        ]}
      />
    );
  }

  // A skeleton section card: icon circle + title line + primary stat + 3 stat rows
  function SkeletonCard() {
    return (
      <View
        style={[
          analyticsStyles.block,
          { backgroundColor: theme.surface, borderColor: theme.border, gap: 10 },
        ]}
      >
        {/* Card header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Animated.View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: theme.border,
              opacity: pulse,
            }}
          />
          <SkeletonBlock w="40%" h={10} />
        </View>
        {/* Primary stat */}
        <SkeletonBlock w="35%" h={30} />
        {/* Stat rows */}
        {[55, 70, 48].map((pct, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <SkeletonBlock w={`${pct}%`} h={12} />
            <SkeletonBlock w="18%" h={12} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={analyticsStyles.scroll} showsVerticalScrollIndicator={false}>
      {/* Back button */}
      <Pressable onPress={onBack} style={analyticsStyles.backBtn}>
        <Text style={[analyticsStyles.backText, { color: theme.textMuted }]}>
          ← {t('analytics.back')}
        </Text>
      </Pressable>
      {/* Heading */}
      <SkeletonBlock w="55%" h={26} style={{ marginBottom: 8 }} />
      {/* Subheading */}
      <SkeletonBlock w="38%" h={12} style={{ marginBottom: 24 }} />
      {/* Period tabs */}
      <SkeletonBlock w="100%" h={36} style={{ borderRadius: 6, marginBottom: 24 }} />
      {/* Section cards */}
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </ScrollView>
  );
}

function AnalyticsScreen({
  baby,
  events,
  eventsLoading,
  sleepTraining,
  units,
  onBack,
}: {
  baby: Baby;
  events: TrackerEvent[];
  eventsLoading: boolean;
  sleepTraining: boolean;
  units: 'metric' | 'imperial';
  onBack: () => void;
}) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');

  if (eventsLoading) {
    return <AnalyticsSkeleton onBack={onBack} />;
  }

  const now = new Date();
  const babyEvents = events.filter(e => e.babyId === baby.id);
  const allTimes = babyEvents.map(e => new Date(e.startedAt).getTime());
  const totalDataSpanDays =
    allTimes.length > 0 ? (Date.now() - Math.min(...allTimes)) / MS_PER_DAY : 0;

  const ageWeeks = getAgeWeeks(baby.birthDate);
  const isNewborn = ageWeeks < 15;

  // Stage label: "Stage N · Xmo old"
  const stage = ageWeeks < 15 ? 1 : ageWeeks < 78 ? 2 : 3;
  const stageAge = (() => {
    if (!baby.birthDate) {
      return null;
    }
    if (ageWeeks < 8) {
      return `${ageWeeks}w`;
    }
    if (ageWeeks < 52) {
      return `${Math.round(ageWeeks / 4.33)}mo`;
    }
    return `${Math.floor(ageWeeks / 52)}y`;
  })();

  // Learned stats for avg naps/day
  const learnedStats = computeLearnedStats(babyEvents, now);

  // Growth percentiles
  const babyAgeMonths = ageInMonths(baby.birthDate, now);
  const isImperial = units === 'imperial';
  const weightPercentile =
    baby.weightKg != null && baby.sex != null && babyAgeMonths != null
      ? computeWeightPercentile(baby.weightKg, babyAgeMonths, baby.sex as 'male' | 'female')
      : null;
  const heightPercentile =
    baby.heightCm != null && baby.sex != null && babyAgeMonths != null
      ? computeHeightPercentile(baby.heightCm, babyAgeMonths, baby.sex as 'male' | 'female')
      : null;
  const showGrowth = baby.weightKg != null || baby.heightCm != null;
  function fmtWeight(kg: number): string {
    return isImperial ? `${(kg * 2.2046).toFixed(1)} lbs` : `${kg.toFixed(1)} kg`;
  }
  function fmtHeight(cm: number): string {
    return isImperial ? `${(cm * 0.3937).toFixed(1)} in` : `${Math.round(cm)} cm`;
  }

  const a: BabyAnalytics = computeAnalytics(babyEvents, now, period, baby.birthDate);

  // Trend data uses 14 days for Day/Week, 30 days for Month.
  const trendDays = period === 'month' ? 30 : 14;
  const signals = detectTransitionSignals(babyEvents, now, baby.birthDate);
  const trend = computeTrendData(babyEvents, now, baby.birthDate, trendDays);

  // Trend summaries, delta pills and signals are only meaningful over multiple days.
  const showTrends = period !== 'day';

  const periodDays = period === 'day' ? 1 : period === 'month' ? 30 : 7;

  const rangeEnd = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const rangeStart = (daysBack: number) =>
    new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  const periodHeader =
    period === 'day'
      ? t('analytics.today')
      : period === 'month'
        ? t('analytics.this_month', { range: `${rangeStart(30)} – ${rangeEnd}` })
        : t('analytics.this_week', { range: `${rangeStart(7)} – ${rangeEnd}` });

  // Reusable card wrapper
  function Card({
    icon,
    title,
    children,
  }: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <View
        style={[
          analyticsStyles.block,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={analyticsStyles.blockHeader}>
          {icon}
          <Text style={[analyticsStyles.blockTitle, { color: theme.textMuted }]}>{title}</Text>
        </View>
        {children}
      </View>
    );
  }

  // Key/value stat row
  function StatRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={analyticsStyles.statRow}>
        <Text style={[analyticsStyles.statLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[analyticsStyles.statValue, { color: theme.text }]}>{value}</Text>
      </View>
    );
  }

  // Week-over-week delta pill
  function DeltaPill({ ms, positive }: { ms: number; positive: boolean }) {
    return (
      <View style={analyticsStyles.deltaRow}>
        <View
          style={[
            analyticsStyles.pill,
            positive ? analyticsStyles.pillPos : analyticsStyles.pillNeg,
          ]}
        >
          <Text style={[analyticsStyles.pillText, { color: theme.text }]}>
            {positive ? '+' : '−'}
            {fmtMs(ms)}
          </Text>
        </View>
        <Text style={[analyticsStyles.deltaLabel, { color: theme.textMuted }]}>
          {positive ? 'more' : 'less'} vs last week
        </Text>
      </View>
    );
  }

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
      {stageAge && (
        <Text style={[analyticsStyles.stageIndicator, { color: theme.textMuted }]}>
          {t('analytics.stage_indicator', { stage, age: stageAge })}
        </Text>
      )}

      {/* ── Period tabs ─────────────────────────────────────────────────────── */}
      <View style={analyticsStyles.periodTabs}>
        {(['day', 'week', 'month'] as const).map(p => {
          const disabled = p === 'month' && totalDataSpanDays < MIN_DAYS_FOR_MONTH_VIEW;
          return (
            <Pressable
              key={p}
              style={[
                analyticsStyles.periodTab,
                { borderColor: theme.border },
                period === p && { backgroundColor: theme.accent, borderColor: theme.accent },
                disabled && { opacity: 0.35 },
              ]}
              onPress={() => !disabled && setPeriod(p)}
              accessibilityState={{ disabled }}
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
          );
        })}
      </View>

      {a.dataSpanDays < periodDays - 1 && (
        <Text
          style={[
            analyticsStyles.dataNotice,
            { color: theme.textMuted, borderColor: theme.border },
          ]}
        >
          {`${Math.ceil(a.dataSpanDays)} day${Math.ceil(a.dataSpanDays) === 1 ? '' : 's'} of data — partial ${period} view.`}
        </Text>
      )}

      {/* ── Feeding ─────────────────────────────────────────────────────────── */}
      <Card icon={<BottleIcon size={14} color={theme.textMuted} />} title={t('analytics.feeding')}>
        {a.totalOzThisWeek > 0 ? (
          <>
            <Text style={[analyticsStyles.primaryStat, { color: theme.text }]}>
              {`${Math.round(a.totalOzThisWeek)} oz`}
            </Text>
            <View style={analyticsStyles.statsGrid}>
              {a.avgOzPerFeed != null && (
                <StatRow
                  label={t('analytics.oz_per_feed_label')}
                  value={`${a.avgOzPerFeed.toFixed(1)} oz avg`}
                />
              )}
              {a.avgFeedIntervalMs != null && (
                <StatRow
                  label={t('analytics.feed_interval_label')}
                  value={`every ${fmtMs(a.avgFeedIntervalMs)} avg`}
                />
              )}
              <StatRow label="feeds/day" value={`${a.avgFeedsPerDay.toFixed(1)}`} />
            </View>
            <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
              {`Target ${a.targetOzPerFeed} oz/feed · ${fmtMs(a.targetFeedIntervalMs)} interval`}
            </Text>
          </>
        ) : (
          <Text style={[analyticsStyles.empty, { color: theme.textMuted }]}>
            {t('analytics.feeding_empty', { period: 'this period' })}
          </Text>
        )}
      </Card>

      {/* ── Sleep ───────────────────────────────────────────────────────────── */}
      {isNewborn ? (
        // Stage 1: single Newborn Sleep block — no nap/night split
        <Card
          icon={<MoonIcon size={14} color={theme.textMuted} />}
          title={t('analytics.newborn_sleep')}
        >
          {a.totalSleepMsThisWeek > 0 ? (
            <>
              <Text style={[analyticsStyles.primaryStat, { color: theme.text }]}>
                {fmtMs(a.totalSleepMsThisWeek)}
              </Text>
              <View style={analyticsStyles.statsGrid}>
                <StatRow
                  label={t('analytics.nap_count_label')}
                  value={`${a.napCountThisWeek + a.nightSleepCountThisWeek} sessions`}
                />
                <StatRow label="avg/day" value={fmtMs(a.avgDailySleepMs)} />
              </View>
              <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
                {`Target: ${fmtMs(a.targetDailySleepMs.minMs)}–${fmtMs(a.targetDailySleepMs.maxMs)}/day`}
              </Text>
            </>
          ) : (
            <Text style={[analyticsStyles.empty, { color: theme.textMuted }]}>
              {t('analytics.naps_empty', { period: 'this period' })}
            </Text>
          )}
        </Card>
      ) : (
        <>
          {/* Stage 2+: separate nap and night sleep cards */}
          <Card icon={<MoonIcon size={14} color={theme.textMuted} />} title={t('analytics.naps')}>
            {a.napCountThisWeek > 0 ? (
              <>
                <Text style={[analyticsStyles.primaryStat, { color: theme.text }]}>
                  {fmtMs(a.totalNapMsThisWeek)}
                </Text>
                <View style={analyticsStyles.statsGrid}>
                  <StatRow
                    label={t('analytics.nap_count_label')}
                    value={`${a.napCountThisWeek} naps`}
                  />
                  {a.avgNapDurationMs != null && (
                    <StatRow label="avg/nap" value={fmtMs(a.avgNapDurationMs)} />
                  )}
                  {a.longestNapMs != null && (
                    <StatRow label="longest" value={fmtMs(a.longestNapMs)} />
                  )}
                  {learnedStats.avgNapsPerDay != null && (
                    <StatRow
                      label={t('analytics.avg_naps_per_day_label')}
                      value={learnedStats.avgNapsPerDay.toFixed(1)}
                    />
                  )}
                </View>
                {showTrends && a.napDeltaVsLastWeek != null && (
                  <DeltaPill
                    ms={Math.abs(a.napDeltaVsLastWeek)}
                    positive={a.napDeltaVsLastWeek >= 0}
                  />
                )}
                <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
                  {`Target nap: ${fmtMs(a.targetNapDurationMs)}`}
                </Text>
              </>
            ) : (
              <Text style={[analyticsStyles.empty, { color: theme.textMuted }]}>
                {t('analytics.naps_empty', { period: 'this period' })}
              </Text>
            )}
          </Card>

          <Card
            icon={<HotelIcon size={14} color={theme.textMuted} />}
            title={t('analytics.night_sleep')}
          >
            {a.nightSleepCountThisWeek > 0 ? (
              <>
                <Text style={[analyticsStyles.primaryStat, { color: theme.text }]}>
                  {fmtMs(a.totalNightSleepMsThisWeek)}
                </Text>
                <View style={analyticsStyles.statsGrid}>
                  {a.avgNightSleepDurationMs != null && (
                    <StatRow label="avg/night" value={fmtMs(a.avgNightSleepDurationMs)} />
                  )}
                  <StatRow label="avg/day total" value={fmtMs(a.avgDailySleepMs)} />
                </View>
                {showTrends && a.sleepDeltaVsLastWeek != null && (
                  <DeltaPill
                    ms={Math.abs(a.sleepDeltaVsLastWeek)}
                    positive={a.sleepDeltaVsLastWeek >= 0}
                  />
                )}
                <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
                  {`Target: ${fmtMs(a.targetDailySleepMs.minMs)}–${fmtMs(a.targetDailySleepMs.maxMs)}/day`}
                </Text>
              </>
            ) : (
              <Text style={[analyticsStyles.empty, { color: theme.textMuted }]}>
                {t('analytics.night_sleep_empty', { period: 'this period' })}
              </Text>
            )}
          </Card>
        </>
      )}

      {/* ── Feeding trends ───────────────────────────────────────────────────── */}
      {showTrends && trend.feedIntervalByDay.filter(p => p.value !== null).length >= 3 && (
        <Card
          icon={<BottleIcon size={14} color={theme.textMuted} />}
          title={t('analytics.feeding_trends')}
        >
          <Text style={[analyticsStyles.trendBlockLabel, { color: theme.textDim }]}>
            {t('analytics.oz_per_feed_label')}
          </Text>
          <NativeTrendSparkline
            data={trend.ozPerFeedByDay}
            benchmarkValue={
              trend.targetOzPerDay /
              (trend.targetFeedIntervalMs > 0
                ? Math.round(86400000 / trend.targetFeedIntervalMs)
                : 6)
            }
            color={theme.text}
            height={52}
          />
          <Text style={[analyticsStyles.trendBlockLabel, { color: theme.textDim, marginTop: 10 }]}>
            {t('analytics.feed_interval_label')}
          </Text>
          <NativeTrendSparkline
            data={trend.feedIntervalByDay}
            benchmarkValue={trend.targetFeedIntervalMs}
            color={theme.text}
            height={52}
          />
          <Text style={[analyticsStyles.trendNote, { color: theme.textMuted, marginTop: 6 }]}>
            {t('analytics.last_14_days')}
          </Text>
        </Card>
      )}

      {/* ── Sleep consolidation ──────────────────────────────────────────────── */}
      {showTrends && trend.longestNightByDay.filter(p => p.value !== null).length >= 3 && (
        <Card
          icon={<HotelIcon size={14} color={theme.textMuted} />}
          title={t('analytics.sleep_consolidation')}
        >
          <Text style={[analyticsStyles.trendBlockLabel, { color: theme.textDim }]}>
            {t('analytics.night_stretch_label')}
          </Text>
          <NativeTrendBars
            data={trend.longestNightByDay}
            benchmarkValue={trend.targetDailySleepMs.minMs}
            benchmarkLabel={`${t('analytics.target_label')} ${fmtMs(trend.targetDailySleepMs.minMs)}`}
            color={theme.text}
            height={72}
          />
          {trend.napCountByDay.filter(p => p.value !== null).length >= 3 && (
            <>
              <Text
                style={[analyticsStyles.trendBlockLabel, { color: theme.textDim, marginTop: 10 }]}
              >
                {t('analytics.nap_count_label')}
              </Text>
              <NativeTrendBars
                data={trend.napCountByDay}
                benchmarkValue={trend.targetNapsPerDay}
                benchmarkLabel={`${t('analytics.target_label')} ${trend.targetNapsPerDay} ${t('analytics.naps')}`}
                color={theme.text}
                height={56}
              />
            </>
          )}
          <Text style={[analyticsStyles.trendNote, { color: theme.textMuted, marginTop: 6 }]}>
            {t('analytics.last_14_days')}
          </Text>
        </Card>
      )}

      {/* ── Transition signals ──────────────────────────────────────────────── */}
      {showTrends && signals.length > 0 && (
        <Card
          icon={<MilestoneIcon size={14} color={theme.textMuted} />}
          title={t('analytics.transition_signals')}
        >
          {signals.map((signal, i) => {
            const kindKey =
              signal.kind === 'feed_interval_lengthening'
                ? 'interval'
                : signal.kind === 'nap_consolidating'
                  ? 'nap'
                  : signal.kind === 'sleep_stretch_milestone'
                    ? 'sleep'
                    : 'oz';
            const detailParams =
              signal.kind === 'sleep_stretch_milestone' && signal.valueMs
                ? { duration: fmtMs(signal.valueMs) }
                : {};
            return (
              <View
                key={i}
                style={[
                  analyticsStyles.signalRow,
                  i > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    analyticsStyles.signalDot,
                    {
                      backgroundColor: signal.direction === 'positive' ? theme.text : theme.textDim,
                      opacity: signal.direction === 'positive' ? 0.7 : 0.45,
                    },
                  ]}
                />
                <View style={analyticsStyles.signalTextCol}>
                  <Text style={[analyticsStyles.signalTitle, { color: theme.text }]}>
                    {t(`analytics.signal_${kindKey}_title`)}
                  </Text>
                  <Text style={[analyticsStyles.signalDetail, { color: theme.textDim }]}>
                    {t(`analytics.signal_${kindKey}_detail`, detailParams)}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {/* ── Growth ──────────────────────────────────────────────────────────── */}
      {showGrowth && (
        <Card icon={<PersonIcon size={14} color={theme.textMuted} />} title={t('analytics.growth')}>
          <View style={analyticsStyles.growthGrid}>
            {baby.weightKg != null && (
              <View style={analyticsStyles.growthItem}>
                <Text style={[analyticsStyles.growthValue, { color: theme.text }]}>
                  {fmtWeight(baby.weightKg)}
                </Text>
                <Text style={[analyticsStyles.growthLabel, { color: theme.textMuted }]}>
                  {t('analytics.weight_label')}
                </Text>
                {weightPercentile != null && (
                  <Text style={[analyticsStyles.growthPercentile, { color: theme.textDim }]}>
                    {formatPercentile(weightPercentile)}
                  </Text>
                )}
              </View>
            )}
            {baby.heightCm != null && (
              <View style={analyticsStyles.growthItem}>
                <Text style={[analyticsStyles.growthValue, { color: theme.text }]}>
                  {fmtHeight(baby.heightCm)}
                </Text>
                <Text style={[analyticsStyles.growthLabel, { color: theme.textMuted }]}>
                  {t('analytics.height_label')}
                </Text>
                {heightPercentile != null && (
                  <Text style={[analyticsStyles.growthPercentile, { color: theme.textDim }]}>
                    {formatPercentile(heightPercentile)}
                  </Text>
                )}
              </View>
            )}
          </View>
        </Card>
      )}

      {/* ── Diapers ─────────────────────────────────────────────────────────── */}
      <Card icon={<DiaperIcon size={14} color={theme.textMuted} />} title={t('analytics.diapers')}>
        {a.diaperCountThisWeek > 0 ? (
          <>
            <Text style={[analyticsStyles.primaryStat, { color: theme.text }]}>
              {String(a.diaperCountThisWeek)}
            </Text>
            <View style={analyticsStyles.statsGrid}>
              <StatRow label="per day" value={`${a.avgDiapersPerDay.toFixed(1)}`} />
              {a.msSinceLastDirty != null && (
                <StatRow label="last dirty" value={`${fmtMs(a.msSinceLastDirty)} ago`} />
              )}
            </View>
            {a.targetMinWetDiapersPerDay != null && (
              <Text style={[analyticsStyles.benchmark, { color: theme.textMuted }]}>
                {`Min ${a.targetMinWetDiapersPerDay} wet/day (newborn adequacy)`}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={[analyticsStyles.empty, { color: theme.textMuted }]}>
              {t('analytics.diapers_empty', { period: 'this period' })}
            </Text>
            {a.msSinceLastDirty != null && (
              <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
                {`Last dirty: ${fmtMs(a.msSinceLastDirty)} ago`}
              </Text>
            )}
          </>
        )}
      </Card>

      {/* ── Solid foods ─────────────────────────────────────────────────────── */}
      {a.foodCountThisWeek > 0 && (
        <Card icon={<FoodIcon size={14} color={theme.textMuted} />} title={t('analytics.solids')}>
          <Text style={[analyticsStyles.primaryStat, { color: theme.text }]}>
            {String(a.foodCountThisWeek)}
          </Text>
          <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
            {t('analytics.solids_note', { name: baby.name })}
          </Text>
        </Card>
      )}

      {/* ── Sleep training ──────────────────────────────────────────────────── */}
      {sleepTraining && (
        <Card icon={<MoonIcon size={14} color={theme.textMuted} />} title="SLEEP TRAINING">
          <Text style={[analyticsStyles.primaryStat, { color: theme.text }]}>
            {fmtMs(a.selfSoothingWaitMs)}
          </Text>
          <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
            {'When nap crying starts, wait before responding. Reset timer if crying pauses.'}
          </Text>
          <Text style={[analyticsStyles.detail, { color: theme.textDim }]}>
            {'After wait: respond with a feed only — no rocking or comfort.'}
          </Text>
        </Card>
      )}

      {/* ── Milestones ──────────────────────────────────────────────────────── */}
      {a.milestones.length > 0 && (
        <Card
          icon={<MilestoneIcon size={14} color={theme.textMuted} />}
          title={t('analytics.milestones')}
        >
          {a.milestones.map(m => (
            <Text key={m.id} style={[analyticsStyles.milestone, { color: theme.text }]}>
              {t('analytics.milestone_row', { notes: m.notes, date: fmtDate(m.startedAt) })}
            </Text>
          ))}
        </Card>
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
  units,
  setUnits,
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
  allStage1,
  members,
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
  units: 'metric' | 'imperial';
  setUnits: (u: 'metric' | 'imperial') => void;
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
  allStage1: boolean;
  members: { id: string; displayName?: string | null }[];
}) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const [nameInput, setNameInput] = useState(() => displayName ?? '');
  const [nameSaved, setNameSaved] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  // Adds theme-aware top border to each settings section
  const section = [settingsStyles.adminSection, { borderTopColor: theme.border }];

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
        <View style={section}>
          <Pressable
            onPress={() => setTwinSync(!twinSync)}
            style={[
              switchRowStyles.row,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            accessibilityRole="switch"
            accessibilityState={{ checked: twinSync }}
          >
            <View style={switchRowStyles.content}>
              <Text style={[switchRowStyles.label, { color: theme.text }]}>
                {t('settings.twin_sync_title')}
              </Text>
              <Text style={[switchRowStyles.hint, { color: theme.textMuted }]}>
                {t('settings.twin_sync_hint')}
              </Text>
            </View>
            <View
              style={[
                switchRowStyles.track,
                { backgroundColor: twinSync ? theme.accent : theme.border },
              ]}
            >
              <View
                style={[
                  switchRowStyles.thumb,
                  { backgroundColor: theme.bg },
                  twinSync && switchRowStyles.thumbOn,
                ]}
              />
            </View>
          </Pressable>
        </View>
      )}

      <View style={section}>
        <Pressable
          onPress={() => setSleepTraining(!sleepTraining)}
          style={[
            switchRowStyles.row,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: sleepTraining }}
        >
          <View style={switchRowStyles.content}>
            <Text style={[switchRowStyles.label, { color: theme.text }]}>
              {t('settings.sleep_training_title')}
            </Text>
            <Text style={[switchRowStyles.hint, { color: theme.textMuted }]}>
              {t('settings.sleep_training_hint')}
            </Text>
          </View>
          <View
            style={[
              switchRowStyles.track,
              { backgroundColor: sleepTraining ? theme.accent : theme.border },
            ]}
          >
            <View
              style={[
                switchRowStyles.thumb,
                { backgroundColor: theme.bg },
                sleepTraining && switchRowStyles.thumbOn,
              ]}
            />
          </View>
        </Pressable>
      </View>

      {/* ── Units ───────────────────────────────────────────────────────────── */}
      <View style={section}>
        <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
          {t('settings.units_title').toUpperCase()}
        </Text>
        <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
          {t('settings.units_hint')}
        </Text>
        <View style={settingsStyles.pillGrid}>
          {(['metric', 'imperial'] as const).map(u => {
            const active = units === u;
            return (
              <Pressable
                key={u}
                onPress={() => setUnits(u)}
                accessibilityLabel={t(`settings.units_${u}`)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={[
                  settingsStyles.pill,
                  { borderColor: active ? theme.accent : theme.border },
                  active && { backgroundColor: theme.accent },
                ]}
              >
                <Text
                  style={[settingsStyles.pillText, { color: active ? theme.bg : theme.textMuted }]}
                >
                  {t(`settings.units_${u}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {allStage1 ? (
        <View style={section}>
          <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
            {t('settings.wake_title').toUpperCase()}
          </Text>
          <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
            {t('settings.stage1_bedtime_note')}
          </Text>
        </View>
      ) : (
        <>
          <View style={section}>
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

          <View style={section}>
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
        </>
      )}

      <View style={section}>
        <Text style={[settingsStyles.sectionTitle, { color: theme.textMuted }]}>
          {t('settings.household_title').toUpperCase()}
        </Text>

        {/* Member avatars */}
        {members.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            {members.map(m => {
              const name = m.displayName ?? '?';
              const color = authorColor(name);
              return (
                <View key={m.id} style={{ alignItems: 'center', gap: 4 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: color,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                      {name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    style={{ color: theme.textDim, fontSize: 11, maxWidth: 52 }}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Your name */}
        <Text style={[settingsStyles.hint, { color: theme.textMuted }]}>
          {t('settings.household_your_name_label')}
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
            accessibilityLabel={t('settings.household_your_name_label')}
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

        {/* Invite code */}
        {inviteCode && (
          <>
            <Text style={[settingsStyles.hint, { color: theme.textMuted, marginTop: 16 }]}>
              {t('settings.invite_hint')}
            </Text>
            <View style={[settingsStyles.codeRow, { borderColor: theme.border }]}>
              <Text style={[settingsStyles.codeText, { color: theme.text }]}>{inviteCode}</Text>
              <Pressable
                onPress={() =>
                  Share.share({
                    message: t('settings.invite_share_message', { code: inviteCode }),
                  })
                }
                style={[settingsStyles.shareBtn, { borderColor: theme.border }]}
                accessibilityLabel={t('settings.invite_share')}
              >
                <Text style={[settingsStyles.shareBtnText, { color: theme.text }]}>
                  {t('settings.invite_share')} ›
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <View style={section}>
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
        <Pressable
          onPress={() => Linking.openURL('https://www.twintracker.app/settings')}
          style={[settingsStyles.dangerBtn, { borderColor: theme.border, marginTop: 8 }]}
          accessibilityLabel={t('settings.export_data_web_link')}
        >
          <Text style={[settingsStyles.dangerText, { color: theme.textMuted }]}>
            {t('settings.export_data_web_link')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL('https://www.twintracker.app/settings')}
          style={[settingsStyles.dangerBtn, { borderColor: theme.border, marginTop: 8 }]}
          accessibilityLabel={t('settings.delete_account_web_link')}
        >
          <Text style={[settingsStyles.dangerText, { color: theme.textMuted }]}>
            {t('settings.delete_account_web_link')}
          </Text>
        </Pressable>
      </View>

      {isAdmin && (
        <View style={section}>
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
  const textTabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'home', icon: '⌂', label: t('nav.home') },
    { key: 'history', icon: '◷', label: t('nav.history') },
  ];
  const settingsActive = activeTab === 'settings';

  return (
    <View style={[tabStyles.bar, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
      {textTabs.map(tab => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [tabStyles.item, pressed && tabStyles.itemPressed]}
            onPressIn={() => onTabChange(tab.key)}
            accessibilityLabel={t('nav.tab_label', { name: tab.label })}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[tabStyles.icon, { color: active ? theme.text : theme.textMuted }]}>
              {tab.icon}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        style={({ pressed }) => [tabStyles.item, pressed && tabStyles.itemPressed]}
        onPressIn={() => onTabChange('settings')}
        accessibilityLabel={t('nav.tab_label', { name: t('nav.settings') })}
        accessibilityRole="tab"
        accessibilityState={{ selected: settingsActive }}
      >
        <SettingsIcon size={22} color={settingsActive ? theme.text : theme.textMuted} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// useLayout — responsive breakpoints derived from screen width.
// Updates automatically on orientation change.
//   isTablet  ≥ 768pt  — iPad portrait+    (side-by-side baby cards)
//   isLarge   ≥ 1024pt — iPad landscape+   (side nav rail replaces bottom bar)
// ---------------------------------------------------------------------------
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** iPad portrait+ — baby cards go side-by-side. */
const TABLET_BREAKPOINT_PX = 768;
/** iPad landscape+ — side nav rail replaces the bottom tab bar. */
const LARGE_TABLET_BREAKPOINT_PX = 1024;

function useLayout() {
  const { width } = useWindowDimensions();
  return {
    isTablet: width >= TABLET_BREAKPOINT_PX,
    isLarge: width >= LARGE_TABLET_BREAKPOINT_PX,
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
  const textTabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'home', icon: '⌂', label: t('nav.home') },
    { key: 'history', icon: '◷', label: t('nav.history') },
  ];
  const settingsActive = activeTab === 'settings';
  return (
    <View
      style={[sideNavStyles.rail, { backgroundColor: theme.bg, borderRightColor: theme.border }]}
    >
      {textTabs.map(tab => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [sideNavStyles.item, pressed && sideNavStyles.itemPressed]}
            onPressIn={() => onTabChange(tab.key)}
            accessibilityLabel={t('nav.tab_label', { name: tab.label })}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[sideNavStyles.icon, { color: active ? theme.text : theme.textMuted }]}>
              {tab.icon}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        style={({ pressed }) => [sideNavStyles.item, pressed && sideNavStyles.itemPressed]}
        onPressIn={() => onTabChange('settings')}
        accessibilityLabel={t('nav.tab_label', { name: t('nav.settings') })}
        accessibilityRole="tab"
        accessibilityState={{ selected: settingsActive }}
      >
        <SettingsIcon size={22} color={settingsActive ? theme.text : theme.textMuted} />
      </Pressable>
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
    loginWithGoogle,
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
    setUnits,
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
  const [activeTab, setActiveTabRaw] = useState<Tab>('home');
  // Shows a skeleton overlay on the incoming tab immediately on press, cleared once
  // the native thread finishes settling (InteractionManager.runAfterInteractions).
  const [transitioningTo, setTransitioningTo] = useState<Tab | null>(null);
  const transitionTaskRef = useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  const setActiveTab = (tab: Tab) => {
    if (transitionTaskRef.current) {
      transitionTaskRef.current.cancel();
    }
    setActiveTabRaw(tab);
    setTransitioningTo(tab);
    transitionTaskRef.current = InteractionManager.runAfterInteractions(() => {
      setTransitioningTo(null);
      transitionTaskRef.current = null;
    });
  };
  const [babies, setBabies] = useState<Baby[]>([]);
  const [babiesLoading, setBabiesLoading] = useState(true);
  const [members, setMembers] = useState<{ id: string; displayName?: string | null }[]>([]);

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
      .then(result => {
        setBabies(result);
      })
      .catch(console.error)
      .finally(() => {
        setBabiesLoading(false);
      });
    api.auth.householdMembers().then(setMembers).catch(console.error);
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
        Alert.alert(
          t('home.nap_banner_still_sleeping'),
          t('home.nap_banner_still_sleeping_body', { name }),
          [
            { text: t('home.nap_banner_yes'), style: 'default', onPress: onDone },
            {
              text: t('home.nap_banner_cancel_nap'),
              style: 'destructive',
              onPress: () => {
                deleteEvent(napId).catch(console.error);
                onDone?.();
              },
            },
          ],
        );
      };
      const napBaby = currentBabies.find(b => b.id === babyId);
      if (!napBaby) {
        return;
      }
      const activeNap = currentEvents.find(
        e => e.babyId === napBaby.id && (e.type === 'nap' || e.type === 'sleep') && !e.endedAt,
      );
      if (!activeNap) {
        // Nap already ended — show a simple informational alert instead of silently ignoring.
        Alert.alert(
          t('home.alarm_fired_title'),
          t('home.alarm_fired_body', { name: napBaby.name }),
        );
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
  }, [deleteEvent, t]);

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
      Alert.alert(t('home.alarm_fired_title'), t('home.alarm_fired_body', { name: napBaby.name }));
      return;
    }
    const showAlert = (name: string, napId: string, onDone?: () => void) => {
      Alert.alert(
        t('home.nap_banner_still_sleeping'),
        t('home.nap_banner_still_sleeping_body', { name }),
        [
          { text: t('home.nap_banner_yes'), style: 'default', onPress: onDone },
          {
            text: t('home.nap_banner_cancel_nap'),
            style: 'destructive',
            onPress: () => {
              deleteEvent(napId).catch(console.error);
              onDone?.();
            },
          },
        ],
      );
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
  }, [babies, events, eventsLoading, prefs.twinSync, deleteEvent, t]);

  if (authLoading) {
    return (
      <SafeAreaView style={[appStyles.container, { backgroundColor: theme.bg }]}>
        <StatusBar style={theme.mode === 'night' ? 'light' : 'dark'} />
        <ActivityIndicator color={theme.text} size="large" />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        login={login}
        register={register}
        join={join}
        loginWithGoogle={loginWithGoogle}
      />
    );
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
          eventsLoading={eventsLoading}
          sleepTraining={prefs.sleepTraining}
          units={prefs.units}
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
          <Pressable onPress={logout} style={{ marginTop: 16 }}>
            <Text style={{ color: theme.textMuted, fontFamily: 'DM Mono', fontSize: 13 }}>
              {t('auth.back_to_sign_in')}
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
                <>
                  <HomeScreen
                    babies={babies}
                    setBabies={setBabies}
                    babiesLoading={babiesLoading}
                    resetHour={prefs.wakeHour}
                    napCheckMinutes={prefs.napCheckMinutes}
                    twinSync={prefs.twinSync}
                    setTwinSync={setTwinSync}
                    bedtimeHour={prefs.bedtimeHour}
                    setBedtimeHour={setBedtimeHour}
                    wakeHour={prefs.wakeHour}
                    setWakeHour={setWakeHour}
                    sleepTraining={prefs.sleepTraining}
                    setSleepTraining={setSleepTraining}
                    latest={latest}
                    events={events}
                    logEvent={logEvent}
                    closeNap={closeNap}
                    onOpenAnalytics={setAnalyticsBabyId}
                    onRefresh={poll}
                    isTablet={isTablet}
                  />
                  {/* Transition skeleton: covers the remount flash while native settles */}
                  {transitioningTo === 'home' && (
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.bg }]}>
                      <SkeletonHomeScreen isTablet={isTablet} />
                    </View>
                  )}
                </>
              ) : null}
              {/* History and Settings use opacity+absoluteFill instead of display:none.
                  display:none defers native layout; opacity:0 pre-computes layout so
                  switching visibility is a single GPU op with no bridge work. */}
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  { opacity: activeTab === 'history' ? 1 : 0 },
                ]}
                pointerEvents={activeTab === 'history' ? 'auto' : 'none'}
              >
                <HistoryScreen
                  babies={babies}
                  events={events}
                  loading={eventsLoading}
                  deleteEvent={deleteEvent}
                  editEvent={editEvent}
                  logEvent={logEvent}
                  onRefresh={poll}
                />
                {/* Transition skeleton: pre-mounted so no native view creation cost on switch.
                    Opacity toggles to 1 during transition — GPU op only, no bridge work. */}
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      backgroundColor: theme.bg,
                      opacity: transitioningTo === 'history' ? 1 : 0,
                    },
                  ]}
                  pointerEvents="none"
                >
                  <SkeletonHistoryScreen />
                </View>
              </View>
              {/* Gate on displayName !== null so Settings never flashes default/empty values. */}
              {displayName !== null && (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    { opacity: activeTab === 'settings' ? 1 : 0 },
                  ]}
                  pointerEvents={activeTab === 'settings' ? 'auto' : 'none'}
                >
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
                    units={prefs.units}
                    setUnits={setUnits}
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
                    allStage1={
                      babies.length > 0 &&
                      babies.every(b => b.birthDate != null && getAgeWeeks(b.birthDate) < 15)
                    }
                    members={members}
                  />
                </View>
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
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
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
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12 },
  googleBtn: {
    width: '100%',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 8,
  },
  googleBtnText: { fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
});

const homeStyles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onboarding: { marginTop: 48 },
  onboardTitle: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  onboardSub: { fontSize: 13, marginBottom: 32 },
  // Conversational question heading that drives each prefs step
  onboardQuestion: { fontFamily: 'Nunito', fontSize: 22, fontWeight: '700', marginBottom: 8 },
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
  itemPressed: { opacity: 0.5 },
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
  itemPressed: { opacity: 0.5 },
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

const filterStyles = StyleSheet.create({
  // FAB appearance (shared between floating and in-modal states)
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 6,
  },
  // TabBar is in-flow above HistoryScreen's container bottom, so bottom = gap only (matches web's 0.75rem).
  fabFloat: {
    position: 'absolute',
    bottom: 12,
    right: 16,
  },
  fabRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    maxHeight: '60%',
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    paddingBottom: 32,
  },
  sectionLabel: {
    fontFamily: 'DMMonoRegular',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontFamily: 'DMMonoRegular', fontSize: 13 },
  clearAllBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAllText: { fontFamily: 'DMMonoRegular', fontSize: 12 },
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
  sectionTitle: { fontSize: 13, letterSpacing: 0.8, marginBottom: 8 },
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
  adminSection: { marginTop: 0, paddingTop: 24, borderTopWidth: 1 },
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

const switchRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  content: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  hint: { fontSize: 12, lineHeight: 17 },
  track: {
    flexShrink: 0,
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginHorizontal: 3,
    // shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbOn: {
    // Shifts the thumb to the right inside the track
    alignSelf: 'flex-end',
  },
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
  // Elevated card (replaces block)
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  // Primary big stat inside a card
  primaryStat: { fontSize: 32, fontWeight: '800', marginBottom: 4 },
  // Stats grid rows
  statsGrid: { marginTop: 8 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  statLabel: { fontSize: 13 },
  statValue: { fontSize: 13, fontWeight: '600' },
  // Delta row (week-over-week comparison)
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  deltaLabel: { fontSize: 12 },
  // Delta pills
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 },
  pillPos: { backgroundColor: 'rgba(16,185,129,0.15)' },
  pillNeg: { backgroundColor: 'rgba(251,113,133,0.15)' },
  pillText: { fontSize: 12, fontWeight: '600' },
  // Trend section sub-label (chart title above each chart)
  trendBlockLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  // Trend note — date range caption below charts
  trendNote: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  // Transition signal rows
  signalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 },
  signalDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  signalTextCol: { flex: 1 },
  signalTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  signalDetail: { fontSize: 12, lineHeight: 18 },
  // Stage indicator below period subheading
  stageIndicator: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  // Growth section
  growthGrid: { flexDirection: 'row', gap: 24, marginBottom: 8 },
  growthItem: { flexDirection: 'column', gap: 2 },
  growthValue: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  growthLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  growthPercentile: { fontSize: 11, marginTop: 2 },
});
