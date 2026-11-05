// Configurações da campanha. Datas no fuso de Brasília (UTC-3).
// CAMPAIGN_START = início da corrida: antes dele não há "vs ontem" nem
// setas de subiu/caiu no ranking (os totais continuam contando a planilha toda).
// Podem ser sobrescritas por variáveis de ambiente NEXT_PUBLIC_* na Vercel.

export const CAMPAIGN_START = new Date(
  process.env.NEXT_PUBLIC_CAMPAIGN_START ?? "2026-11-05T00:00:00-03:00",
).getTime();

export const CAMPAIGN_END = new Date(
  process.env.NEXT_PUBLIC_CAMPAIGN_END ?? "2026-11-30T23:59:59-03:00",
).getTime();

// Dia da Black Friday (destacado no gráfico diário) — formato AAAA-MM-DD.
export const BLACK_FRIDAY_DAY = process.env.NEXT_PUBLIC_BLACK_FRIDAY_DAY ?? "2026-11-27";

// Ordem das etapas do CRM no funil (coluna "Etapa atual no CRM").
// O nome do dono entre parênteses ou depois de " - " é ignorado:
// "Qualificação (Valmor)" e "Reunião de Perfil - Rober" viram
// "Qualificação" e "Reunião de Perfil". A comparação ignora maiúsculas e
// acentos. Etapas que não estão na lista aparecem antes de "Venda Perdida".
export const STAGES = (
  process.env.NEXT_PUBLIC_STAGES ??
  [
    "Cliente Potencial",
    "Contactado",
    "Qualificação",
    "Envio COF e Materiais",
    "Reunião de Perfil",
    "Primeira Reunião",
    "Segunda Reunião",
    "Remarcando Reunião",
    "Reunião de Indicadores",
    "Consulta de Antecedente + Envio Contrato",
    "Consulta de Dados e Contrato",
    "Venda Perdida",
  ].join(",")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const LOST_STAGE = "Venda Perdida";

// Intervalo de atualização do painel (ms).
export const POLL_MS = 15_000;

export const TIMEZONE = "America/Sao_Paulo";
