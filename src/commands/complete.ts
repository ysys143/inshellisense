// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import os from "node:os";
import { Command } from "commander";
import { getSuggestions } from "../runtime/runtime.js";
import { Shell } from "../utils/shell.js";
import { SuggestionBlob } from "../runtime/model.js";
import { SuggestionIcons } from "../runtime/suggestion.js";
import { getAIProvider } from "../runtime/ai/index.js";
import { collectEnv } from "../runtime/ai/prompt.js";
import { getConfig, loadConfig } from "../utils/config.js";

const getAiCompletion = async (input: string, shell: Shell): Promise<SuggestionBlob> => {
  const provider = getAIProvider();
  const timeoutMs = getConfig().ai?.timeoutMs ?? 8000;
  const cmd = await provider.generateCommand({ input, cwd: process.cwd(), env: collectEnv(shell), shell }, AbortSignal.timeout(timeoutMs));
  return {
    suggestions: [
      {
        name: cmd,
        allNames: [cmd],
        icon: SuggestionIcons.Special,
        priority: 100,
        type: "special",
        insertValue: cmd,
        description: `AI (${provider.name})`,
      },
    ],
  };
};

const action = (cmd: Command) => async (input: string, options: { ai?: boolean }) => {
  const shell = os.platform() === "win32" ? Shell.Cmd : Shell.Bash;
  if (options.ai) {
    await loadConfig(cmd);
    const blob = await getAiCompletion(input, shell);
    process.stdout.write(JSON.stringify(blob));
    process.exit(0);
  }
  const suggestions = await getSuggestions(input, process.cwd(), shell);
  process.stdout.write(JSON.stringify(suggestions));
  process.exit(0);
};

const cmd = new Command("complete");
cmd.description(`generates a completion for the provided input`);
cmd.argument("<input>");
cmd.option("--ai", "translate natural language to a command using the configured AI provider");
cmd.action(action(cmd));

export default cmd;
