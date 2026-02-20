/**
 * AgenticMail Agent Tools — Enterprise Documents
 *
 * Document generation, parsing, and conversion tools for AI agents.
 * Generates valid PDFs and DOCX files using raw format construction,
 * extracts invoice data with regex patterns, and converts between formats.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, jsonResult, textResult, errorResult } from '../common.js';

var deflateRaw = promisify(zlib.deflateRaw);

// --- Minimal PDF Writer ---

function buildPdf(textLines: string[], title?: string): Buffer {
  var offsets: number[] = [];
  var body = '';
  var objNum = 0;

  function addObj(content: string): number {
    objNum++;
    offsets.push(Buffer.byteLength(body, 'binary'));
    body += objNum + ' 0 obj\n' + content + '\nendobj\n';
    return objNum;
  }

  // Catalog (obj 1)
  addObj('<< /Type /Catalog /Pages 2 0 R >>');

  // Pages (obj 2)
  addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');

  // Build text stream
  var fontSize = 12;
  var leading = 14;
  var margin = 72;
  var pageWidth = 612;
  var pageHeight = 792;
  var usableWidth = pageWidth - 2 * margin;

  var stream = 'BT\n/F1 ' + fontSize + ' Tf\n' + margin + ' ' + (pageHeight - margin) + ' Td\n' + leading + ' TL\n';
  if (title) {
    stream += '/F1 16 Tf\n(' + escapePdfString(title) + ') Tj\nT*\n/F1 ' + fontSize + ' Tf\nT*\n';
  }
  for (var line of textLines) {
    // Wrap long lines
    var wrapped = wrapText(line, usableWidth, fontSize * 0.6);
    for (var wl of wrapped) {
      stream += '(' + escapePdfString(wl) + ') Tj\nT*\n';
    }
  }
  stream += 'ET';

  // Content stream (obj 4)
  addObj('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');

  // Page (obj 3) — inserted before stream in numbering, but we adjust
  // Re-do: we need page=3 and stream=4
  // Actually we already added catalog=1, pages=2, and streamObj got 3
  // Let's restructure: add page after stream

  // Reset and rebuild properly
  body = '';
  offsets = [];
  objNum = 0;

  // 1: Catalog
  addObj('<< /Type /Catalog /Pages 2 0 R >>');
  // 2: Pages
  addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  // 3: Page
  addObj('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight + '] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>');
  // 4: Font
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  // 5: Content stream
  addObj('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');

  // Build PDF
  var header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  var xrefOffset = Buffer.byteLength(header, 'binary') + Buffer.byteLength(body, 'binary');

  var xref = 'xref\n0 ' + (objNum + 1) + '\n0000000000 65535 f \n';
  for (var i = 0; i < offsets.length; i++) {
    var off = Buffer.byteLength(header, 'binary') + offsets[i];
    xref += String(off).padStart(10, '0') + ' 00000 n \n';
  }

  var trailer = 'trailer\n<< /Size ' + (objNum + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';

  return Buffer.from(header + body + xref + trailer, 'binary');
}

function escapePdfString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r');
}

function wrapText(text: string, maxWidth: number, charWidth: number): string[] {
  var maxChars = Math.floor(maxWidth / charWidth);
  if (text.length <= maxChars) return [text];
  var lines: string[] = [];
  var remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      break;
    }
    var breakAt = remaining.lastIndexOf(' ', maxChars);
    if (breakAt <= 0) breakAt = maxChars;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).replace(/^\s+/, '');
  }
  return lines;
}

// --- Minimal DOCX Builder ---

async function buildDocx(paragraphs: string[], title?: string): Promise<Buffer> {
  // DOCX is a ZIP of XML files. We build a minimal one using raw ZIP construction.
  var contentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<w:body>';

  if (title) {
    contentXml += '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
      + '<w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr>'
      + '<w:t>' + escapeXml(title) + '</w:t></w:r></w:p>';
  }

  for (var para of paragraphs) {
    contentXml += '<w:p><w:r><w:t xml:space="preserve">' + escapeXml(para) + '</w:t></w:r></w:p>';
  }

  contentXml += '</w:body></w:document>';

  var contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>';

  var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';

  var wordRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '</Relationships>';

  var files: Array<{ name: string; content: Buffer }> = [
    { name: '[Content_Types].xml', content: Buffer.from(contentTypesXml, 'utf-8') },
    { name: '_rels/.rels', content: Buffer.from(relsXml, 'utf-8') },
    { name: 'word/document.xml', content: Buffer.from(contentXml, 'utf-8') },
    { name: 'word/_rels/document.xml.rels', content: Buffer.from(wordRelsXml, 'utf-8') },
  ];

  return buildZip(files);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function buildZip(files: Array<{ name: string; content: Buffer }>): Promise<Buffer> {
  var localHeaders: Buffer[] = [];
  var centralHeaders: Buffer[] = [];
  var offset = 0;

  for (var file of files) {
    var nameBuffer = Buffer.from(file.name, 'utf-8');
    var compressed = await deflateRaw(file.content);
    var crc = crc32(file.content);

    // Local file header
    var local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);   // signature
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
    local.writeUInt16LE(8, 8);             // compression: deflate
    local.writeUInt16LE(0, 10);            // mod time
    local.writeUInt16LE(0, 12);            // mod date
    local.writeUInt32LE(crc, 14);          // CRC-32
    local.writeUInt32LE(compressed.length, 18);  // compressed size
    local.writeUInt32LE(file.content.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuffer.length, 26);   // name length
    local.writeUInt16LE(0, 28);            // extra field length
    nameBuffer.copy(local, 30);

    localHeaders.push(Buffer.concat([local, compressed]));

    // Central directory header
    var central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);  // signature
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0, 8);           // flags
    central.writeUInt16LE(8, 10);          // compression
    central.writeUInt16LE(0, 12);          // mod time
    central.writeUInt16LE(0, 14);          // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);          // extra field length
    central.writeUInt16LE(0, 32);          // comment length
    central.writeUInt16LE(0, 34);          // disk number
    central.writeUInt16LE(0, 36);          // internal attributes
    central.writeUInt32LE(0, 38);          // external attributes
    central.writeUInt32LE(offset, 42);     // local header offset
    nameBuffer.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length + compressed.length;
  }

  var centralOffset = offset;
  var centralSize = centralHeaders.reduce(function(sum, b) { return sum + b.length; }, 0);

  // End of central directory
  var eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);              // disk number
  eocd.writeUInt16LE(0, 6);              // central dir disk
  eocd.writeUInt16LE(files.length, 8);   // entries on disk
  eocd.writeUInt16LE(files.length, 10);  // total entries
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);             // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function crc32(buf: Buffer): number {
  var table: number[] = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      if (c & 1) c = 0xEDB88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function createDocumentTools(options?: ToolCreationOptions): AnyAgentTool[] {

  var entDocGeneratePdf: AnyAgentTool = {
    name: 'ent_doc_generate_pdf',
    label: 'Generate PDF',
    description: 'Generate a PDF document from plain text content. Supports a title and multi-line body text with automatic line wrapping.',
    category: 'file',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        output_path: { type: 'string', description: 'Path to write the PDF file.' },
        content: { type: 'string', description: 'Text content for the PDF body (one paragraph per line).' },
        title: { type: 'string', description: 'Optional document title.' },
      },
      required: ['output_path', 'content'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var outputPath = readStringParam(params, 'output_path', { required: true });
      var content = readStringParam(params, 'content', { required: true, trim: false });
      var title = readStringParam(params, 'title');

      if (!path.isAbsolute(outputPath) && options?.workspaceDir) {
        outputPath = path.resolve(options.workspaceDir, outputPath);
      }

      try {
        var lines = content.split('\n');
        var pdfBuffer = buildPdf(lines, title);
        var dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(outputPath, pdfBuffer);
        return textResult('Generated PDF: ' + outputPath + ' (' + pdfBuffer.length + ' bytes, ' + lines.length + ' lines)');
      } catch (err: any) {
        return errorResult('PDF generation failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDocGenerateDocx: AnyAgentTool = {
    name: 'ent_doc_generate_docx',
    label: 'Generate DOCX',
    description: 'Generate a Microsoft Word DOCX document from plain text content. Each line becomes a paragraph.',
    category: 'file',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        output_path: { type: 'string', description: 'Path to write the DOCX file.' },
        content: { type: 'string', description: 'Text content (one paragraph per line).' },
        title: { type: 'string', description: 'Optional document title.' },
      },
      required: ['output_path', 'content'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var outputPath = readStringParam(params, 'output_path', { required: true });
      var content = readStringParam(params, 'content', { required: true, trim: false });
      var title = readStringParam(params, 'title');

      if (!path.isAbsolute(outputPath) && options?.workspaceDir) {
        outputPath = path.resolve(options.workspaceDir, outputPath);
      }

      try {
        var paragraphs = content.split('\n');
        var docxBuffer = await buildDocx(paragraphs, title);
        var dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(outputPath, docxBuffer);
        return textResult('Generated DOCX: ' + outputPath + ' (' + docxBuffer.length + ' bytes, ' + paragraphs.length + ' paragraphs)');
      } catch (err: any) {
        return errorResult('DOCX generation failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDocOcr: AnyAgentTool = {
    name: 'ent_doc_ocr',
    label: 'OCR Image',
    description: 'Extract text from an image file using OCR. Requires Tesseract CLI to be installed. Returns extracted text or image metadata if Tesseract is unavailable.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the image file (PNG, JPG, TIFF, BMP).' },
        language: { type: 'string', description: 'OCR language code (default "eng").' },
      },
      required: ['file_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var language = readStringParam(params, 'language') || 'eng';

      if (!path.isAbsolute(filePath) && options?.workspaceDir) {
        filePath = path.resolve(options.workspaceDir, filePath);
      }

      try {
        await fs.access(filePath);
      } catch {
        return errorResult('File not found: ' + filePath);
      }

      // Try tesseract CLI
      try {
        var result = await new Promise<string>(function(resolve, reject) {
          execFile('tesseract', [filePath, 'stdout', '-l', language], { timeout: 30000 }, function(err, stdout, _stderr) {
            if (err) reject(err);
            else resolve(stdout);
          });
        });
        var text = result.trim();
        if (!text) return textResult('OCR completed but no text was detected in the image.');
        return jsonResult({ file: filePath, extractedText: text, charCount: text.length, lineCount: text.split('\n').length });
      } catch {
        // Tesseract not available — return metadata and suggestion
        var stat = await fs.stat(filePath);
        var ext = path.extname(filePath).toLowerCase();
        return jsonResult({
          file: filePath,
          size: stat.size,
          format: ext,
          message: 'Tesseract OCR is not installed. Install it with: brew install tesseract (macOS) or apt-get install tesseract-ocr (Linux). Alternatively, use the vision/read tool to view the image directly.',
        });
      }
    },
  };

  var entDocParseInvoice: AnyAgentTool = {
    name: 'ent_doc_parse_invoice',
    label: 'Parse Invoice',
    description: 'Parse structured text to extract invoice fields: invoice number, date, vendor, line items, subtotal, tax, and total. Works on plain text invoice content.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to a text file containing invoice content.' },
        content: { type: 'string', description: 'Alternatively, provide invoice text content directly.' },
      },
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path');
      var content = readStringParam(params, 'content', { trim: false });

      if (!content && filePath) {
        var resolved = filePath;
        if (!path.isAbsolute(resolved) && options?.workspaceDir) {
          resolved = path.resolve(options.workspaceDir, resolved);
        }
        try {
          content = await fs.readFile(resolved, 'utf-8');
        } catch (err: any) {
          return errorResult('Failed to read file: ' + (err.message || String(err)));
        }
      }

      if (!content) {
        return errorResult('Provide either file_path or content parameter.');
      }

      // Extract invoice fields using regex patterns
      var invoice: Record<string, any> = {};

      // Invoice number
      var invNumMatch = content.match(/(?:invoice|inv)[\s#:]*([A-Z0-9\-]+)/i);
      if (invNumMatch) invoice.invoiceNumber = invNumMatch[1];

      // Date patterns
      var dateMatch = content.match(/(?:date|issued|invoice date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2})/i);
      if (dateMatch) invoice.date = dateMatch[1].trim();

      // Due date
      var dueDateMatch = content.match(/(?:due date|payment due|due)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2})/i);
      if (dueDateMatch) invoice.dueDate = dueDateMatch[1].trim();

      // Vendor / From
      var vendorMatch = content.match(/(?:from|vendor|seller|billed by|company)[:\s]*([^\n]+)/i);
      if (vendorMatch) invoice.vendor = vendorMatch[1].trim();

      // Bill to / Customer
      var customerMatch = content.match(/(?:to|bill to|customer|client|billed to)[:\s]*([^\n]+)/i);
      if (customerMatch) invoice.customer = customerMatch[1].trim();

      // Total
      var totalMatch = content.match(/(?:total|amount due|balance due|grand total)[:\s]*([\$\u00A3\u20AC]?\s?[\d,]+\.?\d{0,2})/i);
      if (totalMatch) invoice.total = totalMatch[1].trim();

      // Subtotal
      var subtotalMatch = content.match(/(?:subtotal|sub-total|sub total)[:\s]*([\$\u00A3\u20AC]?\s?[\d,]+\.?\d{0,2})/i);
      if (subtotalMatch) invoice.subtotal = subtotalMatch[1].trim();

      // Tax
      var taxMatch = content.match(/(?:tax|vat|gst|hst)[:\s]*([\$\u00A3\u20AC]?\s?[\d,]+\.?\d{0,2})/i);
      if (taxMatch) invoice.tax = taxMatch[1].trim();

      // Line items: look for lines with description + amount pattern
      var lineItems: Array<{ description: string; amount: string }> = [];
      var lines = content.split('\n');
      for (var line of lines) {
        var lineMatch = line.match(/^(.+?)\s+([\$\u00A3\u20AC]?\s?[\d,]+\.\d{2})\s*$/);
        if (lineMatch) {
          var desc = lineMatch[1].trim();
          // Skip header/total lines
          if (!/^(subtotal|total|tax|vat|amount|balance|due|date|invoice)/i.test(desc)) {
            lineItems.push({ description: desc, amount: lineMatch[2].trim() });
          }
        }
      }
      if (lineItems.length > 0) invoice.lineItems = lineItems;

      var fieldsFound = Object.keys(invoice).length;
      if (fieldsFound === 0) {
        return textResult('No invoice fields could be extracted. The content may not be in a recognized invoice format.');
      }

      invoice._fieldsExtracted = fieldsFound;
      return jsonResult(invoice);
    },
  };

  var entDocConvert: AnyAgentTool = {
    name: 'ent_doc_convert',
    label: 'Convert Document',
    description: 'Convert between document formats: markdown to HTML, HTML to plain text, JSON to CSV, or text to markdown.',
    category: 'utility',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        input_path: { type: 'string', description: 'Path to the input file.' },
        output_path: { type: 'string', description: 'Path to write the output file.' },
        conversion: { type: 'string', description: 'Conversion type.', enum: ['md_to_html', 'html_to_text', 'json_to_csv', 'text_to_md'] },
      },
      required: ['input_path', 'output_path', 'conversion'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var inputPath = readStringParam(params, 'input_path', { required: true });
      var outputPath = readStringParam(params, 'output_path', { required: true });
      var conversion = readStringParam(params, 'conversion', { required: true });

      if (!path.isAbsolute(inputPath) && options?.workspaceDir) {
        inputPath = path.resolve(options.workspaceDir, inputPath);
      }
      if (!path.isAbsolute(outputPath) && options?.workspaceDir) {
        outputPath = path.resolve(options.workspaceDir, outputPath);
      }

      try {
        var content = await fs.readFile(inputPath, 'utf-8');
        var output: string;

        switch (conversion) {
          case 'md_to_html': {
            // Simple markdown to HTML conversion
            output = content
              .replace(/^### (.+)$/gm, '<h3>$1</h3>')
              .replace(/^## (.+)$/gm, '<h2>$1</h2>')
              .replace(/^# (.+)$/gm, '<h1>$1</h1>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.+?)\*/g, '<em>$1</em>')
              .replace(/`(.+?)`/g, '<code>$1</code>')
              .replace(/^\- (.+)$/gm, '<li>$1</li>')
              .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
              .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
              .replace(/^(?!<[hlo])(.*[^\n])$/gm, '<p>$1</p>')
              .replace(/\n{2,}/g, '\n');
            output = '<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"></head>\n<body>\n' + output + '\n</body>\n</html>';
            break;
          }
          case 'html_to_text': {
            output = content
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<\/p>/gi, '\n\n')
              .replace(/<\/div>/gi, '\n')
              .replace(/<\/h[1-6]>/gi, '\n\n')
              .replace(/<\/li>/gi, '\n')
              .replace(/<li[^>]*>/gi, '  - ')
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&nbsp;/g, ' ')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
            break;
          }
          case 'json_to_csv': {
            var data = JSON.parse(content);
            if (!Array.isArray(data)) {
              return errorResult('JSON input must be an array of objects for CSV conversion.');
            }
            if (data.length === 0) {
              output = '';
              break;
            }
            var headers = Object.keys(data[0]);
            var csvLines = [headers.map(function(h) {
              return h.indexOf(',') >= 0 || h.indexOf('"') >= 0 ? '"' + h.replace(/"/g, '""') + '"' : h;
            }).join(',')];
            for (var row of data) {
              csvLines.push(headers.map(function(h) {
                var val = row[h] != null ? String(row[h]) : '';
                return val.indexOf(',') >= 0 || val.indexOf('"') >= 0 || val.indexOf('\n') >= 0
                  ? '"' + val.replace(/"/g, '""') + '"' : val;
              }).join(','));
            }
            output = csvLines.join('\n') + '\n';
            break;
          }
          case 'text_to_md': {
            // Convert plain text to markdown: detect paragraphs, lists, headings
            var lines = content.split('\n');
            var mdLines: string[] = [];
            for (var line of lines) {
              var trimmed = line.trim();
              if (!trimmed) {
                mdLines.push('');
                continue;
              }
              // Lines that are ALL CAPS could be headings
              if (trimmed.length > 3 && trimmed === trimmed.toUpperCase() && /^[A-Z\s]+$/.test(trimmed)) {
                mdLines.push('## ' + trimmed.charAt(0) + trimmed.slice(1).toLowerCase());
              }
              // Lines starting with - or * are already list-like
              else if (/^[\-\*]\s/.test(trimmed)) {
                mdLines.push(trimmed);
              }
              // Lines starting with a number + period are ordered lists
              else if (/^\d+[\.\)]\s/.test(trimmed)) {
                mdLines.push(trimmed);
              }
              else {
                mdLines.push(trimmed);
              }
            }
            output = mdLines.join('\n');
            break;
          }
          default:
            return errorResult('Unknown conversion type: ' + conversion);
        }

        var dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(outputPath, output, 'utf-8');
        return textResult('Converted ' + conversion + ': ' + inputPath + ' -> ' + outputPath + ' (' + output.length + ' chars)');
      } catch (err: any) {
        return errorResult('Conversion failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDocExtractTables: AnyAgentTool = {
    name: 'ent_doc_extract_tables',
    label: 'Extract Tables',
    description: 'Extract tabular data from HTML files (HTML tables) or text files (aligned columns). Returns structured table data.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the HTML or text file.' },
      },
      required: ['file_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });

      if (!path.isAbsolute(filePath) && options?.workspaceDir) {
        filePath = path.resolve(options.workspaceDir, filePath);
      }

      try {
        var content = await fs.readFile(filePath, 'utf-8');
        var ext = path.extname(filePath).toLowerCase();
        var tables: Array<{ headers: string[]; rows: string[][] }> = [];

        if (ext === '.html' || ext === '.htm' || content.indexOf('<table') >= 0) {
          // Extract HTML tables
          var tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
          var tableMatch: RegExpExecArray | null;
          while ((tableMatch = tableRegex.exec(content)) !== null) {
            var tableHtml = tableMatch[1];
            var headers: string[] = [];
            var rows: string[][] = [];

            // Extract headers from <th>
            var thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
            var thMatch: RegExpExecArray | null;
            while ((thMatch = thRegex.exec(tableHtml)) !== null) {
              headers.push(thMatch[1].replace(/<[^>]+>/g, '').trim());
            }

            // Extract rows from <tr>
            var trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            var trMatch: RegExpExecArray | null;
            var firstRow = true;
            while ((trMatch = trRegex.exec(tableHtml)) !== null) {
              var cells: string[] = [];
              var tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
              var tdMatch: RegExpExecArray | null;
              while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
                cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
              }
              if (cells.length > 0) {
                if (headers.length === 0 && firstRow) {
                  headers = cells;
                } else {
                  rows.push(cells);
                }
              }
              firstRow = false;
            }

            if (headers.length > 0 || rows.length > 0) {
              tables.push({ headers: headers, rows: rows });
            }
          }
        } else {
          // Try to detect text tables (pipe-delimited or tab-delimited or aligned columns)
          var lines = content.split('\n').filter(function(l) { return l.trim() !== ''; });

          // Check for pipe-delimited tables (markdown-style)
          var pipeLines = lines.filter(function(l) { return l.indexOf('|') >= 0; });
          if (pipeLines.length >= 2) {
            var dataLines = pipeLines.filter(function(l) { return !/^[\s|:-]+$/.test(l); });
            if (dataLines.length > 0) {
              var headers = dataLines[0].split('|').map(function(c) { return c.trim(); }).filter(Boolean);
              var rows: string[][] = [];
              for (var i = 1; i < dataLines.length; i++) {
                var cells = dataLines[i].split('|').map(function(c) { return c.trim(); }).filter(Boolean);
                if (cells.length > 0) rows.push(cells);
              }
              tables.push({ headers: headers, rows: rows });
            }
          }

          // Check for tab-delimited
          if (tables.length === 0) {
            var tabLines = lines.filter(function(l) { return l.indexOf('\t') >= 0; });
            if (tabLines.length >= 2) {
              var headers = tabLines[0].split('\t').map(function(c) { return c.trim(); });
              var rows: string[][] = [];
              for (var i = 1; i < tabLines.length; i++) {
                rows.push(tabLines[i].split('\t').map(function(c) { return c.trim(); }));
              }
              tables.push({ headers: headers, rows: rows });
            }
          }
        }

        if (tables.length === 0) {
          return textResult('No tables found in ' + filePath);
        }

        return jsonResult({ file: filePath, tableCount: tables.length, tables: tables });
      } catch (err: any) {
        return errorResult('Table extraction failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDocMergePdfs: AnyAgentTool = {
    name: 'ent_doc_merge_pdfs',
    label: 'Merge PDFs',
    description: 'Concatenate multiple PDF files into a single PDF. Uses a basic approach that works with simple PDFs generated by this tool.',
    category: 'file',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        input_files: { type: 'string', description: 'JSON array of PDF file paths to merge, in order.' },
        output_path: { type: 'string', description: 'Path to write the merged PDF.' },
      },
      required: ['input_files', 'output_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var inputFilesStr = readStringParam(params, 'input_files', { required: true });
      var outputPath = readStringParam(params, 'output_path', { required: true });

      if (!path.isAbsolute(outputPath) && options?.workspaceDir) {
        outputPath = path.resolve(options.workspaceDir, outputPath);
      }

      try {
        var inputFiles: string[];
        try {
          inputFiles = JSON.parse(inputFilesStr);
        } catch {
          return errorResult('Invalid JSON for input_files. Expected a JSON array of file paths.');
        }

        if (!Array.isArray(inputFiles) || inputFiles.length < 2) {
          return errorResult('At least 2 PDF files are required for merging.');
        }

        // Collect all text content from PDFs by re-reading them
        // For simplicity, we extract text streams and regenerate a single PDF
        var allLines: string[] = [];
        for (var i = 0; i < inputFiles.length; i++) {
          var filePath = inputFiles[i];
          if (!path.isAbsolute(filePath) && options?.workspaceDir) {
            filePath = path.resolve(options.workspaceDir, filePath);
          }
          try {
            await fs.access(filePath);
          } catch {
            return errorResult('File not found: ' + filePath);
          }

          var pdfContent = await fs.readFile(filePath);
          // Extract text between BT and ET markers
          var pdfStr = pdfContent.toString('binary');
          var btIdx = pdfStr.indexOf('BT\n');
          var etIdx = pdfStr.indexOf('\nET', btIdx);
          if (btIdx >= 0 && etIdx >= 0) {
            var textBlock = pdfStr.slice(btIdx + 3, etIdx);
            var textMatches = textBlock.match(/\(([^)]*)\)\s*Tj/g);
            if (textMatches) {
              if (i > 0) allLines.push('--- Page ' + (i + 1) + ' ---');
              for (var tm of textMatches) {
                var text = tm.replace(/^\(/, '').replace(/\)\s*Tj$/, '')
                  .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
                allLines.push(text);
              }
            }
          }
        }

        var mergedPdf = buildPdf(allLines, undefined);
        var dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(outputPath, mergedPdf);
        return textResult('Merged ' + inputFiles.length + ' PDFs into ' + outputPath + ' (' + mergedPdf.length + ' bytes)');
      } catch (err: any) {
        return errorResult('PDF merge failed: ' + (err.message || String(err)));
      }
    },
  };

  var entDocFillForm: AnyAgentTool = {
    name: 'ent_doc_fill_form',
    label: 'Fill Document Template',
    description: 'Replace {{placeholder}} patterns in a document template with provided values. Reads a template file, substitutes values, and writes the result.',
    category: 'file',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        template_path: { type: 'string', description: 'Path to the template file with {{placeholder}} patterns.' },
        output_path: { type: 'string', description: 'Path to write the filled document.' },
        values: { type: 'string', description: 'JSON object of placeholder names to values (e.g., {"name": "John", "date": "2024-01-01"}).' },
      },
      required: ['template_path', 'output_path', 'values'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var templatePath = readStringParam(params, 'template_path', { required: true });
      var outputPath = readStringParam(params, 'output_path', { required: true });
      var valuesStr = readStringParam(params, 'values', { required: true });

      if (!path.isAbsolute(templatePath) && options?.workspaceDir) {
        templatePath = path.resolve(options.workspaceDir, templatePath);
      }
      if (!path.isAbsolute(outputPath) && options?.workspaceDir) {
        outputPath = path.resolve(options.workspaceDir, outputPath);
      }

      try {
        var values: Record<string, string>;
        try {
          values = JSON.parse(valuesStr);
        } catch {
          return errorResult('Invalid JSON for values parameter.');
        }

        var template = await fs.readFile(templatePath, 'utf-8');
        var filled = template;
        var replacedCount = 0;
        var missingPlaceholders: string[] = [];

        // Find all placeholders in the template
        var placeholderRegex = /\{\{(\w+)\}\}/g;
        var match: RegExpExecArray | null;
        var foundPlaceholders = new Set<string>();
        while ((match = placeholderRegex.exec(template)) !== null) {
          foundPlaceholders.add(match[1]);
        }

        // Replace each placeholder
        for (var placeholder of foundPlaceholders) {
          if (values[placeholder] !== undefined) {
            var pattern = new RegExp('\\{\\{' + placeholder + '\\}\\}', 'g');
            filled = filled.replace(pattern, values[placeholder]);
            replacedCount++;
          } else {
            missingPlaceholders.push(placeholder);
          }
        }

        var dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(outputPath, filled, 'utf-8');

        var summary = 'Filled ' + replacedCount + ' placeholder(s) in template. Wrote to ' + outputPath;
        if (missingPlaceholders.length > 0) {
          summary += '\nWarning: ' + missingPlaceholders.length + ' unfilled placeholder(s): ' + missingPlaceholders.join(', ');
        }
        return textResult(summary);
      } catch (err: any) {
        return errorResult('Template fill failed: ' + (err.message || String(err)));
      }
    },
  };

  return [entDocGeneratePdf, entDocGenerateDocx, entDocOcr, entDocParseInvoice, entDocConvert, entDocExtractTables, entDocMergePdfs, entDocFillForm];
}
