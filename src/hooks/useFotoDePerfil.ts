// Trocar e remover a própria foto de perfil.
//
// A ORDEM DAS DUAS ESCRITAS IMPORTA, e nos dois sentidos:
//
//   trocar:  sobe o arquivo → grava a URL em `profiles`
//   remover: limpa a URL em `profiles` → apaga o arquivo
//
// Sempre o arquivo primeiro ao ganhar e o registro primeiro ao perder. Se a
// segunda metade falhar, o estado intermediário é inofensivo: na troca sobra um
// arquivo no bucket que ninguém aponta (o próximo upload sobrescreve, porque o
// caminho é fixo); na remoção sobra um arquivo órfão no storage, mas o app já
// não o mostra. O contrário é que seria ruim — `avatar_url` apontando para um
// arquivo que não existe deixaria o avatar quebrado para o time inteiro.
//
// A escrita é SÓ a própria: `.eq('id', user.id)` aqui e a policy do storage
// amarrando a pasta ao `auth.uid()` na migration 0076_foto_do_perfil.sql. Duas
// voltas na mesma tranca, porque essa é a que apareceria na cara de todo mundo
// se soltasse.
import { useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import {
  caminhoDaFoto,
  encolherQuadrado,
  escolherImagem,
  extensaoDe,
  porQueNaoServe,
  urlComVersao,
} from '../utils/fotoDePerfil';

const BUCKET = 'avatares';

export function useFotoDePerfil() {
  const { user, profile, definirFotoDoPerfil } = useAuth();
  const [enviando, setEnviando] = useState(false);

  /** Abre o seletor e deixa a foto no ar. Devolve a mensagem de erro para a
   *  tela mostrar, ou null quando deu certo (ou quando a pessoa desistiu). */
  const trocar = async (): Promise<string | null> => {
    if (!user?.id) return 'Você precisa estar logado.';
    const arquivo = await escolherImagem();
    if (!arquivo) return null; // desistiu — não é erro

    const recusa = porQueNaoServe(arquivo);
    if (recusa) return recusa;

    setEnviando(true);
    try {
      // O encolhimento sempre sai em JPEG, então a extensão é fixa aqui. O
      // `extensaoDe` continua sendo a fonte da regra, para o dia em que houver
      // um caminho que suba o original.
      const menor = await encolherQuadrado(arquivo);
      const caminho = caminhoDaFoto(user.id, extensaoDe('image/jpeg'));

      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(caminho, menor, { contentType: 'image/jpeg', upsert: true });
      if (erroUpload) return mensagemDeUpload(erroUpload.message);

      const { data: publico } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
      // A versão vai DENTRO da string gravada: o caminho é fixo, então sem ela
      // o navegador continuaria servindo a foto antiga do cache. Ver
      // src/utils/fotoDePerfil.ts.
      const url = urlComVersao(publico.publicUrl, Date.now());

      const { error: erroPerfil } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', user.id);
      if (erroPerfil) return mensagemDePerfil(erroPerfil.message);

      definirFotoDoPerfil(url);
      return null;
    } catch (err) {
      return (err as Error)?.message ?? 'Não consegui enviar a foto.';
    } finally {
      setEnviando(false);
    }
  };

  const remover = async (): Promise<string | null> => {
    if (!user?.id) return 'Você precisa estar logado.';
    setEnviando(true);
    try {
      const { error: erroPerfil } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id);
      if (erroPerfil) return mensagemDePerfil(erroPerfil.message);
      definirFotoDoPerfil(null);

      // Best-effort: a foto já desapareceu da tela quando a coluna zerou.
      // Falhar aqui deixa um arquivo órfão no bucket, e não vou transformar
      // isso num erro na cara de quem só quis tirar a própria foto.
      await supabase.storage.from(BUCKET).remove([caminhoDaFoto(user.id, 'jpg')]);
      return null;
    } catch (err) {
      return (err as Error)?.message ?? 'Não consegui remover a foto.';
    } finally {
      setEnviando(false);
    }
  };

  return { foto: profile?.avatar_url ?? null, trocar, remover, enviando };
}

/** Traduz o erro do storage. O "Bucket not found" é o sintoma exato de a
 *  migration 0076_foto_do_perfil.sql não ter rodado, e dizer isso poupa meia
 *  hora de caça. */
function mensagemDeUpload(bruto: string): string {
  if (/bucket not found/i.test(bruto)) {
    return 'O espaço das fotos ainda não existe no servidor. Avise a gestão (falta rodar a migration das fotos).';
  }
  if (/row-level security|violates/i.test(bruto)) {
    return 'Sem permissão para salvar a foto. Avise a gestão.';
  }
  if (/exceeded|too large|payload/i.test(bruto)) {
    return 'A imagem ficou grande demais depois do envio. Tente outra foto.';
  }
  return `Não consegui enviar a foto: ${bruto}`;
}

function mensagemDePerfil(bruto: string): string {
  // A coluna existia no TYPE antes de existir no banco; se a migration não
  // rodou, o PostgREST responde que a coluna é desconhecida.
  if (/avatar_url/i.test(bruto) && /column|schema/i.test(bruto)) {
    return 'O campo da foto ainda não existe no servidor. Avise a gestão (falta rodar a migration das fotos).';
  }
  return `A foto subiu, mas não consegui salvar no seu perfil: ${bruto}`;
}
