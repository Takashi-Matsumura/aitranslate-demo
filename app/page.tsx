"use client";

import { useState } from "react";
import {
  SOURCE_LANGS,
  TARGET_LANGS,
  langLabel,
  type SourceLang,
  type TargetLang,
} from "@/lib/languages";

interface Critique {
  scoreText: string;
  comment: string;
}
interface Variants {
  formal: string;
  casual: string;
  business: string;
}
interface Extras {
  backTranslation: string;
  critique: Critique;
  variants: Variants;
}

const SAMPLES = [
  "ご多忙のところ恐縮ですが、来週月曜日までにご返信いただけますと幸いです。",
  "この製品は防水性能を備えており、最大2メートルの水深で30分間使用できます。",
  "Could you walk me through the onboarding process for new contractors?",
];

export default function Home() {
  const [source, setSource] = useState<SourceLang>("ja");
  const [target, setTarget] = useState<TargetLang>("vi");
  const [inputText, setInputText] = useState("");

  const [streamingOutput, setStreamingOutput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [extras, setExtras] = useState<Extras | null>(null);
  const [isLoadingExtras, setIsLoadingExtras] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const busy = isStreaming || isLoadingExtras;

  function swap() {
    if (source === "auto") return;
    const s = source;
    setSource(target);
    setTarget(s as TargetLang);
  }

  async function fetchExtras(primaryTranslation: string) {
    setIsLoadingExtras(true);
    try {
      const res = await fetch("/api/translate/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, source, target, primaryTranslation }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "深掘り生成に失敗しました");
        return;
      }
      setExtras((await res.json()) as Extras);
    } catch {
      setError("深掘り生成に失敗しました（ネットワークエラー）");
    } finally {
      setIsLoadingExtras(false);
    }
  }

  async function handleTranslate() {
    const text = inputText.trim();
    if (!text) {
      setError("翻訳するテキストを入力してください");
      return;
    }
    if (source === target) {
      setError("原文と訳文の言語が同じです");
      return;
    }

    setError(null);
    setStreamingOutput("");
    setExtras(null);
    setIsStreaming(true);

    let acc = "";
    try {
      const res = await fetch("/api/translate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source, target }),
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "翻訳に失敗しました");
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // 多バイト文字（ベトナム語/日本語）が分割されても壊れないよう stream:true 必須。
        acc += decoder.decode(value, { stream: true });
        setStreamingOutput(acc);
      }
      acc += decoder.decode();
      setStreamingOutput(acc);
    } catch {
      setError("翻訳に失敗しました（ネットワークエラー / ストリーム中断）");
      setIsStreaming(false);
      return;
    }

    setIsStreaming(false);
    if (acc.trim()) {
      await fetchExtras(acc.trim());
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">AI 翻訳力デモ — ベトナム語</h1>
        <p className="mt-2 text-sm opacity-70">
          ローカル LLM (Gemma / llama.cpp) の翻訳力を、逆翻訳・品質講評・トーン別バリエーションで可視化します。
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {/* 入力カード */}
      <section className="rounded-xl border border-black/10 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className="opacity-70">原文の言語</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as SourceLang)}
              className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
            >
              {SOURCE_LANGS.map((l) => (
                <option key={l} value={l} className="text-black">
                  {langLabel(l)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={swap}
            disabled={source === "auto" || busy}
            title="原文⇄訳文を入れ替え"
            className="mb-[2px] rounded-md border border-black/15 px-3 py-2 text-sm transition hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
          >
            ⇄
          </button>

          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className="opacity-70">訳文の言語</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as TargetLang)}
              className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
            >
              {TARGET_LANGS.map((l) => (
                <option key={l} value={l} className="text-black">
                  {langLabel(l)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="翻訳したいテキストを入力…"
          rows={5}
          className="w-full resize-y rounded-lg border border-black/15 bg-transparent p-3 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {SAMPLES.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInputText(s)}
              disabled={busy}
              className="rounded-full border border-black/15 px-3 py-1 text-xs opacity-70 transition hover:opacity-100 disabled:opacity-30 dark:border-white/15"
            >
              例文 {i + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={handleTranslate}
            disabled={busy || !inputText.trim()}
            className="ml-auto rounded-lg bg-foreground px-6 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {isStreaming ? "翻訳中…" : "翻訳"}
          </button>
        </div>
      </section>

      {/* 翻訳結果（ストリーミング） */}
      {(isStreaming || streamingOutput) && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold opacity-70">翻訳結果</h2>
          <div
            aria-live="polite"
            className="min-h-[3rem] whitespace-pre-wrap rounded-xl border border-black/10 bg-black/[0.02] p-4 text-base leading-relaxed dark:border-white/10 dark:bg-white/[0.03]"
          >
            {streamingOutput}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-current align-middle" />
            )}
          </div>
        </section>
      )}

      {/* 深掘り: トーン別 + 逆翻訳/講評 */}
      {(isLoadingExtras || extras) && (
        <section className="mt-8 space-y-6">
          <h2 className="text-sm font-semibold opacity-70">
            深掘り{isLoadingExtras && "（生成中…）"}
          </h2>

          {isLoadingExtras && !extras && (
            <div className="animate-pulse text-sm opacity-50">
              逆翻訳・品質講評・トーン別を生成しています…
            </div>
          )}

          {extras && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ["フォーマル", extras.variants.formal],
                    ["カジュアル", extras.variants.casual],
                    ["ビジネス", extras.variants.business],
                  ] as const
                ).map(([label, val]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="mb-2 text-xs font-semibold opacity-60">{label}</div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {val || <span className="opacity-40">（取得できませんでした）</span>}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-black/10 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                <h3 className="mb-3 text-sm font-semibold">逆翻訳と品質評価</h3>
                <div className="mb-4">
                  <div className="mb-1 text-xs font-medium opacity-60">
                    訳文 → 日本語（逆翻訳）
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {extras.backTranslation}
                  </p>
                </div>
                <div className="rounded-lg bg-black/[0.04] p-3 dark:bg-white/[0.05]">
                  {extras.critique.scoreText && (
                    <div className="mb-1 text-sm font-bold">
                      {extras.critique.scoreText}
                    </div>
                  )}
                  <p className="text-sm leading-relaxed opacity-90">
                    {extras.critique.comment}
                  </p>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
