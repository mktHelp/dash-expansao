# Black Friday Expansão — Painel ao vivo de presenças confirmadas

Painel em **Next.js 16 + Tailwind 4** que lê a planilha **Relatório COF** (aba *Qualificação COF 2026*) direto do Google Sheets — sem banco de dados — e mostra em tempo real, até o **evento (25/11, 19h)**:

- 🎯 **Meta de 100 presenças confirmadas** (coluna *Presença Confirmada* = Sim) em destaque, com quanto falta
- ☎️ **Na mesa:** convidados que ainda não responderam (convite = Sim e presença vazia) e quantos deles precisam virar para bater a meta
- **Funil de conversão:** COFs enviadas (100%) → convites enviados → presenças confirmadas, com as taxas entre cada etapa e as recusas
- 🏆 **Ranking de presenças** por vendedor (coluna *Responsável*): pódio, "faltam X para passar Fulano", selo *na cola* quando o 2º está a 1–2 do líder, convites, fila e taxa de confirmação de cada um
- **Fila de follow-up** por vendedor
- 🚨 **Alarme de inatividade:** depois de 5 min sem presença confirmada **nova**, aparece uma faixa vermelha "ATENÇÃO! XX MINUTOS SEM NOVA PRESENÇA CONFIRMADA!" que cresce até tomar a tela (~30 min), com vinheta vermelha e sirene a cada 5 min. Para convites há uma versão menor (pílula laranja no topo). O **relógio da pressão** mostra os dois tempos o tempo todo
- 🔔 **Alertas na tela:** "PRESENÇA CONFIRMADA! +1 NA META" (confete + som), "CONVITE ENVIADO!" e "NOVO LEAD NA COF!"; comemoração nos marcos de 25, 50 e 75 e grande final nas 100
- Contagem regressiva até o evento

Atualiza a cada 15 s. **E-mail, WhatsApp e capital nunca saem do servidor**; o candidato aparece como "Maria S.".

### Duas telas
- **`/` — fechamento e reativação (pós-Black):** é a tela da TV (a TV não troca de link); também abre em `/fechamento`. À esquerda, os leads da aba *Ao Vivo* separados em vendidos, quentes, mornos e frios (descartados ficam fora). À direita, a reativação de quem faltou (aba *Faltantes*): reativados, reservas, franquias, placar por SDR e a lista rolando.
  - **Temperatura:** a do infográfico de fechamento (26/11) já vem no código. Lead com status "Vendido", ou termo/taxa marcado como pago, vira vendido. Se a aba ganhar uma coluna **Temperatura** (Quente, Morno, Frio), ela passa a valer. Lead novo sem temperatura ganha um palpite pelo status.
  - **Faltantes:** a coluna *Reativado* com "Sim" ou uma data conta como reativado; outro texto (ex.: "tentando") aparece como *em contato*. *Termo de Reserva* e *Taxa de Franquia* contam quando dizem "Pago", "Sim", uma data ou um valor ("Amanhã" ainda não conta).
  - **Comemoração:** venda nova (aqui ou na reativação) tem anúncio, confete e som; reativado tem só o anúncio. `/?simular=1` + teclas **V** e **R** testa.
  - **Giroflex da reativação (sem som):** depois de **5 min** de expediente sem reativação nova, um giroflex acende por cima só do painel da reativação (no celular, vira uma faixa no topo do painel) e gira mais rápido a cada 5 min. O relógio fica no Redis, igual em todas as telas, com a mesma trava do alarme de presenças: só um total de reativados **maior** que o recorde zera o relógio, desmarcar e marcar de novo não conta. Fora do expediente fica pausado. Limite em `NEXT_PUBLIC_ALERTA_REATIVACAO_MIN`. `/?simular=1` + tecla **G** acende para testar (+5 min a cada toque).
- **`/funil` — funil ao vivo da noite da Black (25/11).**
- **`/presencas` — presenças confirmadas:** meta de presenças, na mesa, funil, ranking de presenças e fila de follow-up (ficava em `/` até a Black).
- **`/completo` — visão completa:** convites, qualificados, meta de presenças, ranking por leads, etapas no CRM, leads por mês e top estados.

