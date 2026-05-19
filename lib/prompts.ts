// プロンプト生成とパース。ベトナム語の忠実度（声調記号）確保が最重要。

import type { ChatMessage } from "./llama";
import { englishName, langLabel, type SourceLang, type TargetLang } from "./languages";

// 全プロンプト共通の翻訳制約。
function commonRules(target: TargetLang): string {
  const base = [
    "You are a professional translator.",
    "Output ONLY the translation. No preamble, no notes, no explanation, no surrounding quotes, no language labels, no markdown.",
    "Preserve proper nouns (people, places, brands, product names) as-is unless a standard localized form exists.",
    "Keep numbers, units, URLs and formatting consistent with the source.",
  ];
  if (target === "vi") {
    base.push(
      "Write natural, modern Vietnamese with FULLY correct diacritics and tone marks (dấu). " +
        "Never output Vietnamese stripped of diacritics. Use correct ơ, ư, đ, â, ê, ô and all tone marks.",
    );
  }
  return base.join(" ");
}

function sourceClause(source: SourceLang): string {
  return source === "auto"
    ? "Detect the source language automatically."
    : `The source text is in ${englishName(source)}.`;
}

// (a) 主翻訳: 中立レジスタの最良訳1つ。
export function buildTranslateMessages(
  text: string,
  source: SourceLang,
  target: TargetLang,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `${commonRules(target)} ${sourceClause(
        source,
      )} Translate into ${englishName(target)} with a neutral, natural register.`,
    },
    { role: "user", content: text },
  ];
}

// (b) 逆翻訳: target → 日本語。意味ズレ検出のため流暢さより忠実さを優先。
export function buildBackTranslateMessages(
  targetText: string,
  target: TargetLang,
): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You are a translator producing a faithful back-translation for quality review. " +
        `Translate the following ${englishName(target)} text into Japanese as literally and ` +
        "faithfully as possible, prioritizing fidelity over fluency so a reviewer can detect " +
        "meaning drift, omissions or additions. Output ONLY the Japanese translation.",
    },
    { role: "user", content: targetText },
  ];
}

// (c) 品質講評: 日本語強制。1行目スコア + コメント。
export function buildCritiqueMessages(
  sourceText: string,
  primaryTranslation: string,
  backTranslation: string,
  source: SourceLang,
  target: TargetLang,
): ChatMessage[] {
  const srcLabel = source === "auto" ? "原文" : `原文(${langLabel(source)})`;
  return [
    {
      role: "system",
      content:
        "あなたは翻訳品質の評価者です。原文・訳文・その逆翻訳を読み、忠実度・訳抜け・誤訳・" +
        "ニュアンスのズレを評価してください。出力は必ず日本語で、次の形式を厳守すること:\n" +
        "1行目: 「スコア: X/5」(X は 1〜5 の整数)\n" +
        "2行目以降: 1〜2文の簡潔な講評。\n" +
        "前置きや余計な記号は出力しないこと。",
    },
    {
      role: "user",
      content:
        `${srcLabel}:\n${sourceText}\n\n` +
        `訳文(${langLabel(target)}):\n${primaryTranslation}\n\n` +
        `訳文を日本語へ逆翻訳したもの:\n${backTranslation}`,
    },
  ];
}

// (d) トーン3案: 区切り付きで要求しサーバ側でパース。
export function buildVariantsMessages(
  text: string,
  source: SourceLang,
  target: TargetLang,
): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        `${commonRules(target)} ${sourceClause(source)} ` +
        `Produce THREE translations into ${englishName(target)} in different registers. ` +
        "Output EXACTLY in this format, each on its own line, nothing else:\n" +
        "【フォーマル】<formal/polite translation>\n" +
        "【カジュアル】<casual/friendly translation>\n" +
        "【ビジネス】<business/professional translation>",
    },
    { role: "user", content: text },
  ];
}

// --- パーサ ---

export interface Critique {
  scoreText: string;
  comment: string;
}

export function parseCritique(raw: string): Critique {
  const text = raw.trim();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { scoreText: "", comment: text };

  const first = lines[0];
  if (/スコア|score|\/\s*5/i.test(first)) {
    return { scoreText: first, comment: lines.slice(1).join(" ").trim() };
  }
  // 想定形式でなければ全文を comment にフォールバック。
  return { scoreText: "", comment: text };
}

export interface Variants {
  formal: string;
  casual: string;
  business: string;
}

export function parseVariants(raw: string): Variants {
  const text = raw.trim();
  const pick = (label: string): string => {
    // 【ラベル】... を次のラベルまたは末尾まで取得。
    const re = new RegExp(`【${label}】\\s*([\\s\\S]*?)(?=【(?:フォーマル|カジュアル|ビジネス)】|$)`);
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  const formal = pick("フォーマル");
  const casual = pick("カジュアル");
  const business = pick("ビジネス");

  // パース失敗時は全文を formal に入れて他は空（UI 側でハンドリング）。
  if (!formal && !casual && !business) {
    return { formal: text, casual: "", business: "" };
  }
  return { formal, casual, business };
}
