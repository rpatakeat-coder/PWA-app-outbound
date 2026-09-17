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
  abrirImagem,
  caminhoDaFoto,
  escolherImagem,
  extensaoDe,
  porQueNaoServe,
  recortarParaBlob,
  urlComVersao,
  type Recorte,
} from '../utils/fotoDePerfil';

const BUCKET = 'avatares';

export function useFotoDePerfil() {
  const { user, profile, definirFotoDoPerfil } = useAuth();
  const [enviando, setEnviando] = useState(false);

  // A imagem escolhida, esperando enquadramento. Enquanto não for null, quem
  // chama renderiza a folha de ajuste.
  //
  // O upload virou DOIS PASSOS por causa do enquadramento: escolher o arquivo e
  // subir deixaram de ser a mesma ação, porque no meio a pessoa decide o que
  // aparece no círculo. O estado vive no hook e não na tela para que os dois
  // pontos de entrada (o avatar do cabeçalho e Configurações) usem o mesmo
  // caminho — duas cópias divergiriam no primeiro ajuste.
  const [emEdicao, setEmEdicao] = useState<{
    arquivo: File;
    bitmap: ImageBitmap | HTMLImageElement;
    largura: number;
    altura: number;
    url: string;
  } | null>(null);

  const fecharEdicao = () => {
    // A object URL segura a imagem inteira na memória; sem revogar, trocar de
    // foto cinco vezes numa sessão deixa cinco fotos presas.
    if (emEdicao) URL.revokeObjectURL(emEdicao.url);
    setEmEdicao(null);
  };

  /** Passo 1: escolhe o arquivo e abre o ajuste. Devolve mensagem de erro, ou
   *  null quando abriu (ou quando a pessoa desistiu do seletor). */
  const escolher = async (): Promise<string | null> => {
    if (!user?.id) return 'Você precisa estar logado.';
    const arquivo = await escolherImagem();
    if (!arquivo) return null; // desistiu — não é erro

    const recusa = porQueNaoServe(arquivo);
    if (recusa) return recusa;

    try {
      const aberta = await abrirImagem(arquivo);
      setEmEdicao({ arquivo, ...aberta });
      return null;
    } catch (err) {
      return (err as Error)?.message ?? 'Não consegui abrir a imagem.';
    }
  };

  /** Passo 2: recorta no enquadramento escolhido e sobe. */
  const enviar = async (recorte: Recorte): Promise<string | null> => {
    if (!user?.id) return 'Você precisa estar logado.';
    if (!emEdicao) return 'Nenhuma foto selecionada.';

    setEnviando(true);
    try {
      // O recorte sempre sai em JPEG, então a extensão é fixa aqui. O
      // `extensaoDe` continua sendo a fonte da regra, para o dia em que houver
      // um caminho que suba o original.
      const menor = await recortarParaBlob(emEdicao.bitmap, recorte);
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
      fecharEdicao();
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

  return {
    foto: profile?.avatar_url ?? null,
    escolher,
    enviar,
    emEdicao,
    fecharEdicao,
    remover,
    enviando,
  };
}

/** Traduz o erro do storage. O "Bucket not found" é o sintoma exato de a
 *  migration 0076_foto_do_perfil.sql não ter rodado, e dizer isso poupa meia
 *  hora de caça. */
function mensagemDeUpload(bruto: string): string {
  if (/bucket not found/i.test(bruto)) {
    return 'O espaço das fotos ainda não existe no servidor. Avise a gestão (falta rodar a migration das fotos).';
  }
  if (/row-level security|violates/i.test(bruto)) {
    // Aconteceu de verdade em 17/09/2026: a 0076 criou insert/update/delete e
    // esqueceu o select, e o `upsert` (que é INSERT ... ON CONFLICT DO UPDATE)
    // precisa LER a linha em conflito. "Avise a gestão" mandava a pessoa pedir
    // ajuda sem dizer o que pedir.
    return 'O servidor recusou salvar a foto (permissão do espaço de fotos). Avise a gestão: falta rodar a migration 0077_foto_do_perfil_select.sql.';
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
