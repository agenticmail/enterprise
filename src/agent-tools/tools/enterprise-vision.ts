/**
 * AgenticMail Agent Tools — Enterprise Vision
 *
 * Image analysis tools that read image files, extract metadata (dimensions,
 * format, file size), and return images as base64 for LLM analysis.
 * Supports PNG/JPEG dimension reading, optional Tesseract OCR, and
 * multi-image comparison.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, imageResult, jsonResult, errorResult } from '../common.js';
import type { ToolResult } from '../types.js';

var SUPPORTED_FORMATS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

function readImageDimensions(buf: Buffer, ext: string): { width: number; height: number } | null {
  if (ext === '.png' && buf.length > 24) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if ((ext === '.jpg' || ext === '.jpeg') && buf.length > 2) {
    // Scan for SOF0 marker (0xFFC0)
    var i = 2;
    while (i < buf.length - 9) {
      if (buf[i] === 0xFF && buf[i + 1] === 0xC0) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      if (buf[i] !== 0xFF) break;
      var segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
  }
  if (ext === '.gif' && buf.length > 10) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (ext === '.bmp' && buf.length > 26) {
    return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
  }
  return null;
}

async function readImageFile(imagePath: string, workspaceDir?: string): Promise<{ buf: Buffer; ext: string; mime: string; absPath: string }> {
  var absPath = imagePath;
  if (!path.isAbsolute(absPath) && workspaceDir) {
    absPath = path.resolve(workspaceDir, absPath);
  }

  var ext = path.extname(absPath).toLowerCase();
  var mime = SUPPORTED_FORMATS[ext];
  if (!mime) {
    throw new Error('Unsupported image format: ' + ext + '. Supported: ' + Object.keys(SUPPORTED_FORMATS).join(', '));
  }

  var buf = await fs.readFile(absPath);
  return { buf: buf, ext: ext, mime: mime, absPath: absPath };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function promiseExecFile(cmd: string, args: string[], opts: Record<string, unknown>): Promise<{ stdout: string; stderr: string }> {
  return new Promise(function(resolve, reject) {
    execFile(cmd, args, opts as any, function(err, stdout, stderr) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

export function createVisionTools(options?: ToolCreationOptions): AnyAgentTool[] {

  var entVisionDescribe: AnyAgentTool = {
    name: 'ent_vision_describe',
    label: 'Describe Image',
    description: 'Read an image file and return it with metadata (dimensions, file size, format) for the LLM to describe. Supports PNG, JPEG, GIF, WebP, BMP, and SVG.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Path to the image file.' },
      },
      required: ['image_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var imagePath = readStringParam(params, 'image_path', { required: true });

      try {
        var img = await readImageFile(imagePath, options?.workspaceDir);
        var dimensions = readImageDimensions(img.buf, img.ext);
        var base64 = img.buf.toString('base64');

        var metaParts: string[] = [];
        metaParts.push('Image: ' + path.basename(img.absPath));
        metaParts.push('Format: ' + img.ext.slice(1).toUpperCase());
        metaParts.push('Size: ' + formatFileSize(img.buf.length));
        if (dimensions) {
          metaParts.push('Dimensions: ' + dimensions.width + 'x' + dimensions.height + ' px');
        }
        var metaText = metaParts.join(' | ');

        return imageResult({
          label: metaText,
          base64: base64,
          mimeType: img.mime,
          extraText: metaText + '\n\nPlease describe this image in detail, including its content, composition, colors, and any text visible.',
        });
      } catch (err: any) {
        return errorResult('Failed to read image: ' + (err.message || String(err)));
      }
    },
  };

  var entVisionReadText: AnyAgentTool = {
    name: 'ent_vision_read_text',
    label: 'Read Text from Image',
    description: 'Extract text from an image using Tesseract OCR if available, or return the image for LLM-based text reading. Params: image_path, language (default eng).',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Path to the image file.' },
        language: { type: 'string', description: 'OCR language code (default "eng"). Use "deu" for German, "fra" for French, etc.' },
      },
      required: ['image_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var imagePath = readStringParam(params, 'image_path', { required: true });
      var language = readStringParam(params, 'language') || 'eng';

      try {
        var img = await readImageFile(imagePath, options?.workspaceDir);
        var base64 = img.buf.toString('base64');

        // Try Tesseract OCR first
        try {
          var ocrResult = await promiseExecFile('tesseract', [img.absPath, 'stdout', '-l', language], {
            timeout: 30000,
            maxBuffer: 5 * 1024 * 1024,
          });
          var extractedText = ocrResult.stdout.trim();
          if (extractedText) {
            return jsonResult({
              method: 'tesseract',
              language: language,
              text: extractedText,
              lineCount: extractedText.split('\n').length,
            });
          }
        } catch {
          // Tesseract not available — fall through to LLM-based approach
        }

        // Fallback: return image for LLM to read text
        return imageResult({
          label: 'Image for text extraction',
          base64: base64,
          mimeType: img.mime,
          extraText: 'Tesseract OCR is not available. Please read and extract all visible text from this image. Return the text line by line, preserving the reading order.',
        });
      } catch (err: any) {
        return errorResult('Text extraction failed: ' + (err.message || String(err)));
      }
    },
  };

  var entVisionAnalyzeUi: AnyAgentTool = {
    name: 'ent_vision_analyze_ui',
    label: 'Analyze UI Screenshot',
    description: 'Analyze a UI screenshot for layout, accessibility, or component identification. Returns the image with focused analysis instructions for the LLM.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Path to the UI screenshot.' },
        focus: { type: 'string', description: 'Analysis focus: layout, accessibility, components, all (default all).', enum: ['layout', 'accessibility', 'components', 'all'] },
      },
      required: ['image_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var imagePath = readStringParam(params, 'image_path', { required: true });
      var focus = readStringParam(params, 'focus') || 'all';

      try {
        var img = await readImageFile(imagePath, options?.workspaceDir);
        var dimensions = readImageDimensions(img.buf, img.ext);
        var base64 = img.buf.toString('base64');

        var prompts: Record<string, string> = {
          layout: 'Analyze this UI screenshot focusing on LAYOUT: Identify the page structure, grid/flex usage, spacing consistency, alignment issues, responsive design concerns, and visual hierarchy. Note any layout problems.',
          accessibility: 'Analyze this UI screenshot focusing on ACCESSIBILITY: Check for color contrast issues, missing labels, touch target sizes, text readability, heading structure, focus indicators, and WCAG compliance concerns.',
          components: 'Analyze this UI screenshot focusing on COMPONENTS: Identify all UI components (buttons, forms, cards, navigation, modals, tables, etc.), their states, and any design system inconsistencies.',
          all: 'Analyze this UI screenshot comprehensively:\n1. LAYOUT: Structure, spacing, alignment, visual hierarchy\n2. ACCESSIBILITY: Contrast, labels, readability, WCAG concerns\n3. COMPONENTS: Identify all UI elements, states, and design consistency\n4. ISSUES: Any bugs, broken layouts, or UX problems visible',
        };

        var prompt = prompts[focus] || prompts.all;
        var metaParts: string[] = ['UI Screenshot Analysis'];
        if (dimensions) {
          metaParts.push('Dimensions: ' + dimensions.width + 'x' + dimensions.height + ' px');
        }
        metaParts.push('Focus: ' + focus);

        return imageResult({
          label: metaParts.join(' | '),
          base64: base64,
          mimeType: img.mime,
          extraText: metaParts.join(' | ') + '\n\n' + prompt,
        });
      } catch (err: any) {
        return errorResult('UI analysis failed: ' + (err.message || String(err)));
      }
    },
  };

  var entVisionExtractChart: AnyAgentTool = {
    name: 'ent_vision_extract_chart',
    label: 'Extract Chart Data',
    description: 'Extract numerical data from a chart image. Returns the image with instructions for the LLM to identify data points, labels, and values from bar, line, pie, or table charts.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Path to the chart image.' },
        chart_type: { type: 'string', description: 'Optional hint about chart type: bar, line, pie, table.', enum: ['bar', 'line', 'pie', 'table'] },
      },
      required: ['image_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var imagePath = readStringParam(params, 'image_path', { required: true });
      var chartType = readStringParam(params, 'chart_type');

      try {
        var img = await readImageFile(imagePath, options?.workspaceDir);
        var base64 = img.buf.toString('base64');

        var typeHint = chartType ? ' (Chart type: ' + chartType + ')' : '';

        var instructions: Record<string, string> = {
          bar: 'This is a BAR CHART. Extract: 1) All category labels on the x-axis. 2) The numerical value for each bar. 3) Any legend labels. 4) The y-axis scale and units. Return data as a structured table.',
          line: 'This is a LINE CHART. Extract: 1) All x-axis data points/labels. 2) The y-value at each point for each line. 3) Any legend labels for multiple lines. 4) The axis scales and units. Return data as a structured table.',
          pie: 'This is a PIE CHART. Extract: 1) Each slice label/category. 2) The percentage or value for each slice. 3) Any legend text. Return data as a structured table with category and percentage columns.',
          table: 'This is a DATA TABLE. Extract: 1) All column headers. 2) All row data, cell by cell. 3) Any totals or summary rows. Return the data in a structured table format.',
        };

        var prompt = chartType && instructions[chartType]
          ? instructions[chartType]
          : 'Extract all numerical data from this chart image. Identify: 1) Chart type (bar, line, pie, scatter, table, etc.). 2) All labels and categories. 3) All numerical values and data points. 4) Axis scales and units. 5) Any legends or annotations. Return the extracted data in a structured table format.';

        return imageResult({
          label: 'Chart Data Extraction' + typeHint,
          base64: base64,
          mimeType: img.mime,
          extraText: 'Chart Data Extraction' + typeHint + '\n\n' + prompt,
        });
      } catch (err: any) {
        return errorResult('Chart extraction failed: ' + (err.message || String(err)));
      }
    },
  };

  var entVisionCompare: AnyAgentTool = {
    name: 'ent_vision_compare',
    label: 'Compare Images',
    description: 'Compare two images side by side. Reads both image files, computes basic metadata (size, dimensions), and returns both images for the LLM to visually compare.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        image_path_a: { type: 'string', description: 'Path to the first image.' },
        image_path_b: { type: 'string', description: 'Path to the second image.' },
      },
      required: ['image_path_a', 'image_path_b'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var pathA = readStringParam(params, 'image_path_a', { required: true });
      var pathB = readStringParam(params, 'image_path_b', { required: true });

      try {
        var imgA = await readImageFile(pathA, options?.workspaceDir);
        var imgB = await readImageFile(pathB, options?.workspaceDir);

        var dimsA = readImageDimensions(imgA.buf, imgA.ext);
        var dimsB = readImageDimensions(imgB.buf, imgB.ext);

        var base64A = imgA.buf.toString('base64');
        var base64B = imgB.buf.toString('base64');

        var metaA: string[] = ['Image A: ' + path.basename(imgA.absPath)];
        metaA.push('Size: ' + formatFileSize(imgA.buf.length));
        if (dimsA) metaA.push('Dimensions: ' + dimsA.width + 'x' + dimsA.height);

        var metaB: string[] = ['Image B: ' + path.basename(imgB.absPath)];
        metaB.push('Size: ' + formatFileSize(imgB.buf.length));
        if (dimsB) metaB.push('Dimensions: ' + dimsB.width + 'x' + dimsB.height);

        var sizeDiff = imgB.buf.length - imgA.buf.length;
        var comparisonNotes: string[] = [];
        comparisonNotes.push('File size difference: ' + (sizeDiff > 0 ? '+' : '') + formatFileSize(Math.abs(sizeDiff)));
        if (dimsA && dimsB) {
          if (dimsA.width !== dimsB.width || dimsA.height !== dimsB.height) {
            comparisonNotes.push('Dimension change: ' + dimsA.width + 'x' + dimsA.height + ' -> ' + dimsB.width + 'x' + dimsB.height);
          } else {
            comparisonNotes.push('Same dimensions: ' + dimsA.width + 'x' + dimsA.height);
          }
        }

        var result: ToolResult = {
          content: [
            { type: 'text', text: metaA.join(' | ') + '\n' + metaB.join(' | ') + '\n' + comparisonNotes.join('. ') + '\n\nPlease compare these two images and describe: 1) Visual differences. 2) Content changes. 3) Quality or format differences. 4) Any notable additions or removals.' },
            { type: 'image', data: base64A, mimeType: imgA.mime },
            { type: 'image', data: base64B, mimeType: imgB.mime },
          ],
        };

        return result;
      } catch (err: any) {
        return errorResult('Image comparison failed: ' + (err.message || String(err)));
      }
    },
  };

  return [entVisionDescribe, entVisionReadText, entVisionAnalyzeUi, entVisionExtractChart, entVisionCompare];
}
