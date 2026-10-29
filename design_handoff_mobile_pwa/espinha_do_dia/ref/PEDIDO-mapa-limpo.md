# Pedido · o mapa limpo

De: Julyan Ribeiro (Head comercial, Field Sales Takeat) · 29/10/2026 · app de rua, aba Mapa, 390 px

> "o mapa ficou muita coisa... não curti. o mapa, que é o que eles mais usam, ficou com uma poluição visual que não dá. [...] vamos deixar esse app o mais BONITO e FUNCIONAL para um executivo de excelência."

Depois, sobre a primeira prancha: **"não quero trocar os pins, eu só não queria uma sujeira no mapa."**

## O problema
O mapa virou um painel com um mapa atrás. É um pedido de **hierarquia**, não de corte de função.

## As 9 camadas no print de 13:23
1. Busca + sino (3) + avatar J
2. Lentes: Meu dia 234 · Clientes 20 · R… (cortada) · filtro
3. Linha do dia âmbar: Dia sem plano · o gestor vê quem planejou · Montar ›
4. Pílula Ver em lista · 234
5. Placas sobre o mapa (Jacarezinho · 3 clientes, São Cristóvão, 6 novos clientes Takeat)
6. Localização
7. + vermelho
8. Folha recolhida 0/6 ⌃
9. Barra Mapa · Hoje · Eu com selo "6 atrasados"

Também podem aparecer: Limpar, janela das ligações (12:30–12:45, 17:30–17:45), carregamento por área, cartão da quadra, lente Calor (gestor), os outros 13 estados da linha do dia.

## O que o código já sabe
- `App.tsx`, bloco "O QUE SE EMPILHA ABAIXO DAS LENTES": cinco faixas possíveis em pilha; pílulas e janela de ligação já se cobriram em produção.
- As contagens das lentes são da área visível: 234/20 às 13:23, 143/49 às 12:02. Número que muda a cada gesto é ruído.

## Restrições
- Nada deixa de existir. Pinos, cores de etapa (Q #E23B3B, M #F5A524, F #0EA5E9, cliente #16A34A) e Cheguei por GPS não mudam.
- Barra de 3 abas só muda se a prancha provar que a 4ª aba é melhor.
- Só tokens existentes. Poppins. Sem emoji. 44 px. Avisar, não travar. HubSpot e Asaas intocados.

## Decisões da prancha (`prancha/Mapa limpo - Prancha.dc.html`)
- Direção A + C: uma faixa fixa só para verbo com prazo; contexto calmo no topo da folha.
- Lista fica como vista, com alternador Mapa | Lista fixo. Barra em 3.
- Lentes sem contagem. Contagem só na Lista, congelada com a hora.
