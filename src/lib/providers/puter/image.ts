

/**
 * Placeholder for Puter.js image generation.
 * Future: puter.ai.img(prompt, { width, height })
 */
export async function generateImage(_prompt: string, _options?: { width?: number; height?: number }): Promise<string> {
  throw new Error('Image generation not yet implemented');
}

/**
 * Placeholder for Puter.js vision (image understanding).
 * Future: puter.ai.chat([{ role: 'user', content: [{ type: 'image', url: '...' }, { type: 'text', text: '...' }] }])
 */
export async function visionChat(_messages: unknown[]): Promise<string> {
  throw new Error('Vision chat not yet implemented');
}
