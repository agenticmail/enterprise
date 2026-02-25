/**
 * Image Capture and Processing
 * 
 * Handles image capture from various sources and generates thumbnails with metadata.
 */

import fs from 'fs/promises';
import sharp from 'sharp';
import { CaptureSource, ObservationMeta, VisionError } from './types.js';
import { computePhash } from './phash.js';

/** Maximum thumbnail width in pixels */
const THUMBNAIL_WIDTH = 256;

/** JPEG quality for thumbnails */
const THUMBNAIL_QUALITY = 60;

/**
 * Capture and process an image from file path.
 */
export async function captureFromFile(filePath: string): Promise<{
  thumbnail: string;
  phash: string;
  source: CaptureSource;
  metadata: ObservationMeta;
}> {
  try {
    const imageBuffer = await fs.readFile(filePath);
    return await processImageBuffer(imageBuffer, { type: 'file', path: filePath });
  } catch (error: any) {
    throw new VisionError(`Failed to capture from file '${filePath}': ${error.message}`);
  }
}

/**
 * Capture and process an image from base64 data.
 */
export async function captureFromBase64(data: string, mimeType = 'image/jpeg'): Promise<{
  thumbnail: string;
  phash: string;
  source: CaptureSource;
  metadata: ObservationMeta;
}> {
  try {
    // Remove data URL prefix if present
    const base64Data = data.replace(/^data:image\/[^;]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    return await processImageBuffer(imageBuffer, { type: 'base64', mime: mimeType });
  } catch (error: any) {
    throw new VisionError(`Failed to capture from base64 data: ${error.message}`);
  }
}

/**
 * Capture and process a Playwright screenshot buffer.
 */
export async function captureFromScreenshot(screenshotBuffer: Buffer, region?: { x: number; y: number; w: number; h: number }): Promise<{
  thumbnail: string;
  phash: string;
  source: CaptureSource;
  metadata: ObservationMeta;
}> {
  try {
    return await processImageBuffer(screenshotBuffer, { type: 'screenshot', region });
  } catch (error: any) {
    throw new VisionError(`Failed to capture from screenshot: ${error.message}`);
  }
}

/**
 * Process an image buffer and return processed data.
 */
async function processImageBuffer(imageBuffer: Buffer, source: CaptureSource): Promise<{
  thumbnail: string;
  phash: string;
  source: CaptureSource;
  metadata: ObservationMeta;
}> {
  try {
    // Get original image metadata
    const image = sharp(imageBuffer);
    const { width: originalWidth, height: originalHeight } = await image.metadata();

    if (!originalWidth || !originalHeight) {
      throw new VisionError('Unable to determine image dimensions');
    }

    // Generate thumbnail
    const thumbnail = await generateThumbnail(imageBuffer);

    // Get thumbnail dimensions
    const thumbnailImage = sharp(Buffer.from(thumbnail, 'base64'));
    const { width, height } = await thumbnailImage.metadata();

    if (!width || !height) {
      throw new VisionError('Unable to determine thumbnail dimensions');
    }

    // Compute perceptual hash
    const phash = await computePhash(imageBuffer);

    // Calculate quality score based on resolution and other factors
    const qualityScore = calculateQualityScore(originalWidth, originalHeight);

    const metadata: ObservationMeta = {
      width,
      height,
      originalWidth,
      originalHeight,
      labels: [], // Could be extended with AI-based labeling
      qualityScore,
    };

    return {
      thumbnail,
      phash,
      source,
      metadata,
    };
  } catch (error: any) {
    if (error instanceof VisionError) {
      throw error;
    }
    throw new VisionError(`Failed to process image: ${error.message}`);
  }
}

/**
 * Generate a JPEG thumbnail, preserving aspect ratio.
 */
async function generateThumbnail(imageBuffer: Buffer): Promise<string> {
  try {
    const thumbnail = await sharp(imageBuffer)
      .resize(THUMBNAIL_WIDTH, undefined, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: true })
      .toBuffer();

    return thumbnail.toString('base64');
  } catch (error: any) {
    throw new VisionError(`Failed to generate thumbnail: ${error.message}`);
  }
}

/**
 * Calculate a quality score based on image characteristics.
 * Returns a value between 0.0 and 1.0.
 */
function calculateQualityScore(width: number, height: number): number {
  // Base score on resolution
  const totalPixels = width * height;
  
  // Quality tiers (these could be adjusted based on requirements)
  if (totalPixels >= 1920 * 1080) return 1.0;  // HD+
  if (totalPixels >= 1280 * 720) return 0.9;   // HD
  if (totalPixels >= 800 * 600) return 0.8;    // SVGA
  if (totalPixels >= 640 * 480) return 0.7;    // VGA
  if (totalPixels >= 320 * 240) return 0.6;    // QVGA
  return 0.5; // Below QVGA
}

/**
 * Extract image format from buffer (useful for validation).
 */
export async function getImageFormat(imageBuffer: Buffer): Promise<string> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    return metadata.format || 'unknown';
  } catch (error: any) {
    throw new VisionError(`Failed to detect image format: ${error.message}`);
  }
}

/**
 * Validate that a buffer contains a valid image.
 */
export async function validateImage(imageBuffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    return !!(metadata.width && metadata.height);
  } catch {
    return false;
  }
}

/**
 * Resize an image to specific dimensions (useful for comparisons).
 */
export async function resizeImage(
  imageBuffer: Buffer, 
  width: number, 
  height: number,
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside' = 'fill'
): Promise<Buffer> {
  try {
    return await sharp(imageBuffer)
      .resize(width, height, { fit })
      .toBuffer();
  } catch (error: any) {
    throw new VisionError(`Failed to resize image: ${error.message}`);
  }
}

/**
 * Convert image to grayscale (useful for diff operations).
 */
export async function convertToGrayscale(imageBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(imageBuffer)
      .greyscale()
      .toBuffer();
  } catch (error: any) {
    throw new VisionError(`Failed to convert to grayscale: ${error.message}`);
  }
}