import { initI18n } from './index.js';
// Silence the i18next promotional console.info in test output
const info = console.info;
console.info = () => {};
initI18n('en');
console.info = info;
