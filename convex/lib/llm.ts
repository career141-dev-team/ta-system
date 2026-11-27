"use node";

import OpenAI from "openai";
import type { ActionCtx } from "../_generated/server";
import { isCompleteJson, hasCvDetailsJson } from "./jsonAnswer";


export type TaskType = 
  | "cv_structuring" 
  | "cv_criteria_match"
  | "criteria_expansion"
  | "cv_scoring" 
  | "reverse_matching" 
  | "search_ranking" 
  | "jd_extraction" 
  | "email_routing" 
  | "email_auto_reply" 
  | "cv_vision_ocr" 
  | "embedding"
  | "jd_matching"
  | "cv_location_resolution";

export const IS_CV_EXTRACTION_TASK = (taskType: string): boolean => {
  return (
    taskType === "cv_structuring" ||
    taskType === "cv_criteria_match" ||
    taskType === "cv_scoring" ||
    taskType === "reverse_matching" ||
    taskType === "email_routing" ||
    taskType === "email_auto_reply" ||
    taskType === "jd_matching" ||
    taskType === "jd_extraction" ||
    taskType === "cv_location_resolution"
  );
};

export const DEEPSEEK_MODEL = "deepseek/deepseek-v4-flash";
export const ANTHROPIC_MODEL = "claude-haiku-5-5";

/**
 * Anthropic's own API as the main text model (Nov 2026, at the owner's request):
 * ANTHROPIC_API_KEY set, and C141_LLM_PROVIDER not "openrouter" (the one-line
 * rollback). Read at call time so a changed Convex env takes effect without a deploy.
 */
export function anthropicOn(): boolean {
  if ((process.env.C141_LLM_PROVIDER ?? "").trim().toLowerCase() === "openrouter") return false;
  return (process.env.ANTHROPIC_API_KEY ?? "").trim().length > 10;
}

function getOpenRouterKeys(): string[] {
  return [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_1,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3,
    process.env.OPENROUTER_API_KEY_4,
    process.env.OPENROUTER_API_KEYS, // Comma-separated list option
  ]
    .filter(Boolean)
    .flatMap((val) => (val ? val.split(",") : []))
    .map((k) => k.trim())
    .filter((k) => k.length > 10);
}

export function openRouterKeyPresent(): boolean {
  return getOpenRouterKeys().length > 0;
}

// The names stay (many callers import them); the value is the model that is answering.
// Fixed when the module loads, which is once per action run.
export const OPENROUTER_CV_EXTRACTION_MODEL = anthropicOn() ? ANTHROPIC_MODEL : DEEPSEEK_MODEL;
export const OPENROUTER_PRIMARY_MODEL = OPENROUTER_CV_EXTRACTION_MODEL;
export const OPENROUTER_FALLBACK_MODELS = [OPENROUTER_CV_EXTRACTION_MODEL];
export const OPENROUTER_CV_FALLBACK_MODELS = [OPENROUTER_CV_EXTRACTION_MODEL];
export const NVIDIA_PRIMARY_MODEL = "meta/llama-3.3-70b-instruct";
export const NVIDIA_FALLBACK_MODEL = "meta/llama-3.3-70b-instruct";

export function getModelForTask(_taskType: TaskType | string): string {
  return anthropicOn() ? ANTHROPIC_MODEL : DEEPSEEK_MODEL;
}

/**
 * An OpenAI-SDK-shaped client backed by the Anthropic Messages API, so the ~30
 * callers (`client.chat.completions.create` -> `choices[0].message.content`)
 * need no change. What it does differently from OpenRouter:
 *  - thinking is switched off: Haiku 5.5 thinks by default and bills it as
 *    output, which empties the 300-500 token answers (the DeepSeek reasoning
 *    bug of 28 Oct, again);
 *  - temperature/top_p are not sent (the model rejects them);
 *  - there is no JSON mode, so json_object adds an instruction, and a code
 *    fence around the answer is stripped;
 *  - the model is always Claude Haiku 5.5 unless a caller names a claude- model.
 * Pass `cache_control: {type:"ephemeral"}` to cache a large repeated prefix.
 */
