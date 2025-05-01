import fetch from 'node-fetch';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Constants for use in Zod schemas and other runtime contexts
export const MODELS = {
  GPT_IMAGE: 'gpt-image-1',
  DALLE2: 'dall-e-2',
  DALLE3: 'dall-e-3',
} as const;

export const SIZES = {
  S256: '256x256',
  S512: '512x512',
  S1024: '1024x1024',
  LANDSCAPE: '1536x1024',
  PORTRAIT: '1024x1536',
  WIDE: '1792x1024',
  TALL: '1024x1792',
  AUTO: 'auto'
} as const;

export const RESPONSE_FORMATS = {
  URL: 'url',
  B64_JSON: 'b64_json'
} as const;

export const STYLES = {
  VIVID: 'vivid',
  NATURAL: 'natural'
} as const;

export const QUALITIES = {
  STANDARD: 'standard',
  AUTO: 'auto',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const;

export const BACKGROUNDS = {
  TRANSPARENT: 'transparent',
  OPAQUE: 'opaque',
  AUTO: 'auto'
} as const;

export const OUTPUT_FORMATS = {
  PNG: 'png',
  JPEG: 'jpeg',
  WEBP: 'webp'
} as const;

export const MODERATION_LEVELS = {
  LOW: 'low',
  AUTO: 'auto'
} as const;

export type ImageModel = typeof MODELS[keyof typeof MODELS];
export type ImageSize = typeof SIZES[keyof typeof SIZES];
export type ImageResponseFormat = typeof RESPONSE_FORMATS[keyof typeof RESPONSE_FORMATS];
export type ImageStyle = typeof STYLES[keyof typeof STYLES];
export type ImageQuality = typeof QUALITIES[keyof typeof QUALITIES];
export type ImageBackground = typeof BACKGROUNDS[keyof typeof BACKGROUNDS];
export type ImageOutputFormat = typeof OUTPUT_FORMATS[keyof typeof OUTPUT_FORMATS];
export type ImageModeration = typeof MODERATION_LEVELS[keyof typeof MODERATION_LEVELS];

export interface ImageGenerationRequest {
  prompt: string;
  model?: ImageModel;
  n?: number;
  size?: ImageSize;
  response_format?: ImageResponseFormat;
  style?: ImageStyle;
  quality?: ImageQuality;
  user?: string;
  background?: ImageBackground;
  output_format?: ImageOutputFormat;
  output_compression?: number;
  moderation?: ImageModeration;
  outputPath?: string;
}

export interface ImageObject {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: ImageObject[];
}

export interface ImageEditRequest {
  images: string[]; // Array of *file paths* to local images
  prompt: string;
  mask?: string; // Optional file path to local mask image
  model?: ImageModel;
  n?: number;
  size?: ImageSize;
  response_format?: ImageResponseFormat;
  quality?: ImageQuality;
  user?: string;
  output_format?: ImageOutputFormat;
  output_compression?: number;
  outputPath?: string;
}

export class OpenAIImageClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com/v1/images/generations';
  private editUrl: string = 'https://api.openai.com/v1/images/edits';
  private allowedModels: Record<string, ImageModel>;

  constructor(apiKey: string, allowedModels?: string[]) {
    this.apiKey = apiKey;
    
    // If specific models are provided, filter the allowed models
    if (allowedModels && allowedModels.length > 0) {
      this.allowedModels = {};
      allowedModels.forEach(modelName => {
        const modelEntry = Object.entries(MODELS).find(([_, value]) => value === modelName);
        if (modelEntry) {
          const [key, value] = modelEntry;
          this.allowedModels[key] = value;
        } else {
          console.warn(`Warning: Unknown model "${modelName}" specified. Ignoring.`);
        }
      });
      
      // If no valid models were specified, use all models
      if (Object.keys(this.allowedModels).length === 0) {
        console.warn("No valid models specified. Using all available models.");
        this.allowedModels = { ...MODELS };
      }
    } else {
      // If no models are specified, use all available models
      this.allowedModels = { ...MODELS };
    }
    
    console.log("Available models:", Object.values(this.allowedModels));
  }
  
  /**
   * Get the allowed models for this client instance
   * @returns Record of allowed models
   */
  getAllowedModels(): Record<string, ImageModel> {
    return this.allowedModels;
  }
  
  /**
   * Get the default model (first in the allowed models list)
   * @returns The default model to use
   */
  getDefaultModel(): ImageModel {
    return Object.values(this.allowedModels)[0];
  }

  /**
   * Edit images using OpenAI's image edit API.
   * Accepts an **array of local file paths**.
   * @param params The parameters for image editing
   * @returns A promise that resolves to the generated images
   */
  async editImages(params: ImageEditRequest): Promise<ImageGenerationResponse> {
    if (!params.images || params.images.length === 0) {
      throw new Error('At least one image file path is required');
    }
    
    if (!params.prompt) {
      throw new Error('Prompt is required');
    }

    // Set default values for parameters that aren't specified
    const defaults = {
      model: MODELS.GPT_IMAGE, // Only dall-e-2 and gpt-image-1 are supported for edits
      n: 1,
      size: SIZES.S1024,
      response_format: RESPONSE_FORMATS.B64_JSON,
      quality: QUALITIES.AUTO,
      output_format: OUTPUT_FORMATS.PNG,
      output_compression: 100,
    };

    // Apply defaults for any missing parameters
    params = { ...defaults, ...params };
    
    // Validate that the specified model is allowed and supported for edits
    if (params.model) {
      const isModelAllowed = Object.values(this.allowedModels).includes(params.model);
      if (!isModelAllowed) {
        throw new Error(`Model "${params.model}" is not allowed. Allowed models: ${Object.values(this.allowedModels).join(', ')}`);
      }
      
      // Check if model is supported for edits
      if (params.model !== MODELS.DALLE2 && params.model !== MODELS.GPT_IMAGE) {
        throw new Error('Only dall-e-2 and gpt-image-1 are supported for image editing');
      }
    }

    // Model-specific validation
    if (params.model === MODELS.DALLE2 && params.images.length !== 1) {
      throw new Error('dall-e-2 only supports a single image for editing');
    }

    // Size validation based on model
    if (params.model === MODELS.DALLE2 && params.size && 
        params.size !== '256x256' && params.size !== '512x512' && params.size !== '1024x1024') {
      throw new Error('dall-e-2 only supports sizes 256x256, 512x512, or 1024x1024');
    }

    const formData = new FormData();
    
    // Append all provided image files using array notation for multiple images
    params.images.forEach((filePath, index) => {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Image file not found: ${filePath}`);
      }
      const buffer = fs.readFileSync(filePath);
      formData.append('image[]', buffer, { filename: path.basename(filePath) });
    });
    
    // Add mask if provided
    if (params.mask) {
        if (!fs.existsSync(params.mask)) {
          throw new Error(`Mask file not found: ${params.mask}`);
        }
        const maskBuffer = fs.readFileSync(params.mask);
        formData.append('mask', maskBuffer, { filename: path.basename(params.mask) });
    }
    
    // Add other parameters
    formData.append('prompt', params.prompt);
    if (params.model) formData.append('model', params.model);
    if (params.n) formData.append('n', params.n.toString());
    if (params.size) formData.append('size', params.size);
    if (params.response_format && params.model !== MODELS.GPT_IMAGE) formData.append('response_format', params.response_format);
    if (params.quality) formData.append('quality', params.quality);
    if (params.user) formData.append('user', params.user);

    const response = await fetch(this.editUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json() as { error: { message: string } };
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    return response.json() as Promise<ImageGenerationResponse>;
  }
  
  /**
   * Helper method to convert base64 to Buffer
   */
  private base64ToBuffer(base64: string): Buffer {
    // Remove data URL prefix if present
    const base64Data = base64.includes('base64,') ? 
      base64.split('base64,')[1] : 
      base64;
    
    return Buffer.from(base64Data, 'base64');
  }

  /**
   * Generate images using OpenAI's image generation API
   * @param params The parameters for image generation
   * @returns A promise that resolves to the generated images
   */
  async generateImages(params: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    if (!params.prompt) {
      throw new Error('Prompt is required');
    }

    // Set default values for parameters that aren't specified
    const defaults = {
      model: this.getDefaultModel(),
      n: 1,
      size: SIZES.S1024,
      response_format: RESPONSE_FORMATS.B64_JSON,
      style: STYLES.VIVID,
      background: BACKGROUNDS.AUTO,
      quality: QUALITIES.AUTO,
      output_format: OUTPUT_FORMATS.PNG,
      output_compression: 100,
      moderation: MODERATION_LEVELS.LOW,
    };

    // Apply defaults for any missing parameters
    params = { ...defaults, ...params };
    
    // Validate that the specified model is allowed
    if (params.model) {
      const isModelAllowed = Object.values(this.allowedModels).includes(params.model);
      if (!isModelAllowed) {
        throw new Error(`Model "${params.model}" is not allowed. Allowed models: ${Object.values(this.allowedModels).join(', ')}`);
      }
    }

    // Model-specific validation
    if (params.model === MODELS.DALLE3 && params.n && params.n > 1) {
      throw new Error('dall-e-3 model only supports n=1');
    }
    
    // Remove style parameter for models other than dall-e-3
    if (params.model !== MODELS.DALLE3) {
      params.style = undefined;
    }

    // Size validation based on model
    if (params.model === MODELS.DALLE2 && params.size && 
        params.size !== '256x256' && params.size !== '512x512' && params.size !== '1024x1024') {
      throw new Error('dall-e-2 only supports sizes 256x256, 512x512, or 1024x1024');
    }

    if (params.model === MODELS.DALLE3 && params.size && 
        params.size !== '1024x1024' && params.size !== '1792x1024' && params.size !== '1024x1792') {
      throw new Error('dall-e-3 only supports sizes 1024x1024, 1792x1024, or 1024x1792');
    }

    // Handle transparency requirements
    if (params.background === BACKGROUNDS.TRANSPARENT && 
        params.output_format && 
        params.output_format !== 'png' && params.output_format !== 'webp') {
      throw new Error('When background is transparent, output_format must be png or webp');
    }

    const requestParams = {...params};
    if (params.model !== MODELS.DALLE2 && params.model !== MODELS.DALLE3) {
      // gpt-image-1 always returns base64-encoded images and doesn't support response_format
      requestParams.response_format = undefined;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestParams)
    });

    if (!response.ok) {
      const errorData = await response.json() as { error: { message: string } };
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    return response.json() as Promise<ImageGenerationResponse>;
  }

  /**
   * Saves an image to a file with a UUID filename or to a specific path
   * @param imageData Base64 encoded image data
   * @param outputFormat The format to save the image as (default: png)
   * @param outputPath Optional absolute path to save the image to (default: /tmp). Can include filename.
   * @returns The path to the saved file
   */
  saveImageToTempFile(
    imageData: string, 
    outputFormat: ImageOutputFormat = OUTPUT_FORMATS.PNG,
    outputPath?: string
  ): string {
    // Remove data URL prefix if present
    const base64Data = imageData.includes('base64,') ? 
      imageData.split('base64,')[1] : 
      imageData;
    
    const buffer = Buffer.from(base64Data, 'base64');
    
    let filePath: string;
    
    if (outputPath) {
      // Check if outputPath includes a filename (has an extension)
      const parsedPath = path.parse(outputPath);
      
      if (parsedPath.ext) {
        // outputPath includes a filename
        filePath = outputPath;
        
        // Ensure the directory exists
        const dirPath = parsedPath.dir;
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      } else {
        // outputPath is just a directory, use UUID for filename
        const uuid = uuidv4();
        
        // Ensure the directory exists
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }
        
        filePath = path.join(outputPath, `${uuid}.${outputFormat}`);
      }
    } else {
      // Default behavior - save to /tmp with UUID filename
      const uuid = uuidv4();
      filePath = path.join('/tmp', `${uuid}.${outputFormat}`);
    }
    
    fs.writeFileSync(filePath, buffer);
    
    return filePath;
  }

  /**
   * Saves an image from a generation response to a file with a UUID filename
   * @param response The image generation response
   * @param index The index of the image to save (default: 0)
   * @param outputFormat The format to save the image as (default: png)
   * @param outputPath Optional absolute path to save the image to (default: /tmp)
   * @returns The path to the saved file
   * @throws Error if the response does not contain base64 image data
   */
  saveResponseImageToTempFile(
    response: ImageGenerationResponse,
    index: number = 0,
    outputFormat: ImageOutputFormat = OUTPUT_FORMATS.PNG,
    outputPath?: string
  ): string {
    if (!response.data[index]?.b64_json) {
      throw new Error('Response does not contain base64 image data');
    }
    
    return this.saveImageToTempFile(response.data[index].b64_json, outputFormat, outputPath);
  }
}

/**
 * Example usage:
 * 
 * const client = new OpenAIImageClient('your-api-key');
 * const editResponse = await client.editImages({
 *   images: ['/path/to/image.png'], // array of file paths
 *   prompt: 'Add a rainbow in the sky'
 * });
 * 
 * // Save the edited image to a file
 * const filePath = client.saveResponseImageToTempFile(editResponse);
 * console.log(`Image saved to: ${filePath}`);
 */