/**
 * Perceptual Image Hashing — lightweight alternative to CLIP embeddings.
 * 
 * Uses average hash (aHash) + difference hash (dHash) for fast visual similarity.
 * No ML model needed, runs in pure JS, sub-millisecond per image.
 * 
 * Inspired by: agentralabs/agentic-vision (which uses CLIP ViT-B/32 via ONNX).
 * We trade some semantic understanding for zero dependencies and instant speed.
 */

let sharp: any = null;

async function getSharp() {
  if (!sharp) {
    try {
      sharp = (await import('sharp')).default;
    } catch {
      throw new Error('sharp not installed. Run: npm install sharp');
    }
  }
  return sharp;
}

/**
 * Compute a 64-bit average hash (aHash) for an image.
 * Resize to 8x8 grayscale, compare each pixel to mean.
 */
export async function averageHash(input: Buffer | string): Promise<string> {
  const s = await getSharp();
  const { data } = await s(input)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(data as Buffer);
  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;

  let hash = '';
  for (const px of pixels) {
    hash += px >= mean ? '1' : '0';
  }
  return binaryToHex(hash);
}

/**
 * Compute a 64-bit difference hash (dHash) for an image.
 * Resize to 9x8 grayscale, compare adjacent pixels horizontally.
 * More robust to minor edits than aHash.
 */
export async function differenceHash(input: Buffer | string): Promise<string> {
  const s = await getSharp();
  const { data } = await s(input)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(data as Buffer);
  let hash = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 9 + col;
      hash += pixels[idx] < pixels[idx + 1] ? '1' : '0';
    }
  }
  return binaryToHex(hash);
}

/**
 * Combined perceptual hash: concatenation of aHash + dHash = 128-bit fingerprint.
 */
export async function perceptualHash(input: Buffer | string): Promise<string> {
  const [ah, dh] = await Promise.all([
    averageHash(input),
    differenceHash(input),
  ]);
  return ah + dh;
}

/**
 * Hamming distance between two hex hash strings.
 * Returns number of differing bits.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    // Count bits in nibble
    dist += ((xor >> 3) & 1) + ((xor >> 2) & 1) + ((xor >> 1) & 1) + (xor & 1);
  }
  return dist;
}

/**
 * Similarity score between two hashes (0.0 = completely different, 1.0 = identical).
 */
export function hashSimilarity(a: string, b: string): number {
  const totalBits = a.length * 4; // each hex char = 4 bits
  if (totalBits === 0) return 0;
  const dist = hammingDistance(a, b);
  if (dist === Infinity) return 0;
  return 1 - (dist / totalBits);
}

/**
 * Generate a JPEG thumbnail (max 320px on longest side).
 */
export async function generateThumbnail(input: Buffer | string, maxSize = 320): Promise<Buffer> {
  const s = await getSharp();
  return s(input)
    .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
}

/**
 * Get image dimensions.
 */
export async function getImageDimensions(input: Buffer | string): Promise<{ width: number; height: number }> {
  const s = await getSharp();
  const meta = await s(input).metadata();
  return { width: meta.width || 0, height: meta.height || 0 };
}

function binaryToHex(binary: string): string {
  let hex = '';
  for (let i = 0; i < binary.length; i += 4) {
    const nibble = binary.substring(i, i + 4).padEnd(4, '0');
    hex += parseInt(nibble, 2).toString(16);
  }
  return hex;
}
