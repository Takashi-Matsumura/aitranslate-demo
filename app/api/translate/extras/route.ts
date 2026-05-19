// 深掘りパネル用: 逆翻訳 → 品質講評 → トーン3案を逐次生成して JSON 返却。

import { chatComplete, LlamaUnreachableError } from "@/lib/llama";
import {
  buildBackTranslateMessages,
  buildCritiqueMessages,
  buildVariantsMessages,
  parseCritique,
  parseVariants,
} from "@/lib/prompts";
import { isSourceLang, isTargetLang } from "@/lib/languages";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const { text, source, target, primaryTranslation } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof text !== "string" || text.trim().length === 0) {
    return Response.json({ error: "原文がありません" }, { status: 400 });
  }
  if (
    typeof primaryTranslation !== "string" ||
    primaryTranslation.trim().length === 0
  ) {
    return Response.json({ error: "訳文がありません" }, { status: 400 });
  }
  if (!isSourceLang(source) || !isTargetLang(target)) {
    return Response.json({ error: "言語の指定が不正です" }, { status: 400 });
  }

  try {
    // llama.cpp は単一モデルなので逐次に実行する。
    const backTranslation = await chatComplete(
      buildBackTranslateMessages(primaryTranslation, target),
      { temperature: 0.2 },
    );

    const critiqueRaw = await chatComplete(
      buildCritiqueMessages(
        text,
        primaryTranslation,
        backTranslation,
        source,
        target,
      ),
      { temperature: 0.3 },
    );

    const variantsRaw = await chatComplete(
      buildVariantsMessages(text, source, target),
      { temperature: 0.7 },
    );

    return Response.json({
      backTranslation,
      critique: parseCritique(critiqueRaw),
      variants: parseVariants(variantsRaw),
    });
  } catch (err) {
    if (err instanceof LlamaUnreachableError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "深掘り生成に失敗しました" },
      { status: 502 },
    );
  }
}
