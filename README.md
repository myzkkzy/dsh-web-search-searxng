# SearXNG web search plugin for DeepSeek Harness

English | [日本語](README.ja.md)

A custom plugin that connects DeepSeek Harness's standard `web_search` tool to a SearXNG instance running on the same PC.
No API key or third-party search plugin is required. Settings support English and Japanese and follow the Harness display language; other languages fall back to English.

- Target environment: DeepSeek Harness Desktop **0.2.2-rc.1**
- Tested OS: Windows
- Development and tests: Node.js 22.19 or later

Execution uses the runtime and shared modules bundled with Harness. A separate Node.js installation is not required.
The source and browser artifact are included, so no build or `npm install` is required.

## Installation

In Harness, open **Plugins → Add plugin** and select the directory where you downloaded or extracted the plugin (the directory containing `package.json`).

Choose **Enable now** after registration. Restart Harness if prompted.
Open the plugin details to access its settings form.

To register it through the bundled CLI, fully quit Harness first.
The window's × button may leave it running; use Quit / Exit from the system tray.

Replace `<DeepSeek Harness installation directory>` and `<plugin directory>` in the command examples with your actual paths. Replace the entire placeholder, including its angle brackets.

```powershell
& '<DeepSeek Harness installation directory>\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add '<plugin directory>'
```

## Starting SearXNG

Start SearXNG according to the instructions for your deployment method and keep it reachable from Harness while searching.
For startup and configuration details, follow the instructions for your setup or the [official SearXNG installation guide](https://docs.searxng.org/admin/installation.html).

This plugin requires a SearXNG instance that can return JSON search results. Enable JSON output in SearXNG if necessary.
See the [official Search API documentation](https://docs.searxng.org/dev/search_api.html) for API details.

To check the connection, replace `<SearXNG Base URL>` below, including its angle brackets, with your instance's Base URL and confirm that the request returns JSON search results.

```text
<SearXNG Base URL>/search?q=SearXNG&format=json
```

## Settings

Open **Plugins → SearXNG Web Search** (package: `dsh-web-search-searxng`), edit the form, and select **Save settings**.
Then select **Use SearXNG for search** to change the standard search provider.

The form follows the Harness display language. Switching languages preserves unsaved values and updates notifications.
Display language and the search language field are configured separately.

| Field | Default | Description |
| --- | --- | --- |
| Base URL | `http://127.0.0.1:8888` | Instance URL without `/search` or a query |
| Maximum results | `8` | 1–50; the standard tool's result limit also applies |
| Search language | Blank | SearXNG default; example: `ja-JP` |
| Search engines | Blank | SearXNG defaults; example: `bing,duckduckgo` |
| Timeout | `15000` | Milliseconds; 100–120000 |

Saved changes apply to the next search and survive Harness restarts.
Unsaved edits do not affect searches. Rejected saves preserve your edits;
select **Discard changes** to load the latest saved settings.
Changing the search provider only updates `web.searchProvider` and preserves the fetch provider.

When you request a web search in a conversation, SearXNG results are returned as URLs, titles, and snippets that can be cited.
Results depend on SearXNG's engine configuration and each engine's availability.
Connection failures do not trigger an automatic switch to another search service.
Provider exceptions use English messages and stable error codes; form validation follows the display language.

## Restoring defaults and removal

Before disabling or removing the plugin, select **Restore default search** in its settings.
Then disable or remove it from Plugins. You can keep the source directory.

For CLI removal, restore the search provider first and fully quit Harness before running:

```powershell
& '<DeepSeek Harness installation directory>\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop remove dsh-web-search-searxng
```

## Development and tests

```powershell
Set-Location '<plugin directory>'
node --test
npm run check
```

Tests use Node's built-in test runner and a mock HTTP server to verify searches and failure handling.
Settings tests cover saving, provider selection, conflicts, validation, language changes, and draft preservation.
Package tests verify that each locale selects a short description instead of the README. No external services or API keys are needed.

Host entry: `index.js`; search implementation: `provider.js`; browser entry: `client.js`.
The settings entry ID is `web-search-searxng`, and the provider ID is `searxng-local`.

## License

This project is licensed under the [MIT License](LICENSE).
