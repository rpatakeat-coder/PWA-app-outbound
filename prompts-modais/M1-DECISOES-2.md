# M1 — Decisões, rodada 2

> Fecha as duas perguntas em aberto e confirma os sete pontos de implementação. **Vale sobre o `M1-DECISOES.md` e sobre o `M1-MAPEAMENTO.md` onde houver conflito.** Depois deste arquivo: `M1b-casca.md`.

## Ordem da faixa: por tipo

Aceito o seu argumento. Se a severidade precisa de um desempate por tipo para chegar na mesma ordem, ela é a regra por tipo escrita de forma indireta — e mais difícil de ler depois. **Fica a ordem por tipo**, como está no `M1-DECISOES`.

## IconTrash: use

Você está certo, e a razão importa: **"sem ícone" era contorno para ausência, não escolha de hierarquia.** Se o ícone existe no kit, a linha tem ícone como as outras oito. A separação já vem da borda superior e do `--tint-red-text` — ênfase por omissão, num lugar onde todas as vizinhas têm ícone, lê como inacabado.

Os quatro ícones do kit, confirmados:

| Onde | Ícone |
|---|---|
Remover | `IconTrash` |
ID HubSpot | `IconIdCard` — resolve o emoji 🆔 |
Responsável | `IconManager` |
Link do HubSpot | **`IconExternalLink`**, que já está re-exportado. `IconLink` sugere "copiar link"; o externo diz "sai daqui" |

Adicione os três primeiros ao `icons.tsx` — import e export, ícone oficial, sem invenção. Os cinco sem equivalente (`location_off`, `directions_walk`, `add_road`, `edit_location`, `map`) seguem com os improvisos do `M1-DECISOES`.

## (g) Alinhamento do campo de telefone: à esquerda dentro do campo

Você está certo. O caret correndo enquanto se digita é defeito, e defeito ganha de simetria de coluna.

**Decisão:** o campo ocupa a coluna do valor — alinhado à direita como bloco — com o **texto alinhado à esquerda dentro dele**. A coluna se mantém, o texto para de pular.

Vale como regra geral: **campo editável tem texto à esquerda**, mesmo quando os valores estáticos vizinhos estão à direita. São coisas diferentes — um se lê, o outro se escreve.

## Os sete pontos: todos aceitos

Todos corretos, e cinco eu não tinha como saber. Confirmando um a um para virar especificação:

**(a) RESPONSÁVEL precisa de prop nova, e pode não existir.** Aceito a sua regra: **sem nome, a linha não renderiza.** Nunca exibir o id cru. E como o RLS de `profiles` pode devolver só o próprio perfil para não-gestor, a ausência é caso normal, não erro — não mostre "—" nem "Não identificado". Se a prop nova custar mais que o valor da linha, diga; ela é a menos importante da aba.

**(b) ID e link são independentes.** A linha de link fica condicionada a `url_hubspot`, não à presença do id. Um link para lugar nenhum é pior que nenhum link.

**(c) TELEFONE tem dois modos.** A "linha especial" mantém os dois: com `onSavePhone`, campo editável; sem ele (viewer), par chave/valor comum. Os dois caminhos já existem — preserve.

**(d) CONTATO depende de EMPRESA.** A condição `empresa && nome !== empresa` vale para o campo também, não só para a sublinha. Sem empresa, o título já é o nome do contato e a linha seria eco.

**(e) SLA "em dia" some quando `applies: false`.** Registrado, e é o comportamento certo: status que não é `lead`, ou etapa sem SLA, não têm o que informar. Nem faixa nem linha.

**(f) Conta Alvo e Observação são cards.** Ficam fora do grid de pares e fora da regra "sem linha vazia" — são blocos de contexto, não dados. Correto.

## Segue

Sem mais perguntas. Vá para o `M1b-casca.md`.

Uma coisa a carregar para os próximos: **quando o código contradiz a especificação, o código ganha o benefício da dúvida.** Os sete pontos acima existem porque o painel foi construído sabendo de coisas que o desenho não sabia. Se aparecer outro caso assim no `M1c` ou no `M1d`, pare e pergunte, como fez aqui.
