import AsyncStorage from '@react-native-async-storage/async-storage';

// Prefs locais do usuário, persistidos no device. Não sincroniza entre
// dispositivos (se trocar de celular, volta pro default) — é só uma
// preferência de UI, não dado que precisa sobreviver à reinstalação.

const KEY_SHOW_ONLY_MY_AREA = '@takeat:show_only_my_area';

export async function getShowOnlyMyAreaPref(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY_SHOW_ONLY_MY_AREA);
    return v === '1';
  } catch {
    return false;
  }
}

export async function setShowOnlyMyAreaPref(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SHOW_ONLY_MY_AREA, value ? '1' : '0');
  } catch (err) {
    console.warn('[PREFS] persist show_only_my_area falhou:', err);
  }
}