export function getAnthropicClient(timeoutMs = 30000): OpenAI {
  const create = async (params: any) => {
    const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    // Haiku 5.5 and nothing else (owner's rule, Nov 2026): the caller's model name is ignored.
    const model = ANTHROPIC_MODEL;
    const wantsJson = params.response_format?.type === "json_object";

    const system: string[] = [];
    const messages: any[] = [];
    for (const m of params.messages ?? []) {
      if (m.role === "system") {
        system.push(typeof m.content === "string" ? m.content : (m.content ?? []).map((p: any) => p.text ?? "").join("\n"));
        continue;
      }
      messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: toAnthropicContent(m.content) });
    }
    if (wantsJson) system.push("Reply with only one valid JSON object. No markdown, no code fences, no text before or after it.");

    const body: Record<string, unknown> = {
      model,
      max_tokens: params.max_tokens ?? 4096,
      messages,
      thinking: { type: "disabled" },
      // The system prompt is the part that repeats call after call, so it carries the cache mark:
      // a repeat inside the cache window reads it at a tenth of the input price. A prompt under
      // the model's minimum size is simply not cached (no charge, no error).
      ...(system.length ? { system: [{ type: "text", text: system.join("\n\n"), cache_control: { type: "ephemeral" } }] } : {}),
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      const err: any = new Error(`Anthropic ${res.status}: ${detail}`);
      err.status = res.status;
      throw err;
    }
    const data: any = await res.json();
    let text = (data.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text ?? "").join("").trim();
    if (wantsJson) text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const u = data.usage ?? {};
    return {
      choices: [{ message: { role: "assistant", content: text }, finish_reason: data.stop_reason === "max_tokens" ? "length" : "stop" }],
      usage: {
        prompt_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        completion_tokens: u.output_tokens ?? 0,
        cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      },
      model,
    };
  };
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

/** OpenAI-style content (string, or text / image_url / file parts) -> Anthropic blocks. */
function toAnthropicContent(content: any): any {
  if (typeof content === "string") return content;
  return (content ?? []).map((p: any) => {
    if (p?.type === "image_url") {
      const m = /^data:([^;]+);base64,(.*)$/s.exec(p.image_url?.url ?? "");
      return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : { type: "text", text: "" };
    }
    if (p?.type === "file") {
      const m = /^data:([^;]+);base64,(.*)$/s.exec(p.file?.file_data ?? "");
      return m ? { type: "document", source: { type: "base64", media_type: m[1], data: m[2] } } : { type: "text", text: "" };
    }
    // A part marked cache_control (a repeated job block ahead of a changing CV) keeps its mark.
    return { type: "text", text: p?.text ?? "", ...(p?.cache_control ? { cache_control: p.cache_control } : {}) };
  });
}

let openRouterKeyIndex = 0;

export function getOpenAI(_taskType?: TaskType | string, timeoutMs = 30000): OpenAI {
  if (anthropicOn()) return getAnthropicClient(timeoutMs);
  return getOpenRouterClient(timeoutMs);
}

export function getOpenRouterClient(timeoutMs = 30000): OpenAI {
  // Collect all available OpenRouter API keys from environment variables for round-robin rotation
  const keysFromEnv = getOpenRouterKeys();

  if (keysFromEnv.length === 0) {
    console.warn("[getOpenAI] OPENROUTER_API_KEY is not set in environment variables, falling back to NVIDIA NIM API");
    return getNvidiaOpenAI();
  }

  // Select key using round-robin index
  const apiKey = keysFromEnv[openRouterKeyIndex++ % keysFromEnv.length];

  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    timeout: timeoutMs,
    maxRetries: 0,
  });
}

export function getNvidiaOpenAI(): OpenAI {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not set");
  }

  return new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
    timeout: 30000,
    maxRetries: 0,
  });
}

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { embedText } from "../matching/agent2";

export async function logLLMUsage(
  _ctx: ActionCtx,
  _taskType: string,
  _model: string,
  _inputTokens: number,
  _outputTokens: number,
  _success: boolean,
  _error?: string,
  _cvUploadId?: Id<"cvUploads">,
  _provider?: string,
  _sourceChannel?: string
): Promise<void> {
  // Token database tracking disabled for maximum throughput and zero DB overhead
  return;
}

export async function generateNvidiaEmbedding(
  ctx: ActionCtx,
  text: string,
  cvUploadId?: Id<"cvUploads">
): Promise<number[] | undefined> {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // Safety truncate to avoid token limits
  const safeText = trimmed.slice(0, 15000);

  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { embedding, usage } = await embedText(safeText, "passage");

      // Log successful call
      await logLLMUsage(
        ctx,
        "embedding",
        usage.model,
        usage.promptTokens,
        0,
        true,
        undefined,
        cvUploadId
      );

      return embedding;
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      
      // Log failed call attempt
      await logLLMUsage(
        ctx,
        "embedding",
        "nvidia/llama-3.2-nv-embedqa-1b-v2",
        0,
        0,
        false,
        errorMessage,
        cvUploadId
      );

      if (attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt) * 1000;
        console.warn(`[Embedding] NVIDIA API error (attempt ${attempt}/${maxRetries}), retrying in ${waitMs}ms...`, errorMessage);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      } else {
        break;
      }
    }
  }

  console.error("Embedding generation error:", lastError);
  return undefined;
}

