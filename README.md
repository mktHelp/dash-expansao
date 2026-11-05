# Black Friday Expansão — Painel ao vivo de leads em COF

Painel em **Next.js 16 + Tailwind 4** que lê a planilha **Relatório COF** (aba *Qualificação COF 2026*) direto do Google Sheets — sem banco de dados — e mostra em tempo real, até **15/11**:

- 🏆 **Ranking de vendedores** (coluna *Responsável*): pódio, "faltam X para passar Fulano", ▲▼ posições nas últimas 24h, selo *on fire* com 3+ leads no dia, qualificados e vendas de cada um
- 🔥 **Alerta de NOVO LEAD** na tela quando alguém adiciona uma linha com Responsável (som opcional)
- **Meta de 200 COFs enviadas** (coluna *COF Enviada* = Sim) e KPIs: total de leads da planilha, hoje vs ontem, qualificados, vendas, etapas no CRM, leads por mês (novembro marcado como Black Friday), top UFs e últimos leads
- Contagem regressiva até 15/11

Atualiza a cada 15 s. **E-mail, WhatsApp e capital nunca saem do servidor**; o candidato aparece como "Maria S.".

### Duas telas
- **`/` — campanha (direta):** meta de COFs enviadas em destaque, ranking de vendedores e últimos leads. É a tela da TV durante a Black.
- **`/completo` — visão completa:** tudo acima + qualificados, etapas no CRM, leads por mês e top estados. Para usar depois da Black.

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
| **Responsável** | **ranking de vendedores** | ⚠️ **NOVA** |
| **COF Enviada** | **meta: cada "Sim" = 1 ponto, de 200** | ⚠️ **NOVA** |

### Como adicionar as duas colunas
1. Clique com o botão direito no cabeçalho da **coluna Q** (a coluna vazia entre *Como foi encontrado* e o *Resumo*) → **Inserir 2 colunas à esquerda**.
2. Em **Q1** escreva `Responsável` e em **R1** escreva `COF Enviada`.
3. Selecione a coluna Q → **Dados > Validação de dados > Menu suspenso** com o nome de cada vendedor.
4. Selecione a coluna R → **Inserir > Caixa de seleção** *ou* menu suspenso com `Sim` e `Não`.

O resumo anda duas colunas para a direita e as fórmulas dele se ajustam sozinhas. Enquanto as colunas não existirem, o painel mostra um aviso amarelo.

**Regras**
- **Tudo conta:** o painel considera **todas as linhas da planilha**, de qualquer data (desde maio), não só novembro.
- **Meta (200):** linhas com **COF Enviada = Sim**. "Não" ou vazio não contam.
- **Meta do dia:** (200 − COFs enviadas até ontem) ÷ dias que faltam até 15/11, contando hoje, arredondado para cima. "Enviadas hoje" = COF Enviada = Sim **com Data de envio = hoje**. Quando bate, toca uma buzina e aparece "META DO DIA BATIDA!".
- **Empate:** quem tem o mesmo nº de leads divide a posição (1º, 1º, 3º) e aparece com o selo EMPATE.
- **Ranking:** leads com **Responsável** preenchido. Desempate: mais COFs enviadas → mais vendas → mais qualificados → quem chegou primeiro.
- Linha sem Responsável conta no total, mas não pontua para ninguém (o painel avisa quantas estão assim).
- **Alertas na tela:** "NOVO LEAD NA COF!" quando a linha ganha um Responsável; "+1 NA META! COF ENVIADA" quando a COF Enviada vira Sim.

## 2. Conectar a planilha

### Opção A — só o ID (o mais simples)
Funciona porque a planilha está compartilhada como *Qualquer pessoa com o link*. Na Vercel (*Settings > Environment Variables*) e no `.env.local`:

```
GOOGLE_SHEET_ID=<trecho da URL entre /d/ e /edit>
GOOGLE_SHEET_GID=0
META_COF=200
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
| `src/lib/config.ts` | fim da contagem regressiva, dia da Black Friday, ordem das etapas do CRM, intervalo de atualização |
| `src/lib/sheets.ts` | leitura da planilha e nomes de colunas aceitos |
| `src/lib/stats.ts` | cálculo de ranking, etapas e métricas |
| `src/components/` | interface |
