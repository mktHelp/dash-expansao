// Dados fictícios usados quando nenhuma planilha está configurada.
// Mesmo formato da aba "Qualificação COF 2026" + coluna "Responsável".
// Gera leads de forma determinística ao longo do tempo, então novos leads
// "aparecem" sozinhos enquanto o painel está aberto.
import { CAMPAIGN_START } from "./config";

const VENDEDORES = ["Ana Paula", "Bruno Lima", "Carla Mendes", "Diego Rocha", "Fernanda Alves", "Gustavo Reis", "Juliana Costa", "Rafael Souza"];
const NOMES = ["João Pereira", "Mariana Silva", "Lucas Oliveira", "Patrícia Gomes", "Thiago Martins", "Camila Ribeiro", "Rodrigo Santos", "Aline Ferreira", "Felipe Carvalho", "Beatriz Nunes", "André Barbosa", "Larissa Moraes", "Marcelo Teixeira", "Vanessa Duarte"];
const CIDADES: [string, string][] = [
  ["São Paulo", "SP"], ["Campinas", "SP"], ["Rio de Janeiro", "RJ"], ["Belo Horizonte", "MG"],
  ["Curitiba", "PR"], ["Porto Alegre", "RS"], ["Salvador", "BA"], ["Recife", "PE"],
  ["Goiânia", "GO"], ["Florianópolis", "SC"], ["Fortaleza", "CE"], ["Brasília", "DF"],
  ["Ribeirão Preto", "SP"], ["Uberlândia", "MG"], ["Londrina", "PR"],
];
// etapas do CRM, na ordem em que o lead avança
const ETAPAS = [
  "Envio Cof e Materiais",
  "Qualificação (Valmor)",
  "Reunião de Perfil - Rober",
  "Segunda Reunião",
  "Reunião de Indicadores (Fernando)",
  "Consulta de Dados e Contrato (Carla)",
];
const QUALIF = ["Qualificado", "Não qualificado", "Sem informação de capital"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function rng(seed: number) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function brt(ts: number) {
  const d = new Date(ts - 3 * 3600_000); // Brasília
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`, month: MESES[d.getUTCMonth()] };
}

export function demoRows(now: number): string[][] {
  const rows: string[][] = [[
    "Mês COF", "Data de envio", "Candidato", "WhatsApp", "E-mail", "Cidade", "UF", "Qualificação",
    "Capital declarado no CRM", "Etapa atual no CRM", "Etapa anterior no CRM", "Categoria atual (TurboCRM)",
    "Categoria anterior (TurboCRM)", "Venda efetivada", "Encontrado em", "Como foi encontrado", "Responsável", "COF Enviada",
    "Convite Enviado", "Presença Confirmada",
  ]];
  const SLOT = 2 * 60_000;
  for (let ts = CAMPAIGN_START, k = 0; ts <= now; ts += SLOT, k++) {
    if (rng(k) > 0.06) continue;
    const r = (n: number) => rng(k * 31 + n);
    // vendedores com "pesos" diferentes para o ranking ficar disputado
    const v = VENDEDORES[Math.floor(Math.pow(r(1), 1.6) * VENDEDORES.length)];
    const [cidade, uf] = CIDADES[Math.floor(r(2) * CIDADES.length)];
    const age = (now - ts) / 86_400_000;
    const maxStage = Math.min(ETAPAS.length - 1, Math.floor(age / 0.8));
    const lost = age > 1.5 && r(6) < 0.25;
    const etapa = lost ? "Venda Perdida" : ETAPAS[Math.floor(r(3) * (maxStage + 1))];
    const venda = etapa.startsWith("Consulta de Dados") && r(7) < 0.4 ? "Sim" : "";
    const { date, month } = brt(ts);
    rows.push([
      month, date, NOMES[Math.floor(r(4) * NOMES.length)], "", "", cidade, uf,
      QUALIF[Math.floor(r(5) * QUALIF.length)], "", etapa, "", "", "", venda, "", "",
      r(8) < 0.04 ? "" : v, // alguns sem responsável, como acontece na vida real
      r(9) < 0.7 ? "Sim" : "Não",
      r(9) < 0.4 ? "Sim" : "", // convite só sai para quem recebeu COF
      r(9) < 0.2 ? "Sim" : "", // e a presença, só para quem recebeu convite
    ]);
  }
  return rows;
}
