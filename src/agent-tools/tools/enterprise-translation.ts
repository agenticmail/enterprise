/**
 * AgenticMail Agent Tools — Enterprise Translation
 *
 * Translation, language detection, batch translation, and localization.
 * Uses DeepL or Google Translate API when configured, with built-in
 * language detection via Unicode range analysis and common word heuristics.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, readStringArrayParam, jsonResult, textResult, errorResult } from '../common.js';

var DEEPL_API_ENDPOINT = 'https://api-free.deepl.com/v2/translate';
var DEEPL_PRO_ENDPOINT = 'https://api.deepl.com/v2/translate';

// --- Language detection heuristics ---

var UNICODE_RANGES: Array<{ name: string; lang: string; test: (c: number) => boolean }> = [
  { name: 'CJK Unified', lang: 'zh', test: function(c) { return c >= 0x4E00 && c <= 0x9FFF; } },
  { name: 'Hiragana', lang: 'ja', test: function(c) { return c >= 0x3040 && c <= 0x309F; } },
  { name: 'Katakana', lang: 'ja', test: function(c) { return c >= 0x30A0 && c <= 0x30FF; } },
  { name: 'Hangul', lang: 'ko', test: function(c) { return c >= 0xAC00 && c <= 0xD7AF; } },
  { name: 'Arabic', lang: 'ar', test: function(c) { return c >= 0x0600 && c <= 0x06FF; } },
  { name: 'Cyrillic', lang: 'ru', test: function(c) { return c >= 0x0400 && c <= 0x04FF; } },
  { name: 'Devanagari', lang: 'hi', test: function(c) { return c >= 0x0900 && c <= 0x097F; } },
];

var COMMON_WORDS: Record<string, string[]> = {
  en: ['the', 'is', 'and', 'to', 'of', 'in', 'that', 'it', 'for', 'was', 'with', 'are', 'this', 'have', 'from'],
  es: ['el', 'de', 'en', 'que', 'los', 'del', 'las', 'por', 'con', 'una', 'para', 'como', 'pero', 'sus', 'sobre'],
  fr: ['le', 'de', 'et', 'les', 'des', 'en', 'est', 'que', 'une', 'dans', 'qui', 'pas', 'pour', 'sur', 'avec'],
  de: ['der', 'die', 'und', 'den', 'von', 'ist', 'das', 'ein', 'mit', 'dem', 'des', 'auf', 'sich', 'nicht', 'als'],
  it: ['di', 'che', 'il', 'per', 'una', 'con', 'del', 'della', 'sono', 'gli', 'questo', 'nel', 'alla', 'come', 'anche'],
  pt: ['de', 'que', 'os', 'em', 'um', 'para', 'com', 'uma', 'por', 'como', 'mas', 'dos', 'das', 'pelo', 'sua'],
};

function detectLanguage(text: string): { language: string; confidence: number; method: string } {
  // Step 1: Unicode range analysis
  var charCounts: Record<string, number> = {};
  var totalChars = 0;

  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code <= 0x7F) continue; // Skip ASCII
    totalChars++;
    for (var range of UNICODE_RANGES) {
      if (range.test(code)) {
        charCounts[range.lang] = (charCounts[range.lang] || 0) + 1;
        break;
      }
    }
  }

  // If significant non-ASCII characters detected, use that
  if (totalChars > text.length * 0.1) {
    var bestLang = '';
    var bestCount = 0;
    for (var lang of Object.keys(charCounts)) {
      if (charCounts[lang] > bestCount) {
        bestCount = charCounts[lang];
        bestLang = lang;
      }
    }
    if (bestLang) {
      var confidence = Math.min(0.95, bestCount / totalChars);
      return { language: bestLang, confidence: confidence, method: 'unicode_range' };
    }
  }

  // Step 2: Common word frequency for Latin-script languages
  var words = text.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 1; });
  if (words.length === 0) return { language: 'unknown', confidence: 0, method: 'none' };

  var langScores: Record<string, number> = {};
  for (var lang of Object.keys(COMMON_WORDS)) {
    var wordSet = new Set(COMMON_WORDS[lang]);
    var hits = 0;
    for (var word of words) {
      if (wordSet.has(word)) hits++;
    }
    langScores[lang] = hits / words.length;
  }

  var bestLang = 'unknown';
  var bestScore = 0;
  for (var lang of Object.keys(langScores)) {
    if (langScores[lang] > bestScore) {
      bestScore = langScores[lang];
      bestLang = lang;
    }
  }

  if (bestScore < 0.02) {
    return { language: 'unknown', confidence: 0, method: 'word_frequency' };
  }

  return { language: bestLang, confidence: Math.min(0.9, bestScore * 5), method: 'word_frequency' };
}

// --- Translation API calls ---

async function translateWithDeepL(apiKey: string, texts: string[], targetLang: string, sourceLang?: string): Promise<{ translations: string[]; detectedLang?: string }> {
  var isPro = !apiKey.endsWith(':fx');
  var endpoint = isPro ? DEEPL_PRO_ENDPOINT : DEEPL_API_ENDPOINT;

  var bodyParams = new URLSearchParams();
  for (var text of texts) {
    bodyParams.append('text', text);
  }
  bodyParams.set('target_lang', targetLang.toUpperCase());
  if (sourceLang) bodyParams.set('source_lang', sourceLang.toUpperCase());

  var res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': 'DeepL-Auth-Key ' + apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    var errText = await res.text().catch(function() { return res.statusText; });
    throw new Error('DeepL API error (' + res.status + '): ' + errText);
  }

  var data = await res.json() as { translations: Array<{ text: string; detected_source_language?: string }> };
  var translations = data.translations.map(function(t) { return t.text; });
  var detectedLang = data.translations[0]?.detected_source_language?.toLowerCase();

  return { translations: translations, detectedLang: detectedLang };
}

async function translateWithGoogle(apiKey: string, texts: string[], targetLang: string, sourceLang?: string): Promise<{ translations: string[]; detectedLang?: string }> {
  var url = 'https://translation.googleapis.com/language/translate/v2?key=' + apiKey;

  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: texts,
      target: targetLang,
      source: sourceLang || undefined,
      format: 'text',
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    var errText = await res.text().catch(function() { return res.statusText; });
    throw new Error('Google Translate API error (' + res.status + '): ' + errText);
  }

  var data = await res.json() as { data: { translations: Array<{ translatedText: string; detectedSourceLanguage?: string }> } };
  var translations = data.data.translations.map(function(t) { return t.translatedText; });
  var detectedLang = data.data.translations[0]?.detectedSourceLanguage?.toLowerCase();

  return { translations: translations, detectedLang: detectedLang };
}

function getTranslationProvider(): { provider: string; apiKey: string } | null {
  var deeplKey = (process.env.DEEPL_API_KEY || '').trim();
  if (deeplKey) return { provider: 'deepl', apiKey: deeplKey };

  var googleKey = (process.env.GOOGLE_TRANSLATE_API_KEY || '').trim();
  if (googleKey) return { provider: 'google', apiKey: googleKey };

  return null;
}

async function translateTexts(texts: string[], targetLang: string, sourceLang?: string): Promise<{ translations: string[]; provider: string; detectedLang?: string }> {
  var providerInfo = getTranslationProvider();
  if (!providerInfo) {
    throw new Error(
      'No translation API configured. Set one of:\n' +
      '  DEEPL_API_KEY — for DeepL translation (recommended)\n' +
      '  GOOGLE_TRANSLATE_API_KEY — for Google Cloud Translation'
    );
  }

  if (providerInfo.provider === 'deepl') {
    var result = await translateWithDeepL(providerInfo.apiKey, texts, targetLang, sourceLang);
    return { translations: result.translations, provider: 'deepl', detectedLang: result.detectedLang };
  } else {
    var result = await translateWithGoogle(providerInfo.apiKey, texts, targetLang, sourceLang);
    return { translations: result.translations, provider: 'google', detectedLang: result.detectedLang };
  }
}

// --- String extraction from JSON ---

function extractStrings(obj: unknown, prefix: string): Array<{ path: string; value: string }> {
  var results: Array<{ path: string; value: string }> = [];

  if (typeof obj === 'string') {
    results.push({ path: prefix, value: obj });
  } else if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      results = results.concat(extractStrings(obj[i], prefix + '[' + i + ']'));
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (var key of Object.keys(obj as Record<string, unknown>)) {
      var child = (obj as Record<string, unknown>)[key];
      var childPath = prefix ? prefix + '.' + key : key;
      results = results.concat(extractStrings(child, childPath));
    }
  }

  return results;
}

function setNestedValue(obj: any, pathStr: string, value: string): void {
  var parts = pathStr.replace(/\[(\d+)\]/g, '.$1').split('.');
  var current = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    var part = parts[i];
    var nextPart = parts[i + 1];
    if (current[part] === undefined) {
      current[part] = /^\d+$/.test(nextPart) ? [] : {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

export function createEnterpriseTranslationTools(options?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'ent_translate_text',
      label: 'Translate Text',
      description: 'Translate text between languages using DeepL or Google Translate API. Auto-detects source language if not specified.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to translate.' },
          source_lang: { type: 'string', description: 'Source language code (e.g. "en", "fr"). Auto-detected if omitted.' },
          target_lang: { type: 'string', description: 'Target language code (e.g. "es", "de"). Required.' },
        },
        required: ['text', 'target_lang'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var text = readStringParam(params, 'text', { required: true, trim: false });
        var sourceLang = readStringParam(params, 'source_lang');
        var targetLang = readStringParam(params, 'target_lang', { required: true });

        try {
          var result = await translateTexts([text], targetLang, sourceLang);
          return jsonResult({
            original: text,
            translated: result.translations[0],
            source_lang: sourceLang || result.detectedLang || 'auto',
            target_lang: targetLang,
            provider: result.provider,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Translation failed');
        }
      },
    },

    {
      name: 'ent_translate_document',
      label: 'Translate Document',
      description: 'Read a file and translate its content, preserving markdown structure (headers, lists, code blocks). Splits into paragraphs and translates each.',
      category: 'utility',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to the document to translate.' },
          target_lang: { type: 'string', description: 'Target language code.' },
          output_path: { type: 'string', description: 'Optional output file path. If omitted, returns translated content.' },
        },
        required: ['file_path', 'target_lang'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var filePath = readStringParam(params, 'file_path', { required: true });
        var targetLang = readStringParam(params, 'target_lang', { required: true });
        var outputPath = readStringParam(params, 'output_path');

        var workDir = options?.workspaceDir || process.cwd();
        if (!path.isAbsolute(filePath)) filePath = path.resolve(workDir, filePath);
        if (outputPath && !path.isAbsolute(outputPath)) outputPath = path.resolve(workDir, outputPath);

        try {
          var content = await fs.readFile(filePath, 'utf-8');
        } catch {
          return errorResult('File not found: ' + filePath);
        }

        // Split into paragraphs, preserving structure
        var paragraphs = content.split(/\n\n+/);
        var translatableChunks: string[] = [];
        var chunkMap: Array<{ index: number; type: 'translate' | 'preserve' }> = [];

        for (var i = 0; i < paragraphs.length; i++) {
          var para = paragraphs[i];
          // Preserve code blocks and empty lines
          if (para.trim().startsWith('```') || para.trim() === '') {
            chunkMap.push({ index: i, type: 'preserve' });
          } else {
            chunkMap.push({ index: i, type: 'translate' });
            translatableChunks.push(para);
          }
        }

        if (translatableChunks.length === 0) {
          return textResult('No translatable content found in the document.');
        }

        try {
          var result = await translateTexts(translatableChunks, targetLang);
          var translatedIdx = 0;
          var outputParts: string[] = [];

          for (var entry of chunkMap) {
            if (entry.type === 'preserve') {
              outputParts.push(paragraphs[entry.index]);
            } else {
              outputParts.push(result.translations[translatedIdx]);
              translatedIdx++;
            }
          }

          var translated = outputParts.join('\n\n');

          if (outputPath) {
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, translated, 'utf-8');
            return jsonResult({
              source: filePath,
              output: outputPath,
              target_lang: targetLang,
              provider: result.provider,
              paragraphs: translatableChunks.length,
            });
          }

          return jsonResult({
            source: filePath,
            target_lang: targetLang,
            provider: result.provider,
            paragraphs: translatableChunks.length,
            translated: translated,
          });
        } catch (err: any) {
          return errorResult('Document translation failed: ' + (err.message || 'unknown error'));
        }
      },
    },

    {
      name: 'ent_translate_detect',
      label: 'Detect Language',
      description: 'Detect the language of input text using Unicode range analysis and common word frequency heuristics. Supports en, es, fr, de, it, pt, zh, ja, ko, ar, ru, hi.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to detect the language of.' },
        },
        required: ['text'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var text = readStringParam(params, 'text', { required: true, trim: false });

        if (text.length < 3) {
          return errorResult('Text too short for reliable language detection. Provide at least a few words.');
        }

        var result = detectLanguage(text);
        return jsonResult({
          text: text.length > 200 ? text.slice(0, 200) + '...' : text,
          language: result.language,
          confidence: Math.round(result.confidence * 100) / 100,
          method: result.method,
        });
      },
    },

    {
      name: 'ent_translate_batch',
      label: 'Batch Translate',
      description: 'Translate multiple strings at once. More efficient than individual calls for large sets of text.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          texts: { type: 'string', description: 'JSON array of strings to translate.' },
          target_lang: { type: 'string', description: 'Target language code.' },
          source_lang: { type: 'string', description: 'Source language code (optional, auto-detected).' },
        },
        required: ['texts', 'target_lang'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var textsRaw = readStringParam(params, 'texts', { required: true });
        var targetLang = readStringParam(params, 'target_lang', { required: true });
        var sourceLang = readStringParam(params, 'source_lang');

        var texts: string[];
        try {
          var parsed = JSON.parse(textsRaw);
          if (!Array.isArray(parsed)) {
            return errorResult('texts must be a JSON array of strings.');
          }
          texts = parsed.filter(function(t: unknown) { return typeof t === 'string'; });
        } catch {
          return errorResult('Invalid JSON in texts parameter. Provide a JSON array of strings.');
        }

        if (texts.length === 0) {
          return errorResult('No valid strings provided in texts array.');
        }

        if (texts.length > 100) {
          return errorResult('Too many texts. Maximum 100 strings per batch.');
        }

        try {
          var result = await translateTexts(texts, targetLang, sourceLang);
          var pairs = texts.map(function(original, idx) {
            return { original: original, translated: result.translations[idx] };
          });

          return jsonResult({
            count: texts.length,
            target_lang: targetLang,
            source_lang: sourceLang || result.detectedLang || 'auto',
            provider: result.provider,
            translations: pairs,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Batch translation failed');
        }
      },
    },

    {
      name: 'ent_translate_localize',
      label: 'Localize JSON',
      description: 'Translate all string values in a JSON object or i18n file. Useful for localizing configuration or translation files.',
      category: 'utility',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'JSON object as string, or a file path to a JSON file.' },
          target_lang: { type: 'string', description: 'Target language code.' },
          output_path: { type: 'string', description: 'Optional output file path for the localized JSON.' },
        },
        required: ['content', 'target_lang'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var contentRaw = readStringParam(params, 'content', { required: true, trim: false });
        var targetLang = readStringParam(params, 'target_lang', { required: true });
        var outputPath = readStringParam(params, 'output_path');

        var workDir = options?.workspaceDir || process.cwd();
        if (outputPath && !path.isAbsolute(outputPath)) outputPath = path.resolve(workDir, outputPath);

        // Try parsing as JSON first, then as file path
        var jsonObj: unknown;
        try {
          jsonObj = JSON.parse(contentRaw);
        } catch {
          // Treat as file path
          var filePath = path.isAbsolute(contentRaw) ? contentRaw : path.resolve(workDir, contentRaw);
          try {
            var fileContent = await fs.readFile(filePath, 'utf-8');
            jsonObj = JSON.parse(fileContent);
          } catch {
            return errorResult('Could not parse content as JSON or read as a JSON file: ' + contentRaw);
          }
        }

        var strings = extractStrings(jsonObj, '');
        if (strings.length === 0) {
          return textResult('No string values found in the provided JSON.');
        }

        if (strings.length > 500) {
          return errorResult('Too many strings (' + strings.length + '). Maximum 500 strings per localization request.');
        }

        var texts = strings.map(function(s) { return s.value; });

        try {
          var result = await translateTexts(texts, targetLang);

          // Rebuild the object with translated values
          var localized = JSON.parse(JSON.stringify(jsonObj));
          for (var i = 0; i < strings.length; i++) {
            setNestedValue(localized, strings[i].path, result.translations[i]);
          }

          if (outputPath) {
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, JSON.stringify(localized, null, 2), 'utf-8');
            return jsonResult({
              output: outputPath,
              target_lang: targetLang,
              provider: result.provider,
              stringsTranslated: strings.length,
            });
          }

          return jsonResult({
            target_lang: targetLang,
            provider: result.provider,
            stringsTranslated: strings.length,
            localized: localized,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Localization failed');
        }
      },
    },
  ];
}
