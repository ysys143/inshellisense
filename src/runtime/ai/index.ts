// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AIProvider } from "./provider.js";
import { GeminiProvider } from "./gemini.js";
import { StubProvider } from "./stub.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { getConfig } from "../../utils/config.js";

export { AIProvider, NLRequest } from "./provider.js";

// Resolves the configured AI provider. Today only Gemini (native API) is wired,
// but the switch is the single extension point for OpenAI-compatible providers
// (GLM/Kimi/Alibaba/ollama/mlx) which will share one adapter implementation.
export const getAIProvider = (): AIProvider => {
  // Test override: deterministic provider, no config/network required.
  if (process.env.ISTERM_AI_PROVIDER === "stub") {
    return new StubProvider();
  }
  const ai = getConfig().ai;
  if (!ai?.enabled) {
    throw new Error("AI is disabled. Set `enabled = true` under [ai] in your inshellisense config.");
  }
  switch (ai.provider) {
    case "gemini": {
      const cfg = ai.providers?.gemini ?? {};
      const apiKeyEnv = cfg.apiKeyEnv ?? "GEMINI_API_KEY";
      const apiKey = process.env[apiKeyEnv];
      if (!apiKey) {
        throw new Error(`missing API key: environment variable '${apiKeyEnv}' is not set`);
      }
      const model = cfg.model ?? process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";
      return new GeminiProvider({ model, apiKey });
    }
    case "ollama": {
      const cfg = ai.providers?.ollama ?? {};
      const baseUrl = cfg.baseUrl ?? "http://localhost:11434/v1";
      const model = cfg.model ?? "gemma4:e2b";
      return new OpenAICompatibleProvider("ollama", { baseUrl, model });
    }
    default:
      throw new Error(`unknown AI provider: '${ai.provider}'`);
  }
};
