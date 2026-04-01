/**
 * DateTimePickerSheet — native-only bottom-sheet date/time picker.
 *
 * Renders a Modal that slides up from the bottom with a scroll-wheel
 * DateTimePicker (display="spinner"), Cancel and Save buttons.
 *
 * Works on iOS and Android (v8+ of @react-native-community/datetimepicker
 * supports display="spinner" on Android for all modes).
 *
 * NOT imported by any web code path — safe to import native-only libs here.
 */
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { i18n, useThemeContext } from '@tt/core';

export interface DateTimePickerSheetProps {
  visible: boolean;
  title: string;
  value: Date;
  mode: 'date' | 'time' | 'datetime';
  maximumDate?: Date;
  minimumDate?: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

export function DateTimePickerSheet({
  visible,
  title,
  value,
  mode,
  maximumDate,
  minimumDate,
  onConfirm,
  onCancel,
}: DateTimePickerSheetProps) {
  const theme = useThemeContext();
  const [draft, setDraft] = useState<Date>(value);

  // Re-seed draft each time the sheet opens so it reflects the latest committed value.
  useEffect(() => {
    if (visible) {
      setDraft(value);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(_event: DateTimePickerEvent, date?: Date) {
    if (date) {
      setDraft(date);
    }
  }

  const isNight = theme.mode === 'night';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      {/* Backdrop — tap to cancel */}
      <Pressable style={styles.backdrop} onPress={onCancel} />

      <View
        style={[styles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
      >
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: theme.border }]} />

        {/* Title */}
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Scroll-wheel picker — display="spinner" works on both iOS and Android v8+ */}
        <DateTimePicker
          value={draft}
          mode={mode}
          display="spinner"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={handleChange}
          style={styles.picker}
          // iOS-only props — suppress on Android to avoid warnings
          {...(Platform.OS === 'ios'
            ? { textColor: theme.text, themeVariant: isNight ? 'dark' : 'light' }
            : {})}
        />

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Cancel / Save row */}
        <View style={styles.actions}>
          <Pressable
            style={styles.actionBtn}
            onPress={onCancel}
            accessibilityLabel={i18n.t('common.cancel')}
          >
            <Text style={[styles.cancelText, { color: theme.textMuted }]}>
              {i18n.t('common.cancel')}
            </Text>
          </Pressable>
          <View style={[styles.actionDivider, { backgroundColor: theme.border }]} />
          <Pressable
            style={styles.actionBtn}
            onPress={() => onConfirm(draft)}
            accessibilityLabel={i18n.t('common.save')}
          >
            <Text style={[styles.saveText, { color: theme.accent }]}>{i18n.t('common.save')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingBottom: 36,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  picker: {
    width: '100%',
    height: 216,
  },
  actions: {
    flexDirection: 'row',
    height: 56,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '400',
  },
  saveText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
