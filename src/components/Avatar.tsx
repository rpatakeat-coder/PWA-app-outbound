// O avatar de uma pessoa: a foto quando existe, as iniciais quando não.
//
// Existe para ser UM lugar. As iniciais eram calculadas em cinco pontos
// diferentes — cabeçalho do celular, barra lateral do desktop, folha do perfil,
// lista do time no Gestor, tabela do cockpit — cada um com o próprio `split`.
// Agora a foto entra e todos ganham juntos; sem isto, seriam cinco lugares para
// adicionar `<Image>` e cinco chances de esquecer um.
//
// A FALHA DE CARREGAMENTO VOLTA PARA AS INICIAIS. A URL vive em
// `profiles.avatar_url`; se o arquivo for apagado do bucket à mão, ou a rede
// morrer no meio, o `onError` devolve as iniciais em vez de deixar um quadrado
// cinza — o avatar é identidade, e um buraco no lugar dela lê como app quebrado.
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

/** No máximo duas letras, do nome ou do e-mail. Era a mesma conta repetida em
 *  cinco arquivos; agora sai daqui. */
export function iniciaisDe(nome: string | null | undefined, email?: string | null): string {
  const base = (nome || email || '').trim();
  if (!base) return '';
  return base
    .split(/\s+/)
    .map((parte) => parte[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({
  url,
  nome,
  email,
  tamanho,
  estilo,
  estiloTexto,
}: {
  /** `profiles.avatar_url`. Null/vazio cai nas iniciais. */
  url?: string | null;
  nome?: string | null;
  email?: string | null;
  /** Diâmetro em px. O raio acompanha, para o círculo nunca sair oval. */
  tamanho: number;
  /** Fundo e borda de quem chama — cada tela tem o seu. */
  estilo?: StyleProp<ViewStyle>;
  estiloTexto?: StyleProp<TextStyle>;
}) {
  const [falhou, setFalhou] = useState(false);
  // Trocar a foto muda a `?v=` da URL. Sem zerar o estado aqui, uma falha
  // anterior deixaria as iniciais grudadas mesmo com a foto nova no ar.
  useEffect(() => setFalhou(false), [url]);

  const mostrarFoto = !!url && !falhou;
  const iniciais = iniciaisDe(nome, email);

  return (
    <View
      style={[
        estilos.base,
        { width: tamanho, height: tamanho, borderRadius: tamanho / 2 },
        estilo,
      ]}
    >
      {mostrarFoto ? (
        <Image
          source={{ uri: url! }}
          style={{ width: tamanho, height: tamanho, borderRadius: tamanho / 2 }}
          // `cover` e não `contain`: a foto já sobe quadrada, e `contain`
          // deixaria tarja quando alguém trocar o arquivo por fora.
          resizeMode="cover"
          onError={() => setFalhou(true)}
          accessibilityLabel={nome ? `Foto de ${nome}` : 'Foto de perfil'}
        />
      ) : (
        <Text style={estiloTexto} numberOfLines={1}>
          {iniciais}
        </Text>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
