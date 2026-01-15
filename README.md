# Cove

A minimal coding agent powered by Gemini.

## Install

```bash
bun install
bun link
```

## Setup

Create `~/.cove/.env`:
```
GEMINI_API_KEY=your-api-key-here
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
| `/bashes` | List background shells |
| `/output <id>` | Show output from shell |
| `/kill <id>` | Kill a background shell |
| `/exit` | Exit Cove |

## Shell Shortcuts

| Shortcut | Description |
|----------|-------------|
| `!<cmd>` | Run shell command (blocking) |
| `!<cmd> &` | Run in background |

## Tools

The agent has access to:
- `read` — Read file contents
- `edit` — Edit files via string replacement
- `bash` — Run shell commands
- `grep` — Search for patterns
- `glob` — Find files by pattern

## Development

```bash
bun run dev        # hot-reload
bun run typecheck  # type check
```
