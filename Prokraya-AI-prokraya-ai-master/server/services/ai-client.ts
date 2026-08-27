import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

let cachedClient: any = null;
let cachedConfigKey: string | null = null;
let cachedProviderKey: string | null = null;
let cachedAnthropicClient: Anthropic | null = null;
let cachedAnthropicKey: string | null = null;

/* function createAnthropicAdapter(apiKey: string) {
  return {
    chat: {
      completions: {
        create: async (params: any) => {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const anthropic = new Anthropic({ apiKey });

          // Extract system prompt (Anthropic uses a top-level param, not a message)
          const systemContent = params.messages
            .filter((m: any) => m.role === "system")
            .map((m: any) => m.content)
            .join("\n");

          // Convert a single content block from OpenAI format to Anthropic format
          const convertBlock = (block: any): any => {
            if (block.type === "image_url") {
              const url: string = block.image_url?.url ?? "";
              if (url.startsWith("data:")) {
                const commaIdx = url.indexOf(",");
                const header = url.slice(0, commaIdx);           // "data:image/png;base64"
                const data = url.slice(commaIdx + 1);            // raw base64 string
                const mediaType = header.replace("data:", "").replace(";base64", "");
                return { type: "image", source: { type: "base64", media_type: mediaType, data } };
              }
              return { type: "image", source: { type: "url", url } };
            }
            if (block.type === "text") return { type: "text", text: block.text };
            return block;
          };

          // Convert a message's content field (string or array) to Anthropic format
          const convertContent = (content: any): any => {
            if (typeof content === "string") return content;
            if (Array.isArray(content)) return content.map(convertBlock);
            return content;
          };

          // Convert messages to Anthropic format
          const anthropicMessages: any[] = [];
          for (const msg of params.messages) {
            if (msg.role === "system") continue;
            if (msg.role === "tool") {
              // OpenAI tool result → Anthropic tool_result block inside a user message
              anthropicMessages.push({
                role: "user",
                content: [{ type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content }],
              });
            } else if (msg.role === "assistant" && msg.tool_calls?.length) {
              // OpenAI assistant tool_calls → Anthropic tool_use content blocks
              const content: any[] = [];
              if (msg.content) content.push({ type: "text", text: msg.content });
              for (const tc of msg.tool_calls) {
                content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) });
              }
              anthropicMessages.push({ role: "assistant", content });
            } else {
              anthropicMessages.push({ role: msg.role, content: convertContent(msg.content) });
            }
          }

          // Convert tools: OpenAI { type, function: { name, description, parameters } } → Anthropic { name, description, input_schema }
          const anthropicTools = params.tools?.map((t: any) => ({
            name: t.function.name,
            description: t.function.description || "",
            input_schema: t.function.parameters,
          }));

          // When caller requests JSON output, inject an explicit instruction so Claude
          // returns raw JSON without markdown code fences (it has no native json_object mode)
          const needsJson = params.response_format?.type === "json_object";
          const jsonEnforcement = needsJson
            ? "IMPORTANT: Your entire response MUST be a single valid JSON object. Do NOT wrap it in markdown code fences. Do NOT include any text before or after the JSON. Start your response with { and end with }."
            : "";
          const finalSystem = [systemContent, jsonEnforcement].filter(Boolean).join("\n\n");

          const reqParams: any = {
            model: params.model,
            // max_completion_tokens is the OpenAI v2 alias for max_tokens
            max_tokens: params.max_tokens || params.max_completion_tokens || 4096,
            messages: anthropicMessages,
          };
          if (finalSystem) reqParams.system = finalSystem;
          if (anthropicTools?.length) reqParams.tools = anthropicTools;
          if (params.temperature !== undefined) reqParams.temperature = params.temperature;

          const response = await anthropic.messages.create(reqParams);

          // Strip markdown code fences as a safety net (Claude occasionally adds them
          // even with explicit instructions, especially on complex documents)
          const stripFences = (text: string): string => {
            const stripped = text.replace(/^```[^\n]*\n?([\s\S]*?)\n?```$/, "$1").trim();
            return stripped.length > 0 ? stripped : text.trim();
          };

          // Convert Anthropic response → OpenAI format
          const textBlock = response.content.find((c: any) => c.type === "text") as any;
          const toolBlocks = response.content.filter((c: any) => c.type === "tool_use") as any[];

          const rawText = textBlock?.text ?? null;
          const message: any = { role: "assistant", content: rawText ? stripFences(rawText) : null };
          if (toolBlocks.length > 0) {
            message.tool_calls = toolBlocks.map((tb) => ({
              id: tb.id,
              type: "function",
              function: { name: tb.name, arguments: JSON.stringify(tb.input) },
            }));
          }

          return {
            id: response.id,
            object: "chat.completion",
            model: response.model,
            choices: [{
              index: 0,
              message,
              finish_reason: response.stop_reason === "tool_use" ? "tool_calls" : response.stop_reason,
            }],
            usage: {
              prompt_tokens: response.usage.input_tokens,
              completion_tokens: response.usage.output_tokens,
              total_tokens: response.usage.input_tokens + response.usage.output_tokens,
            },
          };
        },
      },
    },
  };
} */

