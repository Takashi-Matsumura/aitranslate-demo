// 主翻訳をトークン単位でストリーム返却する Route Handler (Next.js 16, Web Streams)。

import { chatStream, LlamaUnreachableError } from "@/lib/llama";
import { buildTranslateMessages } from "@/lib/prompts";
import { isSourceLang, isTargetLang } from "@/lib/languages";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const { text, source, target } = (body ?? {}) as Record<string, unknown>;

  if (typeof text !== "string" || text.trim().length === 0) {
    return Response.json({ error: "翻訳するテキストを入力してください" }, { status: 400 });
  }
  if (!isSourceLang(source) || !isTargetLang(target)) {
    return Response.json({ error: "言語の指定が不正です" }, { status: 400 });
  }
  if (source === target) {
    return Response.json(
      { error: "原文と訳文の言語が同じです" },
      { status: 400 },
    );
  }

  const messages = buildTranslateMessages(text, source, target);
  const encoder = new TextEncoder();

  // 初回トークン前の不達は 502 にできるよう、最初のデルタを先に取得しておく。
  let gen: AsyncGenerator<string>;
  let first: IteratorResult<string>;
  try {
    gen = chatStream(messages, { temperature: 0.2 });
    first = await gen.next();
  } catch (err) {
    if (err instanceof LlamaUnreachableError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "翻訳に失敗しました" },
      { status: 502 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done && first.value) {
          controller.enqueue(encoder.encode(first.value));
        }
        for await (const delta of gen) {
          controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (err) {
        // ストリーム途中のエラーはストリームを error 化（クライアントは中断を検知）。
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
