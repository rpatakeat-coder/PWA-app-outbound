-- OS SINAIS AO VIVO SAEM DO REALTIME (16/11/26, aplicada às 08:44 no meio do incidente)
--
-- Motor da avalanche das 8h: 251 sinais em uma hora (94 de negócio e 106 de tarefa, quase todos da
-- sincronização do HubSpot). Cada sinal chega a TODOS os aparelhos e ao Cockpit, e cada um refaz as
-- leituras pesadas (fila-tarefas na Edge, com ~12 leituras; desenvolvimento_quadro; cards). Depois do
-- corte os pedidos caíram de 710/min para menos de 150/min e os estouros de tempo zeraram.
--
-- O que se perde: a tela não se refaz sozinha quando OUTRA pessoa age. Ela continua atualizando ao
-- abrir, ao voltar para o app e ao agir. O Cockpit já trata a falta do canal ("a tela segue com o dado
-- da carga") e o aoVivoRecuperar continua lendo a tabela ao abrir. A tabela e os gatilhos ficam.
-- Para religar: alter publication supabase_realtime add table public.sinais_ao_vivo;
-- (só religar junto com um app que NÃO refaça leitura pesada a cada sinal.)

alter publication supabase_realtime drop table public.sinais_ao_vivo;
