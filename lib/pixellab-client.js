'use strict';

const DEFAULT_PIXELLAB_API_URL = 'https://api.pixellab.ai/v1/generate';

function getFetch() {
  if (typeof fetch !== 'function') {
    throw new Error('PixelLabClient requires a Node.js runtime with global fetch support.');
  }
  return fetch;
}

function looksLikeImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;

  const isPng = buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff;
  const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP';

  return isPng || isJpeg || isWebp;
}

function decodeDataUrl(dataUrl) {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) return null;

  const buffer = Buffer.from(match[1].replace(/\s+/gu, ''), 'base64');
  return looksLikeImage(buffer) ? buffer : null;
}

function decodeBase64Image(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//iu.test(trimmed)) return null;

  const dataUrl = decodeDataUrl(trimmed);
  if (dataUrl) return dataUrl;

  const bareBase64 = trimmed.replace(/\s+/gu, '');
  if (!/^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/iu.test(bareBase64)) return null;

  const buffer = Buffer.from(bareBase64, 'base64');
  return looksLikeImage(buffer) ? buffer : null;
}

function extractImageBuffer(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const candidates = [
    payload.image,
    payload.image_base64,
    payload.imageBase64,
    payload.data && payload.data.image,
    payload.data && payload.data.image_base64,
    Array.isArray(payload.images) && payload.images[0],
    Array.isArray(payload.data) && payload.data[0] && payload.data[0].image,
  ];

  for (const candidate of candidates) {
    const buffer = decodeBase64Image(candidate);
    if (buffer && buffer.length > 0) return buffer;
  }

  return null;
}

function extractImageUrl(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const candidates = [
    payload.url,
    payload.image_url,
    payload.imageUrl,
    payload.data && payload.data.url,
    payload.data && payload.data.image_url,
    Array.isArray(payload.images) && payload.images[0],
    Array.isArray(payload.images) && payload.images[0] && payload.images[0].url,
    Array.isArray(payload.data) && payload.data[0] && (payload.data[0].url || payload.data[0].image_url),
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0) || null;
}

class PixelLabClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.PIXELLAB_API_KEY || '';
    this.apiUrl = options.apiUrl || process.env.PIXELLAB_API_URL || DEFAULT_PIXELLAB_API_URL;
    this.fetchImpl = options.fetchImpl || getFetch();
  }

  assertReady() {
    if (!this.apiKey) {
      throw new Error('PIXELLAB_API_KEY is required for PixelLab execution.');
    }
  }

  buildPayload(asset, styleGuide = {}) {
    const promptPrefix = styleGuide.sharedPromptPrefix || '';
    const prompt = [promptPrefix, asset.prompt].filter(Boolean).join('. ');
    return {
      prompt,
      negative_prompt: asset.negativePrompt || styleGuide.negativePrompt || undefined,
      width: asset.size && asset.size.width,
      height: asset.size && asset.size.height,
      metadata: {
        id: asset.id,
        category: asset.category,
        name: asset.name,
        output: asset.output,
      },
    };
  }

  async generateAsset(asset, styleGuide = {}) {
    this.assertReady();

    const response = await this.fetchImpl(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.buildPayload(asset, styleGuide)),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`PixelLab request failed with ${response.status}: ${body}`);
    }

    const payload = await response.json();
    const imageBuffer = extractImageBuffer(payload);
    if (imageBuffer) return { imageBuffer, response: payload };

    const imageUrl = extractImageUrl(payload);
    if (!imageUrl) {
      throw new Error('PixelLab response did not include a base64 image or image URL.');
    }

    const imageResponse = await this.fetchImpl(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`PixelLab image download failed with ${imageResponse.status}.`);
    }

    return {
      imageBuffer: Buffer.from(await imageResponse.arrayBuffer()),
      response: payload,
      imageUrl,
    };
  }
}

module.exports = {
  DEFAULT_PIXELLAB_API_URL,
  PixelLabClient,
};