### Funil ao vivo (`/funil`)
Lê a aba **"Ao Vivo"** da mesma planilha, onde os vendedores lançam cada lead da Black. Colunas: Candidato, Whatsapp, Cidade, UF, Responsável (SDR), Responsável (Closer), Modelo, Termo de Reserva, Taxa de Franquia (a ordem não importa).
- **Venda** = lead com **Termo de Reserva** *ou* **Taxa de Franquia** preenchido ("Sim", valor ou data; vazio, "Não", "-" e "0" não contam). Conta uma vez por lead, mesmo com os dois. **Meta: 10** (`META_VENDAS`).
- **A grande noite, em clima de festa:** um letreiro de teatro com luzes de pista (feixes rosa e turquesa varrendo o fundo). No centro, um **arco de 10 lâmpadas** em volta do número de vendas: as apagadas fazem o pisca-pisca correndo e cada venda acende uma (na ordem da planilha), **turquesa para reserva e ouro para franquia**, com um clarão; o número entra quicando. Nas laterais, reservas (turquesa) e franquias (ouro). Tipografia Fraunces "molenga" (só nesta tela).
- Reservas e franquias também aparecem separadas, junto com o total de leads e quantos % viraram venda.
- **Quem está no funil:** todos os leads passando como créditos de cinema quando não cabem na tela — vendas no topo (franquia, depois reserva), depois os mais novos. Cada linha mostra a **jornada lead → reserva → franquia** acesa, o modelo, o closer e quem trouxe; o topo traz o total, a conversão e Loja × Home Based.
- **Closers** com as lâmpadas de cada venda e **Quem trouxe** (SDRs, por leads).
- **Anúncios:** "Chegou gente nova no funil 👋", "Reserva garantida! 🥂" e "E a franquia vai para… 🎉" (confete colorido + som), e "Meta batida" com fogos nas 10. Cada lead é anunciado uma vez por tela aberta.
- O WhatsApp nunca sai do servidor; o candidato aparece como "Maria S.". O telão também aparece aqui.
- **`/funil?demo=1`** mostra dados de exemplo (com a etiqueta MODO DEMO), para ver a tela antes do primeiro lead. **`/funil?simular=1`** + teclas **L**, **R**, **F**, **M** testa os alertas.

### Telão: imagem em todas as telas
Abra **`/telao`** (no computador ou no celular), entre com a senha, escolha uma imagem ou um **GIF animado** e toque em **Mostrar em todas as telas**. Em até 15 s ela aparece num quadro grande no centro de todas as telas abertas (`/`, `/funil`, `/presencas` e `/completo`), com legenda opcional, deixando a meta e o ranking visíveis em volta. Ela fica no ar até alguém tocar em **Remover de todas as telas** (ou mandar outra, que substitui).
- A imagem é reduzida no próprio aparelho (até 1920 px, WebP) e guardada no Redis; as telas baixam uma vez por envio.
- Fotos são reduzidas no próprio aparelho antes de subir. GIFs sobem inteiros (para continuar animados), até **3 MB**: o limite de uma requisição na Vercel é 4,5 MB e o GIF cresce ~33% ao ser enviado.
- A senha é a variável **`TELAO_SENHA`** na Vercel (o repositório é público, então ela nunca vai para o código). Sem ela, ou sem Redis, a página avisa e o telão fica fechado.
- Os alertas de presença e o alarme de inatividade continuam aparecendo por cima do quadro.

### Testar os alertas
Abra `/?simular=presenca` (ou `convite`, `lead`, `marco`, `meta`). O alerta dispara em 3 s; depois use as teclas **P** (presença), **C** (convite), **L** (lead), **M** (marco), **G** (meta batida), **I** (+5 min sem presença) e **R** (resetar). Para ver o alarme direto: `/?simular=inatividade&minutos=20`.

