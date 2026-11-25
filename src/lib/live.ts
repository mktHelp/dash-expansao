"use client";
// Peças ao vivo compartilhadas pelos painéis (presenças e funil): relógio de
// 1 s, som (WebAudio) e trava contra recarregar em loop na troca de versão.
import { useSyncExternalStore } from "react";

// ---- relógio (1s) sem setState em efeito ----
const subscribeClock = (cb: () => void) => {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
};
const clockSnapshot = () => Math.floor(Date.now() / 1000) * 1000;
const serverClock = () => 0;
export function useClock() {
  return useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
}

// ---- som de "novo lead" (WebAudio, sem arquivo) ----
// Um AudioContext só, reaproveitado. O Chrome só libera som depois de um
// clique/tecla na página (ou com --autoplay-policy=no-user-gesture-required
// no atalho do navegador da TV); por isso tentamos "destravar" em toda interação.
let audioCtx: AudioContext | null = null;
export function getAudio(): AudioContext | null {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

export function playChaChing() {
  const ctx = getAudio();
  if (!ctx) return;
  [880, 1320].forEach((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.4);
  });
}

// sirene curta do alarme de inatividade (sobe e desce 3 vezes)
export function playSiren() {
  const ctx = getAudio();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sawtooth";
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    o.frequency.setValueAtTime(620, t + i * 0.6);
    o.frequency.linearRampToValueAtTime(1050, t + i * 0.6 + 0.3);
    o.frequency.linearRampToValueAtTime(620, t + i * 0.6 + 0.6);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
  g.gain.setValueAtTime(0.12, t + 1.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.85);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 1.9);
}

// estado do áudio ("running" = liberado). Usado para avisar quando o
// navegador bloqueou o som até alguém clicar na página.
export const subscribeAudio = (cb: () => void) => {
  const ctx = getAudio();
  ctx?.addEventListener("statechange", cb);
  return () => ctx?.removeEventListener("statechange", cb);
};
export const readAudioState = () => audioCtx?.state ?? "suspended";
export const serverAudioState = () => "running";

// trava contra recarregar em loop (ex.: durante a troca de versão na Vercel)
export function reloadedRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem("dash-reload") ?? 0);
    if (Date.now() - last < 120_000) return true;
    sessionStorage.setItem("dash-reload", String(Date.now()));
  } catch {
    /* sem storage: recarrega mesmo assim */
  }
  return false;
}
