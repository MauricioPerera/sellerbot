import OpenAI from "openai";
import type { StreamChunk } from "./agent_loop.ts";

const DEFAULT_BASE_URL = "https://inference.poolside.ai/v1";
const DEFAULT_MODEL = "poolside/laguna-s-2.1";

export interface PoolsideClientConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export interface PoolsideClient {
  config: { baseURL: string; model: string };
  streamChat: (
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.ChatCompletionTool[],
  ) => Promise<AsyncIterable<StreamChunk>>;
}

export function createPoolsideClient(config: PoolsideClientConfig): PoolsideClient {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }

  const baseURL = config.baseURL ?? DEFAULT_BASE_URL;
  const model = config.model ?? DEFAULT_MODEL;
  const client = new OpenAI({ apiKey: config.apiKey, baseURL });

  return {
    config: { baseURL, model },
    async streamChat(messages, tools) {
      const stream = await client.chat.completions.create({
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: true,
      });
      return stream as unknown as AsyncIterable<StreamChunk>;
    },
  };
}
