'use strict';

const { readFile, writeFile } = require('node:fs/promises');

const TRANSPARENT_BACKGROUND_CATEGORIES = new Set([
  'icons',
  'player',
  'enemies',
  'bosses',
  'ui',
  'fx',
  'objects',
]);

const BITFORGE_CATEGORIES = new Set([
  'icons',
  'player',
  'enemies',
  'bosses',
  'ui',
  'fx',
  'objects',
]);

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
    payload.image && typeof payload.image.toBuffer === 'function' && payload.image.toBuffer(),
    payload.image && payload.image.dataUrl,
    payload.image && payload.image.base64,
    payload.image_base64,
    payload.imageBase64,
    payload.data && payload.data.image,
    payload.data && payload.data.image_base64,
    Array.isArray(payload.images) && payload.images[0],
    Array.isArray(payload.data) && payload.data[0] && payload.data[0].image,
  ];

  for (const candidate of candidates) {
    if (Buffer.isBuffer(candidate) && looksLikeImage(candidate)) return candidate;
    const buffer = decodeBase64Image(candidate);
    if (buffer && buffer.length > 0) return buffer;
  }

  return null;
}

function getPixelLabSecret(options = {}) {
  return options.secret || process.env.PIXELLAB_SECRET || options.apiKey || process.env.PIXELLAB_API_KEY || '';
}

function getPixelLabBaseUrl(options = {}) {
  return options.baseUrl || process.env.PIXELLAB_BASE_URL || undefined;
}

async function loadSdk() {
  return import('@pixellab-code/pixellab');
}

function shouldUseBitforge(asset) {
  const width = asset.size && asset.size.width;
  const height = asset.size && asset.size.height;
  const isSmallCanvas = Number.isFinite(width) && Number.isFinite(height) && width <= 200 && height <= 200;

  if (asset.category === 'tilesets') return false;
  return BITFORGE_CATEGORIES.has(asset.category) || isSmallCanvas;
}

function buildDescription(asset, styleGuide = {}) {
  return [styleGuide.sharedPromptPrefix, asset.prompt].filter(Boolean).join('. ');
}

function buildSdkPayload(asset, styleGuide = {}) {
  const negativeDescription = asset.negativePrompt || styleGuide.negativePrompt || undefined;
  const noBackground = TRANSPARENT_BACKGROUND_CATEGORIES.has(asset.category)
    ? true
    : asset.category === 'tilesets'
      ? false
      : undefined;

  return {
    description: buildDescription(asset, styleGuide),
    imageSize: {
      width: asset.size && asset.size.width,
      height: asset.size && asset.size.height,
    },
    negativeDescription,
    noBackground,
    outline: 'single color black outline',
    shading: 'basic shading',
    detail: 'medium detail',
  };
}

async function saveSdkImage(response, outputPath) {
  if (response && response.image && typeof response.image.saveToFile === 'function') {
    await response.image.saveToFile(outputPath);
    const savedBuffer = await readFile(outputPath);
    if (!looksLikeImage(savedBuffer)) {
      throw new Error('PixelLab SDK saved a file that failed image magic-byte validation.');
    }
    return savedBuffer;
  }

  const imageBuffer = extractImageBuffer(response);
  if (!imageBuffer) {
    throw new Error('PixelLab SDK response did not include a valid base64 image or data URL.');
  }

  await writeFile(outputPath, imageBuffer);
  return imageBuffer;
}

class PixelLabClient {
  constructor(options = {}) {
    this.secret = getPixelLabSecret(options);
    this.baseUrl = getPixelLabBaseUrl(options);
    this.sdkClient = options.sdkClient || null;
    this.sdkModule = options.sdkModule || null;
  }

  assertReady() {
    if (!this.secret && !this.sdkClient) {
      throw new Error('PIXELLAB_API_KEY or PIXELLAB_SECRET is required for PixelLab execution.');
    }
  }

  async getSdkClient() {
    if (this.sdkClient) return this.sdkClient;

    const sdk = this.sdkModule || await loadSdk();
    const SdkPixelLabClient = sdk.PixelLabClient || (sdk.default && sdk.default.PixelLabClient) || sdk.default;
    if (typeof SdkPixelLabClient !== 'function') {
      throw new Error('PixelLab SDK did not export PixelLabClient.');
    }

    this.sdkClient = this.baseUrl
      ? new SdkPixelLabClient(this.secret, this.baseUrl)
      : new SdkPixelLabClient(this.secret);
    return this.sdkClient;
  }

  buildPayload(asset, styleGuide = {}) {
    return buildSdkPayload(asset, styleGuide);
  }

  selectGenerationMethod(asset) {
    return shouldUseBitforge(asset) ? 'generateImageBitforge' : 'generateImagePixflux';
  }

  async generateAsset(asset, styleGuide = {}, outputPath) {
    this.assertReady();

    const client = await this.getSdkClient();
    const methodName = this.selectGenerationMethod(asset);
    if (typeof client[methodName] !== 'function') {
      throw new Error(`PixelLab SDK client does not support ${methodName}.`);
    }

    const payload = this.buildPayload(asset, styleGuide);
    const response = await client[methodName](payload);

    if (outputPath) {
      const imageBuffer = await saveSdkImage(response, outputPath);
      return { imageBuffer, response, method: methodName, usage: response && response.usage };
    }

    const imageBuffer = extractImageBuffer(response);
    if (!imageBuffer) {
      throw new Error('PixelLab SDK response did not include a valid base64 image or data URL.');
    }

    return { imageBuffer, response, method: methodName, usage: response && response.usage };
  }
}

module.exports = {
  BITFORGE_CATEGORIES,
  PixelLabClient,
  TRANSPARENT_BACKGROUND_CATEGORIES,
  buildSdkPayload,
  decodeBase64Image,
  looksLikeImage,
};
