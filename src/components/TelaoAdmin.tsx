"use client";

import { useState, useSyncExternalStore } from "react";
import { ImagePlus, KeyRound, Loader2, Megaphone, MonitorUp, Trash2, TriangleAlert } from "lucide-react";
import type { TelaoMeta } from "@/lib/types";

// ---- senha lembrada neste aparelho (conveniência; o servidor é quem confere) ----
const PASS_KEY = "telao-senha";
const readSaved = () => {
  try {
    return localStorage.getItem(PASS_KEY) ?? "";
  } catch {
    return "";
  }
};
const save = (v: string) => {
  try {
    if (v) localStorage.setItem(PASS_KEY, v);
    else localStorage.removeItem(PASS_KEY);
  } catch {
    /* sem storage: pede a senha de novo da próxima vez */
  }
};
const noopSubscribe = () => () => {};

// ---- reduz a imagem no navegador antes de mandar (cabe no Redis gratuito) ----
const MAX_CHARS = 1_350_000;
const TRIES: [number, number][] = [
  [1920, 0.86],
  [1600, 0.8],
  [1280, 0.75],
  [1024, 0.7],
  [800, 0.65],
];

type Prepared = { dataUrl: string; w: number; h: number; kb: number; gif: boolean };

// GIF vai inteiro (reduzir pelo canvas congelaria a animação no 1º quadro)
const MAX_GIF_BYTES = 3 * 1024 * 1024;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não consegui ler esse arquivo."));
    r.readAsDataURL(file);
  });

async function prepare(file: File): Promise<Prepared> {
  if (file.type === "image/gif") {
    if (file.size > MAX_GIF_BYTES)
      throw new Error(`Esse GIF tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é 3 MB.`);
    const bmp = await createImageBitmap(file); // só para saber largura e altura
    const size = { w: bmp.width, h: bmp.height };
    bmp.close();
    return { dataUrl: await readAsDataUrl(file), ...size, kb: Math.round(file.size / 1024), gif: true };
  }
  const bmp = await createImageBitmap(file);
  try {
    for (const [max, q] of TRIES) {
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
      let dataUrl = canvas.toDataURL("image/webp", q);
      // navegador sem WebP devolve PNG: cai para JPEG (fundo branco)
      if (!dataUrl.startsWith("data:image/webp")) {
        const ctx = canvas.getContext("2d")!;
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        dataUrl = canvas.toDataURL("image/jpeg", q);
      }
      if (dataUrl.length <= MAX_CHARS) return { dataUrl, w, h, kb: Math.round((dataUrl.length * 0.75) / 1024), gif: false };
    }
  } finally {
    bmp.close();
  }
  throw new Error("Imagem pesada demais mesmo reduzida. Tente outra.");
}

const clock = (ts: number) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(ts);

