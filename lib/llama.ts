// サーバ専用。OpenAI 互換 (/v1/chat/completions) の llama.cpp クライアント。
// "use client" ファイルから絶対に import しないこと（process.env を読む）。
// 利用は Route Handler 経由のみ。

const BASE_URL = process.env.LLAMA_BASE_URL ?? "http://localhost:8080";
const MODEL = process.env.LLAMA_MODEL ?? "gemma";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

// llama.cpp 不達・接続不能を表す型付きエラー。Route Handler 側で 502 にマップする。
export class LlamaUnreachableError extends Error {
  constructor(cause?: unknown) {
    super(`llama.cpp サーバに接続できません (${BASE_URL})`);
    this.name = "LlamaUnreachableError";
    this.cause = cause;
  }
}

const ENDPOINT = `${BASE_URL}/v1/chat/completions`;

async function postChat(
  messages: ChatMessage[],
  stream: boolean,
  opts: ChatOptions,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1024,
      }),
      signal: opts.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new LlamaUnreachableError(err);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`llama.cpp が ${res.status} を返しました: ${detail.slice(0, 200)}`);
  }
  return res;
}

// ストリーミング: SSE デルタを順次 yield する async generator。
export async function* chatStream(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string> {
  const res = await postChat(messages, true, opts);
  if (!res.body) throw new LlamaUnreachableError();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 最終要素は未完行として持ち越す

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || !line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta: string | undefined = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // 不完全な JSON 断片はスキップ（次チャンクで揃う）
      }
    }
  }
}

// 非ストリーミング: 生成全文を返す。
export async function chatComplete(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const res = await postChat(messages, false, opts);
  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  return (content ?? "").trim();
}
