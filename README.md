# MCP OpenAI Image Generation Server

This project provides a server implementation based on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) that acts as a wrapper around OpenAI's Image Generation and Editing APIs (see [OpenAI documentation](https://platform.openai.com/docs/api-reference/images)).

## Features

*   Exposes OpenAI image generation capabilities through MCP tools.
*   Supports `text-to-image` generation using models like DALL-E 2, DALL-E 3, and gpt-image-1 (if available/enabled).
*   Supports `image-to-image` editing using DALL-E 2 and gpt-image-1 (if available/enabled).
*   Configurable via environment variables and command-line arguments.
*   Handles various parameters like size, quality, style, format, etc.
*   Saves generated/edited images to temporary files and returns the path along with the base64 data.

Here's an example of generating an image directly in Cursor using the `text-to-image` tool integrated via MCP:

<div align="center">
  <img src="https://raw.githubusercontent.com/spartanz51/imagegen-mcp/refs/heads/readme/cursor.png" alt="Example usage in Cursor" width="600"/>
</div>

## Quick Run with npx

You can run the server directly from npm using `npx` (requires Node.js and npm):

```bash
npx imagegen-mcp [options]
```

See the [Running the Server](#running-the-server) section for more details on options and running locally.

## Prerequisites

*   Node.js (v18 or later recommended)
*   npm or yarn
*   An OpenAI API key

## Integration with Cursor

You can easily integrate this server with Cursor to use its image generation capabilities directly within the editor:

1.  **Open Cursor Settings:**
    *   Go to `File > Preferences > Cursor Settings` (or use the shortcut `Ctrl+,` / `Cmd+,`).
2.  **Navigate to MCP Settings:**
    *   Search for "MCP" in the settings search bar.
    *   Find the "Model Context Protocol: Custom Servers" setting.
3.  **Add Custom Server:**
    *   Click on "Edit in settings.json".
    *   Add a new entry to the `mcpServers` array. It should look something like this:

    ```json
    "mcpServers": [
        "image-generator-gpt-image": {
            "command": "npx imagegen-mcp --models gpt-image-1",
            "env": {
                "OPENAI_API_KEY": "xxx"
            }
        }
      // ... any other custom servers ...
    ]
    ```

    *   **Customize the command:**
        *   You can change the `--models` argument in the `command` field to specify which models you want Cursor to have access to (e.g., `--models dall-e-3` or `--models gpt-image-1`). Make sure your OpenAI API key has access to the selected models.
4.  **Save Settings:**
    *   Save the `settings.json` file.

Cursor should now recognize the "OpenAI Image Gen" server, and its tools (`text-to-image`, `image-to-image`) will be available in the MCP tool selection list (e.g., when using `@` mention in chat or code actions).

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the project root by copying the example:
    ```bash
    cp .env.example .env
    ```
    Edit the `.env` file and add your OpenAI API key:
    ```
    OPENAI_API_KEY=your_openai_api_key_here
    ```

## Building

To build the TypeScript code into JavaScript:
```bash
npm run build
# or
yarn build
```
This will compile the code into the `dist` directory.

## Running the Server

This section provides details on running the server locally after cloning and setup. For a quick start without cloning, see the [Quick Run with npx](#quick-run-with-npx) section.

**Using ts-node (for development):**
```bash
npx ts-node src/index.ts [options]
```

**Using the compiled code:**
```bash
node dist/index.js [options]
```

**Options:**

*   `--models <model1> <model2> ...`: Specify which OpenAI models the server should allow. If not provided, it defaults to allowing all models defined in `src/libs/openaiImageClient.ts` (currently gpt-image-1, dall-e-2, dall-e-3).
    *   Example using `npx` (also works for local runs): `... --models gpt-image-1 dall-e-3`
    *   Example after cloning: `node dist/index.js --models dall-e-3 dall-e-2`

The server will start and listen for MCP requests via standard input/output (using `StdioServerTransport`).

## MCP Tools

The server exposes the following MCP tools:

### `text-to-image`

Generates an image based on a text prompt.

**Parameters:**

*   `text` (string, required): The prompt to generate an image from.
*   `model` (enum, optional): The model to use (e.g., `gpt-image-1`, `dall-e-2`, `dall-e-3`). Defaults to the first allowed model.
*   `size` (enum, optional): Size of the generated image (e.g., `1024x1024`, `1792x1024`). Defaults to `1024x1024`. Check OpenAI documentation for model-specific size support.
*   `style` (enum, optional): Style of the image (`vivid` or `natural`). Only applicable to `dall-e-3`. Defaults to `vivid`.
*   `output_format` (enum, optional): Format (`png`, `jpeg`, `webp`). Defaults to `png`.
*   `output_compression` (number, optional): Compression level (0-100). Defaults to 100.
*   `moderation` (enum, optional): Moderation level (`low`, `auto`). Defaults to `low`.
*   `background` (enum, optional): Background (`transparent`, `opaque`, `auto`). Defaults to `auto`. `transparent` requires `output_format` to be `png` or `webp`.
*   `quality` (enum, optional): Quality (`standard`, `hd`, `auto`, ...). Defaults to `auto`. `hd` only applicable to `dall-e-3`.
*   `n` (number, optional): Number of images to generate. Defaults to 1. Note: `dall-e-3` only supports `n=1`.

**Returns:**

*   `content`: An array containing:
    *   An `image` object with base64 `data` and `mimeType`.
    *   A `text` object containing the path to the saved temporary image file (e.g., `/tmp/uuid.png`).

### `image-to-image`

Edits an existing image based on a text prompt and optional mask.

**Parameters:**

*   `images` (string, required): An array of *file paths* to local images.
*   `prompt` (string, required): A text description of the desired edits.
*   `mask` (string, optional): A *file path* of mask image (PNG). Transparent areas indicate where the image should be edited.
*   `model` (enum, optional): The model to use. Only `gpt-image-1` and `dall-e-2` are supported for editing. Defaults to the first allowed model.
*   `size` (enum, optional): Size of the generated image (e.g., `1024x1024`). Defaults to `1024x1024`. `dall-e-2` only supports `256x256`, `512x512`, `1024x1024`.
*   `output_format` (enum, optional): Format (`png`, `jpeg`, `webp`). Defaults to `png`.
*   `output_compression` (number, optional): Compression level (0-100). Defaults to 100.
*   `quality` (enum, optional): Quality (`standard`, `hd`, `auto`, ...). Defaults to `auto`.
*   `n` (number, optional): Number of images to generate. Defaults to 1.

**Returns:**

*   `content`: An array containing:
    *   An `image` object with base64 `data` and `mimeType`.
    *   A `text` object containing the path to the saved temporary image file (e.g., `/tmp/uuid.png`).

## Development

*   **Linting:** `npm run lint` or `yarn lint`
*   **Formatting:** `npm run format` or `yarn format` (if configured in `package.json`)

## Contributing

Pull Requests (PRs) are welcome! Please feel free to submit improvements or bug fixes. 