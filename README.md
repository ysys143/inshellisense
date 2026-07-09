# more-inshellisense

A fork of [inshellisense](https://github.com/microsoft/inshellisense) that adds **AI natural-language command generation** on top of its IDE-style shell autocomplete.

Type a command normally and you get spec-based completions for 600+ CLIs (the original inshellisense engine). Or type what you *want* in plain language — English, Korean, or even a bare tool/domain name — press **Ctrl+G**, and a local or cloud LLM turns it into the actual command, shown right in the suggestion box.

```
> 현재 컴퓨터 public ip
  +---------------------+
  | * curl ifconfig.me  |
  +---------------------+
  (press Ctrl+G, then Tab or Enter to accept)
```

## What this fork adds

- **AI command generation (Ctrl+G)** — natural language or a malformed command becomes a real shell command. Accept with **Tab** or **Enter** (the natural-language line is replaced, not run).
- **Pluggable LLM providers** — local [ollama](https://ollama.com) (no API key, fully offline) or cloud. One OpenAI-compatible adapter covers ollama / GLM / Kimi / Alibaba / mlx; Gemini has a native adapter.
- **Platform-aware prompts** — the OS/arch/shell context is injected so commands respect BSD vs GNU differences.

Everything else is the original inshellisense: spec-based autocomplete, PTY wrapping, OSC shell integration, and support for bash, zsh, fish, pwsh, xonsh, and nushell across macOS, Linux, and Windows.

## Install

```shell
npm install -g more-inshellisense
is init
```

Run `is doctor` to verify the install, then `is` to start a session.

## Usage

Start a session (your shell prompt is preserved):

```shell
is
```

### Spec autocomplete (from inshellisense)

Type a command; suggestions appear as you go.

| Action | Key |
| --- | --- |
| Accept suggestion | Tab |
| Next / previous | Down / Up |
| Dismiss | Esc |

### AI command generation (this fork)

Type what you want in natural language, then:

| Action | Key |
| --- | --- |
| Generate command from the current line | Ctrl+G |
| Accept the AI suggestion | Tab or Enter |

The AI suggestion replaces the natural-language line with the command; press Enter again to run it.

### Shell plugin (auto-start)

```shell
is init zsh >> ~/.zshrc   # bash/fish/etc. analogous
```

## AI configuration

Configure in `~/.inshellisenserc` (or `~/.config/inshellisense/rc.toml`):

```toml
[ai]
enabled = true
provider = "ollama"   # "ollama" (local) or "gemini" (cloud)
timeoutMs = 20000

[ai.providers.ollama]
baseUrl = "http://localhost:11434/v1"
model = "gemma4:e2b"

[ai.providers.gemini]
model = "gemini-2.5-flash"
apiKeyEnv = "GEMINI_API_KEY"   # API keys come from env vars, never the config file
```

- **Local (ollama)**: no API key, runs offline. A code/instruction-capable model is recommended; very small general models produce poor commands.
- **Cloud (gemini)**: set the API key in the environment variable named by `apiKeyEnv`.
- **Keybinding**: the AI trigger defaults to Ctrl+G; override under `[bindings.generateCommand]`.

The spec-based keybindings, `useAliases`, `useNerdFont`, and `maxSuggestions` options from inshellisense are unchanged.

## Credits

This project is a fork of **[inshellisense](https://github.com/microsoft/inshellisense)** by Microsoft, licensed under MIT. The autocomplete engine, spec runtime (via [@withfig/autocomplete](https://github.com/withfig/autocomplete)), PTY/terminal handling, and shell integrations are their work. This fork adds only the AI layer (`src/runtime/ai/`, the Ctrl+G trigger, and prompt/provider plumbing).

If you want plain spec-based autocomplete without the AI additions, use the upstream project directly.

## License

MIT — see [LICENSE](LICENSE). Original work (c) Microsoft Corporation; fork additions (c) Jaesol Shin.
