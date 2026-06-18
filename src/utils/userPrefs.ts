import AsyncStorage from '@react-native-async-storage/async-storage';

// Prefs locais do usuário, persistidos no device. Não sincroniza entre
// dispositivos (se trocar de celular, volta pro default) — é só uma
// preferência de UI, não dado que precisa sobreviver à reinstalação.

// Bumpado pra v2 em 2026-06-18 quando o produto pediu que o filtro "minha
// area" viesse ligado por padrao pra TODOS os usuarios. Quem tinha '0' na
// chave v1 antes desse marco e' resetado pro novo default (true). Pra
// desligar de novo, basta abrir Configuracoes.
const KEY_SHOW_ONLY_MY_AREA = '@takeat:show_only_my_area_v2';
const KEY_SHOW_ONLY_MY_AREA_LEGACY = '@takeat:show_only_my_area';

export async function getShowOnlyMyAreaPref(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY_SHOW_ONLY_MY_AREA);
    if (v === null) {
      // Limpa a chave antiga pra nao deixar lixo. Se o usuario alterar
      // o switch depois, vai persistir na v2.
      AsyncStorage.removeItem(KEY_SHOW_ONLY_MY_AREA_LEGACY).catch(() => {});
      return true;
    }
    return v === '1';
  } catch {
    return true;
  }
}

export async function setShowOnlyMyAreaPref(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SHOW_ONLY_MY_AREA, value ? '1' : '0');
  } catch (err) {
    console.warn('[PREFS] persist show_only_my_area falhou:', err);
  }
}
