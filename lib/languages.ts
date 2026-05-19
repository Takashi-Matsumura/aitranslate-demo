// 共有の言語定義。クライアント/サーバ双方から import 可能（process.env を読まない）。

export type TargetLang = "ja" | "en" | "vi";
export type SourceLang = "auto" | TargetLang;

export const SOURCE_LANGS: SourceLang[] = ["auto", "ja", "en", "vi"];
export const TARGET_LANGS: TargetLang[] = ["vi", "ja", "en"];

const NAMES: Record<SourceLang, string> = {
  auto: "自動検出",
  ja: "日本語",
  en: "English",
  vi: "Tiếng Việt (ベトナム語)",
};

// プロンプト内で使う英語の言語名（モデルへの指示用）。
const ENGLISH_NAMES: Record<TargetLang, string> = {
  ja: "Japanese",
  en: "English",
  vi: "Vietnamese",
};

export function langLabel(lang: SourceLang): string {
  return NAMES[lang];
}

export function englishName(lang: TargetLang): string {
  return ENGLISH_NAMES[lang];
}

export function isTargetLang(v: unknown): v is TargetLang {
  return v === "ja" || v === "en" || v === "vi";
}

export function isSourceLang(v: unknown): v is SourceLang {
  return v === "auto" || isTargetLang(v);
}