### Alarme de inatividade: como funciona a trava
- O **recorde** de presenças e de convites fica **no servidor** (Upstash Redis), junto com a hora em que foi batido. Toda tela recebe o mesmo valor pela API, então o relógio é **igual em todos os PCs** e não depende de cookie, cache ou aba anônima.
- **Só um total maior que o recorde zera o relógio.** A troca é atômica no Redis. Desmarcar e marcar a mesma linha volta ao mesmo número, e trocar uma linha por outra também não muda o total — nenhum dos dois zera o relógio nem repete alerta, marco ou grande final.
- O relógio só corre no **expediente** (padrão seg–sex, 08:00–18:00, Brasília). Fora dele o alarme some e a contagem pausa: se a última presença foi às 17:50, às 08:05 do dia seguinte o relógio marca 15 min.
- O servidor só atualiza o recorde quando alguma tela está aberta (a cada leitura, ~15 s). Uma presença marcada com todas as telas fechadas conta a partir da próxima abertura.
- Se for preciso corrigir a planilha para baixo (ex.: marcaram presença errada), o recorde continua alto até ser superado. Para zerar, apague a chave `dash-expansao:recordes` no console do Upstash (Data Browser).
- **Sem Redis** (variáveis não configuradas ou Redis fora do ar) o painel continua funcionando, mas cada tela conta o próprio relógio no navegador, e o Relógio da Pressão mostra um aviso amarelo. Nesse modo, `/?zerar-recorde` zera o recorde daquela tela.
- Se a planilha parar de responder, o alarme some (o painel mostra "reconectando…").

#### Ligar o Redis na Vercel (uma vez)
1. No projeto da Vercel, abra **Storage** e crie um banco **Upstash Redis** (plano gratuito), conectado a este projeto.
2. A integração cria `KV_REST_API_URL` e `KV_REST_API_TOKEN` nas variáveis de ambiente.
3. Faça um **Redeploy**. No Relógio da Pressão deve aparecer "igual em todas as telas".

---

## 1. A planilha

Planilha **Relatório COF**, aba **`Qualificação COF 2026`**. O painel encontra as colunas **pelo nome do cabeçalho** (linha 1), então a ordem não importa.

| Coluna | Usada para | |
|---|---|---|
| Mês COF | — | já existe |
| **Data de envio** | leads por mês, hoje vs ontem, últimos leads | já existe |
| **Candidato** | nome no painel ("Maria S.") | já existe · **obrigatória** |
| WhatsApp / E-mail | não aparecem | já existem |
| **Cidade** / **UF** | top estados, últimos leads | já existem |
| **Qualificação** | KPI e qualificados por vendedor | já existe |
| Capital declarado no CRM | não aparece | já existe |
| **Etapa atual no CRM** | gráfico de etapas (o dono entre parênteses ou após " - " é ignorado) | já existe |
| Etapa anterior / Categorias TurboCRM | — | já existem |
| **Venda efetivada** | KPI de vendas e desempate (qualquer valor ≠ "não" conta) | já existe |
| Encontrado em / Como foi encontrado | — | já existem |
| **Responsável** | **ranking de presenças** (e de leads na visão completa) | já existe |
| **COF Enviada** | base do funil (100%) | já existe |
| **Convite Enviado** | funil e fila "na mesa" (Sim/Não) | já existe |
| **Presença Confirmada** | **meta: cada "Sim" = 1 ponto, de 100**; "Não" = recusa; vazio = aguardando resposta | já existe |

**Regras**
- **Tudo conta:** o painel considera **todas as linhas da planilha**, de qualquer data (desde maio), não só novembro.
- **Meta (100):** linhas com **Presença Confirmada = Sim**.
- **Na mesa / fila de follow-up:** Convite Enviado = Sim **e** Presença Confirmada vazia. Quem respondeu "Não" sai da fila e conta como recusa.
- **Ranking de presenças:** só vendedores com pelo menos um convite. Desempate: mais convites → menos recusas → mais COFs. Quem tem o mesmo nº divide a posição (1º, 1º, 3º) e aparece com o selo EMPATE. A planilha não guarda *quando* a presença foi confirmada, por isso não há setas de subiu/caiu nem "hoje" nesse ranking.
- Linha sem Responsável conta no total, mas não pontua para ninguém.
- **Alertas na tela:** "PRESENÇA CONFIRMADA!" quando a coluna vira Sim; "CONVITE ENVIADO!" quando o convite vira Sim; "NOVO LEAD NA COF!" quando uma linha ganha Responsável — cada linha só é anunciada uma vez por tela aberta. Marcos de 25/50/75 e a grande final nas 100 só disparam quando o total passa do recorde, nunca ao abrir a tela.

