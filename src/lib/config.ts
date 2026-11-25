// Configurações da campanha. Datas no fuso de Brasília (UTC-3).
// CAMPAIGN_START = início da corrida: antes dele não há "vs ontem" nem
// setas de subiu/caiu no ranking (os totais continuam contando a planilha toda).
// Podem ser sobrescritas por variáveis de ambiente NEXT_PUBLIC_* na Vercel.

export const CAMPAIGN_START = new Date(
  process.env.NEXT_PUBLIC_CAMPAIGN_START ?? "2026-11-05T00:00:00-03:00",
).getTime();

// EVENT_AT = data e hora do evento: usada pela contagem regressiva.
export const EVENT_AT = new Date(
  process.env.NEXT_PUBLIC_EVENT_AT ?? "2026-11-25T19:00:00-03:00",
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

// ---- Alarme de inatividade ----
// Minutos sem presença confirmada NOVA (ou convite novo) até o alerta vermelho aparecer.
export const ALERT_PRESENCA_MIN = Number(process.env.NEXT_PUBLIC_ALERTA_PRESENCA_MIN ?? 5) || 5;
export const ALERT_CONVITE_MIN = Number(process.env.NEXT_PUBLIC_ALERTA_CONVITE_MIN ?? 5) || 5;
// Expediente: o relógio só corre nesse horário (Brasília) e nesses dias
// (0 = domingo … 6 = sábado). Fora dele o alarme some e o relógio pausa,
// para a TV não amanhecer mostrando "840 minutos sem presença".
export const WORK_HOURS = process.env.NEXT_PUBLIC_EXPEDIENTE ?? "08:00-18:00";
export const WORK_DAYS = (process.env.NEXT_PUBLIC_DIAS_EXPEDIENTE ?? "1,2,3,4,5")
  .split(",")
  .map((d) => Number(d.trim()))
  .filter((d) => d >= 0 && d <= 6);
