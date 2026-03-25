import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import en from './en.json';
import es from './es.json';
import de from './de.json';
import fr from './fr.json';

export { useTranslation };

const resources = {
  en: { translation: en },
  es: { translation: es },
  de: { translation: de },
  fr: { translation: fr },
};

/**
 * Initialize i18next. Call once at app startup with the detected locale.
 * Web: navigator.language  Native: Localization.locale (expo-localization)
 */
export function initI18n(locale: string = 'en'): void {
  if (i18n.isInitialized) {
    i18n.changeLanguage(locale.slice(0, 2));
    return;
  }

  i18n.use(initReactI18next).init({
    resources,
    lng: locale.slice(0, 2),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export default i18n;