## 2. Conectar a planilha

### Opção A — só o ID (o mais simples)
Funciona porque a planilha está compartilhada como *Qualquer pessoa com o link*. Na Vercel (*Settings > Environment Variables*) e no `.env.local`:

```
GOOGLE_SHEET_ID=<trecho da URL entre /d/ e /edit>
GOOGLE_SHEET_GID=0
META_PRESENCA=100
NEXT_PUBLIC_EVENT_AT=2026-11-25T19:00:00-03:00
```

⚠️ Não coloque esse ID em lugar público (repositório aberto, print, mensagem em grupo grande). Hoje a planilha está como **"Qualquer pessoa com o link: Editor"**: quem tiver o ID pode ver e alterar nome, e-mail e WhatsApp de todos os candidatos.

### Opção B — conta de serviço (planilha privada, recomendado a médio prazo)
Permite tirar o "qualquer pessoa com o link" da planilha.
1. No [Google Cloud Console](https://console.cloud.google.com/): crie/escolha um projeto → **APIs e serviços > Biblioteca** → ative **Google Sheets API**.
2. **IAM e administrador > Contas de serviço** → *Criar conta de serviço* → **Chaves > Adicionar chave > JSON**.
3. Compartilhe a planilha com o `client_email` do JSON como **Leitor**.
4. Adicione `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` (veja `.env.example`). A aba lida é `'Qualificação COF 2026'!A:Z` (mude com `GOOGLE_SHEET_RANGE`).

Sem `GOOGLE_SHEET_ID` o painel roda em **modo demo** com dados fictícios.

## 3. Rodar e publicar

```bash
npm install
cp .env.example .env.local   # preencha o GOOGLE_SHEET_ID
npm run dev                  # http://localhost:3000
```

Na Vercel: importe o repositório, cole as variáveis de ambiente e faça o deploy.
Na TV: abra o link e clique no botão de tela cheia (canto superior direito). O botão de som ativa o "plim" de novo lead.

## Como o "tempo real" funciona sem banco

- O navegador chama `/api/leads` a cada 15 s.
- A API lê a planilha no Google, remove e-mail/WhatsApp/capital e devolve JSON.
- A CDN da Vercel guarda a resposta por 10 s, então 50 TVs abertas geram no máximo ~6 leituras/min na API do Google (limite gratuito: 300/min).
- Novos leads são detectados comparando com a leitura anterior, o que dispara o alerta na tela.

## Onde mexer

| Arquivo | O quê |
|---|---|
| `src/lib/config.ts` | data do evento, tempos do alarme, expediente, dia da Black Friday, ordem das etapas do CRM, intervalo de atualização |
| `src/lib/sheets.ts` | leitura da planilha e nomes de colunas aceitos |
| `src/lib/stats.ts` | cálculo de ranking, etapas e métricas |
| `src/lib/watch.ts` | relógio de inatividade (minutos de expediente) e recorde local de reserva |
| `src/lib/record.ts` | recorde compartilhado no Redis (atualização atômica) |
| `src/lib/telao.ts`, `src/app/telao`, `src/components/Telao*.tsx` | telão: imagem no centro de todas as telas |
| `src/lib/funil.ts`, `src/app/funil`, `src/components/Funil.tsx` | funil ao vivo da noite da Black (aba "Ao Vivo") |
| `src/lib/fechamento.ts`, `src/app/page.tsx`, `src/app/api/fechamento`, `src/components/Fechamento.tsx` | fechamento pós-Black e reativação (abas "Ao Vivo" e "Faltantes") |
| `src/lib/live.ts` | relógio, som e trava de recarga usados pelas duas telas |
| `src/components/` | interface |
