import * as Updates from 'expo-updates';

// Helper único pra "puxa o bundle novo do EAS e reinicia o app já".
// Em Expo Go / dev (Updates.isEnabled = false) vira no-op silencioso —
// Expo Go já recarrega sozinho do canal toda vez que abre, então não
// faz diferença.
//
// Retorna true se efetivamente disparou o reload (não houve retorno —
// o app vai reiniciar). Retorna false se não havia update ou se algo
// deu errado (erro silenciado pra não derrubar o app).
export async function checkAndReloadIfUpdateAvailable(): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return false;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return true;
  } catch (err) {
    console.warn('[UPDATES] check/fetch/reload falhou:', err);
    return false;
  }
}
