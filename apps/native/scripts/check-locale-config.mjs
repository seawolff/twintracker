import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const supportedLocales = ['en', 'de', 'fr', 'es'];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertIncludes(haystack, needle, context) {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing ${needle} in ${context}`);
  }
}

const appJson = JSON.parse(read('app.json'));
const declaredIosLocales = appJson.expo?.ios?.infoPlist?.CFBundleLocalizations;
if (!Array.isArray(declaredIosLocales)) {
  throw new Error('apps/native/app.json is missing expo.ios.infoPlist.CFBundleLocalizations');
}

for (const locale of supportedLocales) {
  if (!declaredIosLocales.includes(locale)) {
    throw new Error(`apps/native/app.json is missing locale ${locale} in CFBundleLocalizations`);
  }
}

const iosInfoPlist = read('ios/TwinTracker/Info.plist');
const widgetInfoPlist = read('ios/TwinTrackerWidget/Info.plist');
const xcodeProject = read('ios/TwinTracker.xcodeproj/project.pbxproj');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const androidLocalesConfig = read('android/app/src/main/res/xml/locales_config.xml');

for (const locale of supportedLocales) {
  assertIncludes(iosInfoPlist, `<string>${locale}</string>`, 'ios/TwinTracker/Info.plist');
  assertIncludes(widgetInfoPlist, `<string>${locale}</string>`, 'ios/TwinTrackerWidget/Info.plist');
  assertIncludes(xcodeProject, `${locale},`, 'ios/TwinTracker.xcodeproj/project.pbxproj');
  assertIncludes(
    androidLocalesConfig,
    `android:name="${locale}"`,
    'android/app/src/main/res/xml/locales_config.xml',
  );
}

assertIncludes(
  androidManifest,
  'android:localeConfig="@xml/locales_config"',
  'android/app/src/main/AndroidManifest.xml',
);

console.log(`Native locale config verified for: ${supportedLocales.join(', ')}`);
