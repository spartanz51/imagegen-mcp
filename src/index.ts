import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { OpenAIImageClient, 
  SIZES, STYLES, RESPONSE_FORMATS, OUTPUT_FORMATS, MODERATION_LEVELS, BACKGROUNDS, QUALITIES } from "./libs/openaiImageClient.js";

import dotenv from "dotenv";
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

// Parse command line arguments for models
const args = process.argv.slice(2);
let allowedModels: string[] = [];

// Parse --models flag
const modelsIndex = args.indexOf('--models');
if (modelsIndex !== -1) {
  for (let i = modelsIndex + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      break;
    }
    allowedModels.push(args[i]);
  }
}


const imageClient = new OpenAIImageClient(OPENAI_API_KEY, allowedModels);


function objectValuesToZodEnum<T extends string>(obj: Record<string, T>) {
  return Object.values(obj) as [T, ...T[]];
}

const server = new McpServer({
  name: "Image Generation",
  version: "1.0.0"
});

server.tool("text-to-image",
  { 
    text: z.string().describe("The prompt to generate an image from"),
    outputPath: z.string().describe("Absolute path where the output file should be saved."),
    model: z.enum(objectValuesToZodEnum(imageClient.getAllowedModels())).optional().describe("The model to use").default(imageClient.getDefaultModel()),
    size: z.enum(objectValuesToZodEnum(SIZES)).optional().describe("Size of the generated image").default(SIZES.S1024),
    style: z.enum(objectValuesToZodEnum(STYLES)).optional().describe("Style of the image (for dall-e-3)").default(STYLES.VIVID),
    output_format: z.enum(objectValuesToZodEnum(OUTPUT_FORMATS)).optional().describe("The format of the generated image").default(OUTPUT_FORMATS.PNG),
    output_compression: z.number().optional().describe("The compression of the generated image").default(100),
    moderation: z.enum(objectValuesToZodEnum(MODERATION_LEVELS)).optional().describe("The moderation level of the generated image").default(MODERATION_LEVELS.LOW),
    background: z.enum(objectValuesToZodEnum(BACKGROUNDS)).optional().describe("The background of the generated image").default(BACKGROUNDS.AUTO),
    quality: z.enum(objectValuesToZodEnum(QUALITIES)).optional().describe("The quality of the generated image").default(QUALITIES.AUTO),
    n: z.number().optional().describe("The number of images to generate").default(1), 
  },
  async ({ text, model, size, style, output_format, output_compression, moderation, background, quality, n, outputPath }) => {
    try {
      const result = await imageClient.generateImages({
        prompt: text,
        model: model as any,
        size: size as any,
        style: style as any,
        response_format: RESPONSE_FORMATS.B64_JSON,
        output_format: output_format as any,
        output_compression: output_compression as any,
        moderation: moderation as any,
        background: background as any,
        quality: quality as any,
        n: n as any
      });

      if (result.data.length === 0) {
        throw new Error("No images were generated");
      }

      const imageData = result.data[0].b64_json;
      if (!imageData) {
        throw new Error("Image data not found in response");
      }

      // Save the image to the specified file path or a temporary file
      const filePath = imageClient.saveImageToTempFile(imageData, output_format, outputPath);

      return {
        content: [
          {
            type: "text",
            text: filePath
          }
        ]
      };
    } catch (error: unknown) {
      console.error("Error generating image:", error);
      return {
        content: [
          { 
            type: "text", 
            text: `Error generating image: ${error instanceof Error ? error.message : String(error)}` 
          }
        ]
      };
    }
  }
);

server.tool("image-to-image",
  { 
    images: z.array(z.string()).describe("The images to edit. Must be an array of file paths."),
    prompt: z.string().describe("A text description of the desired image(s)"),
    outputPath: z.string().describe("Absolute path where the output file should be saved."),
    mask: z.string().optional().describe("Optional mask image whose transparent areas indicate where image should be edited. Must be a file path."),
    model: z.enum(objectValuesToZodEnum(imageClient.getAllowedModels())).optional().describe("The model to use. Only gpt-image-1 and dall-e-2 are supported.").default(imageClient.getDefaultModel()),
    size: z.enum(objectValuesToZodEnum(SIZES)).optional().describe("Size of the generated image").default(SIZES.S1024),
    output_format: z.enum(objectValuesToZodEnum(OUTPUT_FORMATS)).optional().describe("The format of the generated image").default(OUTPUT_FORMATS.PNG),
    output_compression: z.number().optional().describe("The compression of the generated image").default(100),
    quality: z.enum(objectValuesToZodEnum(QUALITIES)).optional().describe("The quality of the generated image").default(QUALITIES.AUTO),
    n: z.number().optional().describe("The number of images to generate").default(1),
  },
  async ({ images, prompt, mask, model, size, output_format, output_compression, quality, n, outputPath }) => {
    try {
      const result = await imageClient.editImages({
        images: images,
        prompt,
        mask,
        model: model as any,
        size: size as any,
        response_format: RESPONSE_FORMATS.B64_JSON,
        output_format: output_format as any,
        output_compression: output_compression as any,
        quality: quality as any,
        n: n as any
      });

      if (result.data.length === 0) {
        throw new Error("No images were generated");
      }

      const imageData = result.data[0].b64_json;
      if (!imageData) {
        throw new Error("Image data not found in response");
      }

      // Save the image to the specified file path or a temporary file
      const filePath = imageClient.saveImageToTempFile(imageData, output_format, outputPath);

      return {
        content: [
          {
            type: "text",
            text: filePath
          }
        ]
      };
    } catch (error: unknown) {
      console.error("Error editing image:", error);
      return {
        content: [
          { 
            type: "text", 
            text: `Error editing image: ${error instanceof Error ? error.message : String(error)}` 
          }
        ]
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);