export const NVIDIA_VISION_MODELS = [
  "meta/llama-3.2-11b-vision-instruct",
];

// The subscription CLI is in the app container, reached through its authenticated bridge.
export async function callHaikuVisionOCR(file: { kind: "pdf" | "image"; mime: string; base64: string }): Promise<string> {
  // Haiku-only: the Anthropic API reads scans (callOpenRouterPdfOCR / callNvidiaVisionOCR), not the CLI.
  if (anthropicOn()) return "";
  const base = (process.env.C141_APP_INTERNAL_URL ?? "").trim().replace(/\/+$/, "");
  const secret = (process.env.C141_CLAUDE_BRIDGE_SECRET ?? "").trim();
  if (!base || secret.length < 16) return "";
  const body = JSON.stringify(file);
  // A busy bridge answers 503 within seconds; one retry then, because three CVs
  // read at once often found every slot taken and went straight to the weaker
  // fallback (3 Nov). A slow or timed-out call is not retried.
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      const response = await fetch(`${base}/api/internal/claude-cv-vision`, {
        method: "POST", headers: { "content-type": "application/json", "x-c141-secret": secret },
        body, signal: AbortSignal.timeout(55_000),
      });
      if (response.ok) {
        const result = await response.json() as { ok?: boolean; text?: unknown };
        return result.ok && typeof result.text === "string" ? result.text.trim() : "";
      }
    } catch (err: any) {
      console.warn(`[callHaikuVisionOCR] Subscription bridge unavailable: ${err?.name || "error"}`);
    }
    if (Date.now() - started > 12_000) return "";
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return "";
}

/**
 * A scanned PDF read by OpenRouter's PDF reader (Mistral OCR) when the Haiku bridge
 * gave nothing (3 Nov). The PDF itself goes, so there is no page-image step to fail.
 * Opt-in: only with C141_PDF_OCR=on (it sends the whole PDF to OpenRouter); needs an OpenRouter key, else returns "".
 */
export async function callOpenRouterPdfOCR(base64: string, fileName = "cv.pdf"): Promise<string> {
  // With the Anthropic key the PDF goes to Claude as a document block; if that fails or returns empty,
  // fall through to OpenRouter PDF OCR when enabled.
  if (anthropicOn()) {
    try {
      const response = await getAnthropicClient(90_000).chat.completions.create({
        model: ANTHROPIC_MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Transcribe all text from the attached document verbatim, in reading order. Return only the document text, with no commentary." },
            { type: "file", file: { filename: fileName, file_data: `data:application/pdf;base64,${base64}` } },
          ] as any,
        }],
        max_tokens: 8000,
      } as any);
      const text = response.choices?.[0]?.message?.content?.trim() ?? "";
      if (text) return text;
    } catch (err: any) {
      console.warn(`[callOpenRouterPdfOCR] Anthropic PDF read failed, trying OpenRouter fallback: ${err?.message || "error"}`);
    }
  }
  if ((process.env.C141_PDF_OCR ?? "").trim().toLowerCase() !== "on") return "";
  if (!openRouterKeyPresent()) return "";
  try {
    const response = await getOpenRouterClient(90_000).chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Transcribe all text from the attached document verbatim, in reading order. Return only the document text, with no commentary." },
          { type: "file", file: { filename: fileName, file_data: `data:application/pdf;base64,${base64}` } },
        ] as any,
      }],
      temperature: 0,
      max_tokens: 8000,
      // OpenRouter-only field: OCR the pages before the model sees them.
      plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }],
    } as any);
    return response.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (err: any) {
    console.warn(`[callOpenRouterPdfOCR] failed: ${err?.message || "error"}`);
    return "";
  }
}

