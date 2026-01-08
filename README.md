# Sparkell

AI-powered text editing Chrome extension with custom prompts and keyboard shortcuts.

## Features

- **Custom AI Prompts**: Create unlimited prompts for text editing tasks
- **Keyboard Shortcuts**: Assign prompts to Alt+Shift+1-4 for quick access
- **Multiple AI Providers**: Support for OpenRouter, Google Gemini, and Anthropic Claude
- **Smart Text Insertion**: Automatically inserts AI results into editable fields
- **Backup & Restore**: Export/import your prompts as JSON
- **Encrypted Storage**: API keys are encrypted using AES-GCM

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

## Quick Start

Import the default prompts to get started quickly:
1. Download [`default-prompts.json`](default-prompts.json)
2. Click the extension icon and open "Backup & Restore"
3. Click "Import Prompts" and select the downloaded file

The default prompts include:
- **Fix grammar** (Alt+Shift+1): Correct grammar and improve writing
- **Summary** (Alt+Shift+2): Summarize text concisely
- **Explain** (Alt+Shift+3): Get detailed explanations

## Usage

1. Add your API keys in the settings sidebar
2. Create custom prompts (e.g., "Fix grammar: {text}")
3. Assign prompts to keyboard shortcuts
4. Select text on any webpage and press your shortcut
5. Choose to insert or copy the AI-generated result

## Configuration

- **API Keys**: Add keys for your preferred AI provider
- **Prompts**: Use `{text}` as placeholder for selected text
- **Shortcuts**: Configure Alt+Shift+1-4 in the popup

## License

MIT
