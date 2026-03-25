import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageInterface } from '@tt/core';

export const asyncStorage: StorageInterface = {
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: key => AsyncStorage.removeItem(key),
};