export class AINotConfiguredError extends Error {
  constructor() {
    super("AI model not configured. Please go to Administration → AI Model Configuration to set up and activate an AI provider before using AI features.");
    this.name = "AINotConfiguredError";
  }
}

async function getActiveConfig(): Promise<{ api_key: string; api_base_url: string | null; model_name: string; provider_key: string; provider_type: string } | null> {
  try {
    const { pool } = await import("../db");
    const { getContextPool } = await import("../tenant-context");
    const activePool = getContextPool() ?? pool;
    const result = await activePool.query(`
      SELECT api_key, api_base_url, model_name, provider_key, provider_type
      FROM dbo.am_ai_model_config
      WHERE is_active = true AND api_key IS NOT NULL
      LIMIT 1
    `);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function logUsage(
  providerKey: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
): Promise<void> {
  try {
    const { pool } = await import("../db");
    const { getContextPool } = await import("../tenant-context");
    const activePool = getContextPool() ?? pool;
    await activePool.query(
      `INSERT INTO dbo.am_ai_usage_log (provider_key, model_name, prompt_tokens, completion_tokens, total_tokens)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        providerKey,
        model || "",
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0,
        usage.total_tokens || 0,
      ]
    );
  } catch {
    // Best-effort: never fail the AI call due to logging errors
  }
}

function createUsageTrackingProxy(client: any, providerKey: string): any {
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);
  return {
    chat: {
      completions: {
        create: async (params: any) => {
          const response = await originalCreate(params);
          if (response?.usage) {
            logUsage(providerKey, params.model || "", response.usage).catch(() => {});
          }
          return response;
        },
      },
    },
  };
}

// Proxy for self-hosted / Ollama providers.
// Sanitizes unsupported params and falls back to plain-text calls when tool calling fails.
function createSelfHostedProxy(client: any, providerKey: string): any {
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  async function safeCreate(params: any): Promise<any> {
    // Strip params that local models don't reliably support
    const sanitized = { ...params };
    delete sanitized.response_format;
    // Convert forced tool_choice to "auto" (named-function form not supported by Ollama)
    if (
      sanitized.tool_choice &&
      typeof sanitized.tool_choice === "object" &&
      sanitized.tool_choice.type === "function"
    ) {
      sanitized.tool_choice = "auto";
    }

    let response: any;
    try {
      response = await originalCreate(sanitized);
    } catch (err: any) {
      // Tool calling likely caused a 4xx from Ollama. Retry without tools so the
      // model can at least give a plain-text response based on the conversation.
      if (sanitized.tools) {
        const plainParams = {
          model: sanitized.model,
          messages: sanitized.messages,
          temperature: typeof sanitized.temperature === "number" ? sanitized.temperature : 0.3,
          max_tokens: sanitized.max_tokens || 1024,
        };
        response = await originalCreate(plainParams);
      } else {
        throw err; // Re-throw if tools weren't the issue
      }
    }

    // Usage logging
    if (response?.usage) {
      logUsage(providerKey, params.model || "", response.usage).catch(() => {});
    }

    // Null-content recovery: model returned no content and no tool calls.
    // Retry without tools so we at least get a text response.
    if (!params.stream) {
      const msg = response?.choices?.[0]?.message;
      if (msg && (msg.content === null || msg.content === "") && !(msg.tool_calls?.length)) {
        const plainParams = {
          model: sanitized.model,
          messages: sanitized.messages,
          temperature: typeof sanitized.temperature === "number" ? sanitized.temperature + 0.1 : 0.3,
          max_tokens: sanitized.max_tokens || 1024,
        };
        const recovery = await originalCreate(plainParams);
        if (recovery?.usage) {
          logUsage(providerKey, params.model || "", recovery.usage).catch(() => {});
        }
        return recovery;
      }
    }

    return response;
  }

  return {
    chat: {
      completions: {
        create: safeCreate,
      },
    },
  };
}

function createAnthropicAdapter(apiKey: string, baseURL: string | null, providerKey: string): any {
  const cacheKey = `${apiKey.slice(-6)}:${baseURL || ""}`;
  if (!cachedAnthropicClient || cachedAnthropicKey !== cacheKey) {
    cachedAnthropicClient = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    cachedAnthropicKey = cacheKey;
  }
  const anthropic = cachedAnthropicClient;

  return {
    chat: {
      completions: {
        create: async (params: any) => {
          const { messages, model, max_tokens, temperature, stream, tools, tool_choice, response_format } = params;

          // Split system messages out (Anthropic takes them as a top-level param)
          const systemText = messages
            .filter((m: any) => m.role === "system")
            .map((m: any) => m.content)
            .join("\n");

          // JSON mode: inject instruction because Anthropic has no native json_object param
          const needsJson = response_format?.type === "json_object";
          const jsonInstruction = needsJson
            ? "IMPORTANT: Your entire response MUST be a single valid JSON object. Do NOT wrap it in markdown code fences. Do NOT include any text before or after the JSON. Start your response with { and end with }."
            : "";
          const finalSystem = [systemText, jsonInstruction].filter(Boolean).join("\n\n");

          // Convert OpenAI-format messages → Anthropic format, including tool results and tool calls
          const anthropicMessages: any[] = [];
          for (const msg of messages) {
            if (msg.role === "system") continue;
            if (msg.role === "tool") {
              // OpenAI tool result → Anthropic tool_result block inside a user turn
              anthropicMessages.push({
                role: "user",
                content: [{ type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content }],
              });
            } else if (msg.role === "assistant" && msg.tool_calls?.length) {
              // OpenAI assistant tool_calls → Anthropic tool_use content blocks
              const content: any[] = [];
              if (msg.content) content.push({ type: "text", text: msg.content });
              for (const tc of msg.tool_calls) {
                content.push({
                  type: "tool_use",
                  id: tc.id,
                  name: tc.function.name,
                  input: JSON.parse(tc.function.arguments),
                });
              }
              anthropicMessages.push({ role: "assistant", content });
            } else {
              anthropicMessages.push({
                role: msg.role === "assistant" ? "assistant" : "user",
                content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
              });
            }
          }

          // Convert OpenAI tool definitions → Anthropic tool definitions
          const anthropicTools = tools?.map((t: any) => ({
            name: t.function.name,
            description: t.function.description || "",
            input_schema: t.function.parameters,
          }));

          // Convert tool_choice
          let anthropicToolChoice: any;
          if (anthropicTools?.length) {
            if (!tool_choice || tool_choice === "auto") {
              anthropicToolChoice = { type: "auto" };
            } else if (tool_choice === "none") {
              anthropicToolChoice = { type: "none" };
            } else if (typeof tool_choice === "object" && tool_choice.type === "function") {
              anthropicToolChoice = { type: "tool", name: tool_choice.function.name };
            }
          }

          const anthropicParams: any = {
            model: model || "claude-haiku-4-5-20251001",
            max_tokens: max_tokens || 4096,
            messages: anthropicMessages,
            ...(finalSystem ? { system: finalSystem } : {}),
            ...(temperature !== undefined ? { temperature } : {}),
            ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
            ...(anthropicToolChoice ? { tool_choice: anthropicToolChoice } : {}),
          };

          // ── Streaming path ────────────────────────────────────────────────────
          if (stream) {
            const anthropicStream = anthropic.messages.stream(anthropicParams);
            let inputTokens = 0;
            let outputTokens = 0;

            return (async function* () {
              for await (const event of anthropicStream) {
                if (event.type === "message_start" && event.message.usage) {
                  inputTokens = event.message.usage.input_tokens;
                }
                if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                  yield { choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null }] };
                }
                if (event.type === "message_delta" && event.usage) {
                  outputTokens = event.usage.output_tokens;
                }
                if (event.type === "message_stop") {
                  yield { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
                  logUsage(providerKey, model || "", {
                    prompt_tokens: inputTokens,
                    completion_tokens: outputTokens,
                    total_tokens: inputTokens + outputTokens,
                  }).catch(() => {});
                }
              }
            })();
          }

          // ── Non-streaming path ────────────────────────────────────────────────
          const response = await anthropic.messages.create(anthropicParams);

          logUsage(providerKey, model || "", {
            prompt_tokens: response.usage.input_tokens,
            completion_tokens: response.usage.output_tokens,
            total_tokens: response.usage.input_tokens + response.usage.output_tokens,
          }).catch(() => {});

          const stripFences = (text: string): string => {
            const stripped = text.replace(/^```[^\n]*\n?([\s\S]*?)\n?```$/, "$1").trim();
            return stripped.length > 0 ? stripped : text.trim();
          };

          const textBlock = response.content.find((c: any) => c.type === "text") as any;
          const toolBlocks = response.content.filter((c: any) => c.type === "tool_use") as any[];

          const rawText = textBlock?.text ?? null;
          const messageContent = rawText ? (needsJson ? stripFences(rawText) : rawText) : null;
          const message: any = { role: "assistant", content: messageContent };

          if (toolBlocks.length > 0) {
            message.tool_calls = toolBlocks.map((tb: any) => ({
              id: tb.id,
              type: "function",
              function: { name: tb.name, arguments: JSON.stringify(tb.input) },
            }));
          }

          return {
            id: response.id,
            object: "chat.completion",
            model: response.model,
            choices: [{
              index: 0,
              message,
              finish_reason: response.stop_reason === "tool_use" ? "tool_calls" : response.stop_reason,
            }],
            usage: {
              prompt_tokens: response.usage.input_tokens,
              completion_tokens: response.usage.output_tokens,
              total_tokens: response.usage.input_tokens + response.usage.output_tokens,
            },
          };
        },
      },
    },
  };
}

export async function getAIClient(): Promise<any> {
  const dbConfig = await getActiveConfig();

  if (dbConfig && dbConfig.api_key) {
    if (dbConfig.provider_key === "anthropic") {
      return createAnthropicAdapter(dbConfig.api_key, dbConfig.api_base_url, "anthropic");
    }

    const configKey = `${dbConfig.provider_key}:${dbConfig.api_key.slice(-6)}`;
    if (cachedClient && cachedConfigKey === configKey) {
      const proxyFn = dbConfig.provider_type === "self_hosted" ? createSelfHostedProxy : createUsageTrackingProxy;
      return proxyFn(cachedClient, dbConfig.provider_key);
    }
    cachedClient = new OpenAI({
      apiKey: dbConfig.api_key,
      baseURL: dbConfig.api_base_url || undefined,
    });
    cachedConfigKey = configKey;
    cachedProviderKey = dbConfig.provider_key;
    const proxyFn = dbConfig.provider_type === "self_hosted" ? createSelfHostedProxy : createUsageTrackingProxy;
    return proxyFn(cachedClient, dbConfig.provider_key);
  }

  const envKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const envBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (envKey) {
    if (cachedClient && cachedConfigKey === "env") {
      return createUsageTrackingProxy(cachedClient, cachedProviderKey || "openai");
    }
    cachedClient = new OpenAI({
      apiKey: envKey,
      baseURL: envBase,
    });
    cachedConfigKey = "env";
    cachedProviderKey = "openai";
    return createUsageTrackingProxy(cachedClient, "openai");
  }

  throw new AINotConfiguredError();
}

export async function getAIModelName(): Promise<string> {
  const dbConfig = await getActiveConfig();
  if (dbConfig) return dbConfig.model_name || "gpt-4o-mini";
  return "gpt-4o-mini";
}

export function clearAIClientCache(): void {
  cachedClient = null;
  cachedConfigKey = null;
  cachedProviderKey = null;
  cachedAnthropicClient = null;
  cachedAnthropicKey = null;
}