export default function TelaoAdmin() {
  const saved = useSyncExternalStore(noopSubscribe, readSaved, () => "");
  const [typed, setTyped] = useState<string | null>(null);
  const pass = typed ?? saved;

  const [authed, setAuthed] = useState(false);
  const [current, setCurrent] = useState<TelaoMeta | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [legenda, setLegenda] = useState("");
  const [busy, setBusy] = useState<null | "login" | "prep" | "send" | "remove">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function call(method: "GET" | "POST" | "DELETE", body?: unknown) {
    const res = await fetch("/api/telao", {
      method,
      headers: { Authorization: `Bearer ${pass}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { telao?: TelaoMeta | null; error?: string };
    if (!res.ok) throw Object.assign(new Error(json.error ?? `Erro ${res.status}`), { status: res.status });
    return json.telao ?? null;
  }

  async function login() {
    setBusy("login");
    setMsg(null);
    try {
      setCurrent(await call("GET"));
      setAuthed(true);
      save(pass);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Não deu para entrar." });
      if ((e as { status?: number }).status === 401) save("");
    } finally {
      setBusy(null);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy("prep");
    setMsg(null);
    try {
      setPrepared(await prepare(file));
    } catch (e) {
      setPrepared(null);
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Não consegui abrir essa imagem." });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!prepared) return;
    setBusy("send");
    setMsg(null);
    try {
      setCurrent(await call("POST", { image: prepared.dataUrl, w: prepared.w, h: prepared.h, legenda }));
      setPrepared(null);
      setLegenda("");
      setMsg({ kind: "ok", text: "No ar! Aparece em todas as telas em até 15 segundos." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Não consegui mandar." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setMsg(null);
    try {
      await call("DELETE");
      setCurrent(null);
      setMsg({ kind: "ok", text: "Removida. Some de todas as telas em até 15 segundos." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Não consegui remover." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 py-6">
      <header>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-zinc-400">
          <Megaphone size={14} className="text-bf" /> Black Friday Expansão
        </p>
        <h1 className="font-display text-5xl tracking-wide text-bf">TELÃO</h1>
        <p className="text-sm text-zinc-400">
          A imagem aparece num quadro grande no centro de todas as telas do painel até você remover.
        </p>
      </header>

      {msg && (
        <p
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            msg.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      {!authed ? (
        <form
          className="panel flex flex-col gap-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-400" htmlFor="senha">
            <KeyRound size={14} className="text-bf" /> Senha do telão
          </label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setTyped(e.target.value)}
            className="rounded-xl border border-line bg-zinc-900 px-4 py-3 text-lg outline-none focus:border-bf"
          />
          <button
            type="submit"
            disabled={!pass || busy === "login"}
            className="flex items-center justify-center gap-2 rounded-xl bg-bf px-4 py-3 font-display text-xl tracking-wide sm:text-2xl text-ink disabled:opacity-50"
          >
            {busy === "login" && <Loader2 size={20} className="animate-spin" />} ENTRAR
          </button>
        </form>
      ) : (
        <>
          <section className="panel p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-2xl tracking-wide">
              <MonitorUp size={20} className="text-bf" /> NO AR AGORA
            </h2>
            {current ? (
              <div className="flex flex-col gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/telao/imagem?id=${current.id}`}
                  alt={current.legenda || "Imagem no telão"}
                  className="max-h-72 w-full rounded-xl bg-zinc-900 object-contain"
                />
                <p className="text-sm text-zinc-400">
                  {current.legenda ? <b className="text-white">{current.legenda}</b> : "Sem legenda"} · desde {clock(current.at)}
                </p>
                <button
                  onClick={() => void remove()}
                  disabled={busy !== null}
                  className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-display text-xl tracking-wide sm:text-2xl text-white disabled:opacity-50"
                >
                  {busy === "remove" ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />} REMOVER DE TODAS AS TELAS
                </button>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Nada no ar. As telas mostram só o painel.</p>
            )}
          </section>

          <section className="panel flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide">
              <ImagePlus size={20} className="text-bf" /> {current ? "TROCAR A IMAGEM" : "MANDAR IMAGEM"}
            </h2>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-zinc-400 hover:border-bf/60">
              {busy === "prep" ? (
                <Loader2 size={28} className="animate-spin text-bf" />
              ) : prepared ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={prepared.dataUrl} alt="Prévia" className="max-h-64 w-full rounded-lg object-contain" />
              ) : (
                <ImagePlus size={28} className="text-bf" />
              )}
              <span>
                {prepared
                  ? `${prepared.gif ? "GIF animado, " : ""}${prepared.w}×${prepared.h}, ${prepared.kb} KB. Toque para trocar.`
                  : "Toque para escolher uma imagem ou GIF (JPG, PNG, WebP, GIF até 3 MB)"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  void pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <input
              type="text"
              maxLength={80}
              placeholder="Legenda (opcional) — ex.: Parabéns, Valmor!"
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              className="rounded-xl border border-line bg-zinc-900 px-4 py-3 outline-none focus:border-bf"
            />
            <button
              onClick={() => void send()}
              disabled={!prepared || busy !== null}
              className="flex items-center justify-center gap-2 rounded-xl bg-bf px-4 py-3 font-display text-xl tracking-wide sm:text-2xl text-ink disabled:opacity-40"
            >
              {busy === "send" ? <Loader2 size={20} className="animate-spin" /> : <MonitorUp size={20} />}
              {current ? "SUBSTITUIR EM TODAS AS TELAS" : "MOSTRAR EM TODAS AS TELAS"}
            </button>
            <p className="flex items-start gap-1.5 text-xs text-zinc-500">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              A imagem fica no ar até alguém remover aqui. Fotos são reduzidas no seu aparelho; GIFs vão inteiros, até 3 MB.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
