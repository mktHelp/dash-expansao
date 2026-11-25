# Black Friday Expansão — Painel ao vivo de presenças confirmadas

Painel em **Next.js 16 + Tailwind 4** que lê a planilha **Relatório COF** (aba *Qualificação COF 2026*) direto do Google Sheets — sem banco de dados — e mostra em tempo real, até o **evento (27/11)**:

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
- **`/` — campanha (direta):** meta de presenças, na mesa, funil, ranking de presenças e fila de follow-up. É a tela da TV.
- **`/completo` — visão completa:** convites, qualificados, meta de presenças, ranking por leads, etapas no CRM, leads por mês e top estados.

### Testar os alertas
Abra `/?simular=presenca` (ou `convite`, `lead`, `marco`, `meta`). O alerta dispara em 3 s; depois use as teclas **P** (presença), **C** (convite), **L** (lead), **M** (marco), **G** (meta batida), **I** (+5 min sem presença) e **R** (resetar). Para ver o alarme direto: `/?simular=inatividade&minutos=20`.

### Alarme de inatividade: como funciona a trava
- Cada TV guarda o **recorde** de presenças e de convites. **Só um total maior que o recorde zera o relógio.** Desmarcar e marcar a mesma linha volta ao mesmo número, e trocar uma linha por outra também não muda o total — nenhum dos dois zera o relógio nem repete alerta, marco ou grande final.
- O relógio só corre no **expediente** (padrão seg–sex, 08:00–18:00, Brasília). Fora dele o alarme some e a contagem pausa: se a última presença foi às 17:50, às 08:05 do dia seguinte o relógio marca 15 min.
- O recorde fica no navegador da TV e sobrevive a recarregar a página. Ao abrir o painel pela primeira vez numa TV, o relógio começa a contar dali.
- Se for preciso corrigir a planilha para baixo (ex.: marcaram presença errada), o recorde continua alto até ser superado. Para zerar numa TV, abra `/?zerar-recorde` uma vez.
- Se a planilha parar de responder, o alarme some (o painel mostra "reconectando…").

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
NEXT_PUBLIC_EVENT_AT=2026-11-27T19:00:00-03:00
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
| `src/lib/watch.ts` | recorde e relógio de inatividade (expediente, trava contra desmarcar/marcar) |
| `src/components/` | interface |