export async function callNvidiaVisionOCR(
  ctx: ActionCtx,
  imageBase64DataUrls: string[],
  cvUploadId?: Id<"cvUploads">
): Promise<string> {
  if (!imageBase64DataUrls || imageBase64DataUrls.length === 0) {
    throw new Error("No image content provided for Vision OCR");
  }

  const contentItems: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    {
      type: "text",
      text: "Transcribe all visible text from the provided document image(s) accurately, completely, and verbatim in top-to-bottom reading order. Return ONLY the extracted document text with no markdown wrapper, no conversational preambles, and no explanation.",
    },
  ];

  for (const imageUrl of imageBase64DataUrls) {
    contentItems.push({
      type: "image_url",
      image_url: { url: imageUrl },
    });
  }

  let lastError = "";

  // 0. Claude Haiku reads the page images when the Anthropic key is set (replaces NVIDIA's weaker vision model).
  if (anthropicOn()) {
    try {
      const response = await getAnthropicClient(60_000).chat.completions.create({
        model: ANTHROPIC_MODEL,
        messages: [{ role: "user", content: contentItems as any }],
        max_tokens: 4096,
      } as any);
      const text = response.choices[0]?.message?.content?.trim() || "";
      if (text.length > 10) return text;
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`[callNvidiaVisionOCR] Anthropic vision failed: ${lastError}`);
    }
  }

  // Haiku-only: no other vision model is tried.
  if (anthropicOn()) throw new Error(`Vision OCR failed to extract text from candidate document: ${lastError || "no answer"}`);

  // 1. Try NVIDIA NIM API (free, no OpenRouter privacy limits)
  try {
    const nvidiaOpenAI = getNvidiaOpenAI();
    for (const model of NVIDIA_VISION_MODELS) {
      try {
        console.log(`[callNvidiaVisionOCR] Invoking NVIDIA NIM Vision OCR model: ${model}`);
        const response = await nvidiaOpenAI.chat.completions.create({
          model,
          messages: [
            {
              role: "user",
              content: contentItems as any,
            },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        });

        if (response.usage) {
          await logLLMUsage(
            ctx,
            "cv_vision_ocr",
            model,
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            true,
            undefined,
            cvUploadId,
            "nvidia"
          );
        }

        const extractedText = response.choices[0]?.message?.content?.trim() || "";
        if (extractedText && extractedText.length > 10) {
          console.log(`[callNvidiaVisionOCR] Successfully extracted ${extractedText.length} chars using NVIDIA ${model}`);
          return extractedText;
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
        console.warn(`[callNvidiaVisionOCR] NVIDIA Vision OCR failed with model ${model}: ${lastError}`);
      }
    }
  } catch (err: any) {
    console.warn("[callNvidiaVisionOCR] Failed to initialize NVIDIA client:", err);
  }

  await logLLMUsage(
    ctx,
    "cv_vision_ocr",
    NVIDIA_VISION_MODELS[0],
    0,
    0,
    false,
    lastError,
    cvUploadId,
    "nvidia"
  );

  throw new Error(`Vision OCR failed to extract text from candidate document: ${lastError}`);
}

export interface LLMCompletionOptions {
  messages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  cvUploadId?: Id<"cvUploads">;
  sourceChannel?: string;
}

export async function executeLLMWithNvidiaFallback(
  ctx: ActionCtx,
  taskType: TaskType | string,
  options: LLMCompletionOptions
): Promise<{ content: string; provider: "openrouter" | "nvidia" | "anthropic"; model: string; primaryError?: string }> {
  // Every task takes the full chain once the Anthropic key is set; before, only the CV tasks did
  // and the rest went to NVIDIA alone.
  if (IS_CV_EXTRACTION_TASK(taskType) || anthropicOn()) {
    // When Anthropic is on, try Claude Haiku 5.5 first and automatically fall back to OpenRouter
    // DeepSeek if an OpenRouter key is configured. Otherwise use DeepSeek -> NVIDIA.
    const candidateModels = anthropicOn()
      ? (openRouterKeyPresent() ? [ANTHROPIC_MODEL, DEEPSEEK_MODEL] : [ANTHROPIC_MODEL])
      : [DEEPSEEK_MODEL, NVIDIA_PRIMARY_MODEL];

    let lastError: any = null;
    // Why DeepSeek gave no answer, when the fallback is the one that answers.
    let primaryError: string | undefined;

    for (const model of candidateModels) {
      const isNvidiaModel = model.startsWith("meta/");
      if (isNvidiaModel && lastError) primaryError = lastError?.message || String(lastError);
      const maxRetries = isNvidiaModel ? 1 : 2;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Reading a whole CV into JSON takes deepseek-v4-flash 30–45 seconds
          // (measured on real linkedin@ CVs, 17 September). At the old 30s
          // limit both tries timed out, the fallback model answered with an
          // empty object, and 141 real CVs were rejected as "not a CV".
          // Two tries at 75s stay inside the extraction's 210s deadline.
          const isClaude = model.startsWith("claude");
          const client = isNvidiaModel ? getNvidiaOpenAI() : isClaude ? getAnthropicClient(75_000) : getOpenRouterClient(75_000);
          const response = await client.chat.completions.create({
            model,
            messages: options.messages,
            temperature: options.temperature ?? 0.1,
            max_tokens: options.max_tokens ?? 4096,
            ...(options.response_format ? { response_format: options.response_format } : {}),
            // deepseek-v4-flash "thinks" first, and the thinking is billed
            // against max_tokens: on a long CV it used most of the 8,192 and the
            // JSON stopped after a few hundred characters ("not readable JSON
            // (323 characters — likely cut off)", 28 Oct), after up to two
            // 75-second tries. Reading a CV into fields needs no reasoning —
            // the JD parser and Desk Copilot turned it off for the same
            // reason (17 Sep). OpenRouter-only field; NVIDIA does not get it.
            ...(isNvidiaModel || isClaude ? {} : ({ reasoning: { enabled: false } } as object)),
          });

          if (response.usage) {
            await logLLMUsage(
              ctx,
              taskType,
              model,
              response.usage.prompt_tokens,
              response.usage.completion_tokens,
              true,
              undefined,
              options.cvUploadId,
              isNvidiaModel ? "nvidia" : isClaude ? "anthropic" : "openrouter",
              options.sourceChannel
            );
          }

          const content = response.choices[0]?.message?.content?.trim() || "";
          // A cut-off JSON answer used to be handed straight back and the CV
          // failed on it; it now counts as a failed try, so the second try and
          // then the fallback model get their turn (28 Oct).
          if (content && options.response_format?.type === "json_object" && !isCompleteJson(content)) {
            throw new Error(`${model} gave JSON that stops part-way (${content.length} characters, finish: ${response.choices[0]?.finish_reason ?? "unknown"})`);
          }
          if (content) {
            if (taskType === "cv_structuring" && !hasCvDetailsJson(content)) {
              throw new Error(`${model} found no candidate details`);
            }
            return { content, provider: isNvidiaModel ? "nvidia" : isClaude ? "anthropic" : "openrouter", model, ...(isNvidiaModel ? { primaryError } : {}) };
          }
          throw new Error(`${model} returned empty response`);
        } catch (err: any) {
          lastError = err;
          const errorMsg = err?.message || String(err);
          console.warn(`[executeLLMWithNvidiaFallback] Model ${model} attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);

          if (attempt < maxRetries) {
            const waitMs = Math.pow(2, attempt) * 1000;
            await new Promise((r) => setTimeout(r, waitMs));
          }
        }
      }
    }

    const finalErrorMsg = lastError?.message || String(lastError);
    await logLLMUsage(
      ctx,
      taskType,
      candidateModels[0],
      0,
      0,
      false,
      `CV Extraction Failed across all fallback models: ${finalErrorMsg}`,
      options.cvUploadId,
      anthropicOn() ? "anthropic" : "openrouter",
      options.sourceChannel
    );

    throw lastError || new Error("CV extraction LLM call failed across primary and fallback models");
  }

  // Non-CV Tasks (Reverse Match, Search, JD Extraction, Email Routing, etc.): Use NVIDIA NIM API
  const model = NVIDIA_PRIMARY_MODEL;
  try {
    const nvidiaOpenAI = getNvidiaOpenAI();
    const response = await nvidiaOpenAI.chat.completions.create({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.max_tokens ?? 4096,
      ...(options.response_format ? { response_format: options.response_format } : {}),
    });

    if (response.usage) {
      await logLLMUsage(
        ctx,
        taskType,
        model,
        response.usage.prompt_tokens,
        response.usage.completion_tokens,
        true,
        undefined,
        options.cvUploadId,
        "nvidia",
        options.sourceChannel
      );
    }

    const content = response.choices[0]?.message?.content?.trim() || "";
    if (content) {
      return { content, provider: "nvidia", model };
    }
    throw new Error(`NVIDIA ${model} returned empty response`);
  } catch (nvidiaError: any) {
    const errorMsg = nvidiaError?.message || String(nvidiaError);
    console.error(`[executeLLMWithNvidiaFallback] Non-CV task call (${model}) failed for task "${taskType}": ${errorMsg}`);
    
    await logLLMUsage(
      ctx,
      taskType,
      model,
      0,
      0,
      false,
      `NVIDIA Call Failed: ${errorMsg}`,
      options.cvUploadId,
      "nvidia",
      options.sourceChannel
    );

    throw nvidiaError;
  }
}


