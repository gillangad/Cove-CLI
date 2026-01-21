# Cove

A minimal coding agent powered by Gemini or GLM

## Install

```bash
bun install
bun link
```

## Setup

Create `~/.cove/.env` with at least one provider key:
```
GLM_API_KEY=your-glm-key
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GEMINI_API_KEY=your-gemini-key
```

## Usage

```bash
cove
```

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/clear` | Reset conversation |
| `/compact` | Summarize and compress context |
| `/context` | Show context window usage |
| `/verbose` | Toggle verbose/debug mode |
| `/sessions` | Manage saved sessions |
| `/models` | List curated models |
| `/provider <name>` | Set provider scope |
| `/model <id|short>` | Set model |
| `/verify <cmd>` | Run a verification command via the bash tool |
| `/bashes` | List background shells |
| `/output <id>` | Show output from shell |
| `/kill <id>` | Kill a background shell |
| `/exit` | Exit Cove |

## Keyboard Shortcuts

These work in the TUI.

| Shortcut | Description |
|----------|-------------|
| `Ctrl+C` | Exit |
| `Esc` | Cancel an in-flight response / close pager |
| `↑` / `↓` | Scroll chat history (only when response is finished) |
| `Ctrl+U` / `Ctrl+D` | Scroll up/down faster (half-page) |
| `Ctrl+P` / `Ctrl+N` | Previous/next command from input history |
| `Ctrl+O` | Open message pager (line scroll) |

## Shell Shortcuts

| Shortcut | Description |
|----------|-------------|
| `!<cmd>` | Run shell command (blocking) |
| `!<cmd> &` | Run in background |
| `↑` / `↓` | Scroll chat history (when idle) |

## Tools

The agent has access to:
- `read` — Read file contents
- `write` — Write/create files
- `edit` — Edit files via string replacement
- `delete` — Delete files/directories
- `move` — Move/rename files
- `bash` — Run shell commands
- `grep` — Search for patterns
- `glob` — Find files by pattern
- `batch_read` — Read multiple files at once
- `search_replace` — Search/replace across files

## Development

```bash
bun run dev        # hot-reload
bun run typecheck  # type check
```

## Models

Use `/models` to view available curated models.
