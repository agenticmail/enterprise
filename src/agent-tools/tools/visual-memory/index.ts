/**
 * Visual Memory Agent Tools
 * 
 * Provides AI agents with persistent visual memory capabilities.
 * Inspired by agentic-vision but implemented in TypeScript with no ONNX dependencies.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult, textResult } from '../../common.js';
import * as capture from './capture.js';
import * as storage from './storage.js';
import * as similarity from './similarity.js';
import * as diff from './diff.js';

// Session management
let currentSessionId: number = 0;
const activeSessions = new Map<string, number>();

/**
 * Create visual memory tools for an agent.
 */
export function createVisualMemoryTools(options: ToolCreationOptions): AnyAgentTool[] {
  const agentId = options.agentId || 'default';

  return [
    // ─── Vision Capture ──────────────────────────────
    {
      name: 'vision_capture',
      description: 'Capture current browser screenshot or provided image into visual memory. Returns observation ID for future reference.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          source: {
            type: 'string',
            description: 'Source type: "screenshot" (current browser), "file" (file path), or "base64" (base64 data)',
            enum: ['screenshot', 'file', 'base64'],
          },
          data: {
            type: 'string',
            description: 'File path (for file source) or base64 data (for base64 source)',
          },
          description: {
            type: 'string',
            description: 'Optional description/label for this capture',
          },
          labels: {
            type: 'array',
            description: 'Optional tags/labels for categorization',
            items: { type: 'string' },
          },
        },
        required: ['source'],
      },
      async execute(toolCallId: string, params: any) {
        try {
          let result: Awaited<ReturnType<typeof capture.captureFromScreenshot>>;

          if (params.source === 'screenshot') {
            // Take browser screenshot
            const browser = (globalThis as any).browser;
            if (!browser) {
              return errorResult('Browser not available for screenshot');
            }
            
            const screenshot = await browser.screenshot({ fullPage: false });
            result = await capture.captureFromScreenshot(screenshot);
          } else if (params.source === 'file') {
            if (!params.data) {
              return errorResult('File path required for file source');
            }
            result = await capture.captureFromFile(params.data);
          } else if (params.source === 'base64') {
            if (!params.data) {
              return errorResult('Base64 data required for base64 source');
            }
            result = await capture.captureFromBase64(params.data);
          } else {
            return errorResult('Invalid source type. Use "screenshot", "file", or "base64"');
          }

          // Get current session ID
          const sessionKey = `${agentId}-session`;
          const sessionId = activeSessions.get(sessionKey) || 0;

          // Add description and labels if provided
          if (params.description) {
            result.metadata.description = params.description;
          }
          if (params.labels && Array.isArray(params.labels)) {
            result.metadata.labels = [...result.metadata.labels, ...params.labels];
          }

          // Store observation
          const observationId = await storage.addObservation(agentId, {
            timestamp: Date.now(),
            sessionId,
            source: result.source,
            phash: result.phash,
            thumbnail: result.thumbnail,
            metadata: result.metadata,
          });

          return jsonResult({
            id: observationId,
            sessionId,
            dimensions: { 
              width: result.metadata.width, 
              height: result.metadata.height 
            },
            qualityScore: result.metadata.qualityScore,
            message: 'Visual observation captured successfully',
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },

    // ─── Vision Query ────────────────────────────────
    {
      name: 'vision_query',
      description: 'Query visual memory by time, session, or description. Returns matching observations.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          sessionId: {
            type: 'number',
            description: 'Filter by specific session ID',
          },
          timeRange: {
            type: 'object',
            description: 'Time range filter',
            properties: {
              start: { type: 'number', description: 'Start timestamp (Unix ms)' },
              end: { type: 'number', description: 'End timestamp (Unix ms)' },
            },
          },
          description: {
            type: 'string',
            description: 'Search in descriptions and labels',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default 20)',
            maximum: 100,
          },
        },
        required: [],
      },
      async execute(toolCallId: string, params: any) {
        try {
          const observations = await storage.queryObservations(agentId, {
            sessionId: params.sessionId,
            timeRange: params.timeRange,
            description: params.description,
            limit: params.limit || 20,
          });

          const results = observations.map(obs => ({
            id: obs.id,
            timestamp: obs.timestamp,
            sessionId: obs.sessionId,
            source: obs.source,
            dimensions: {
              width: obs.metadata.width,
              height: obs.metadata.height,
            },
            description: obs.metadata.description,
            labels: obs.metadata.labels,
            qualityScore: obs.metadata.qualityScore,
          }));

          return jsonResult({
            observations: results,
            count: results.length,
            query: params,
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },

    // ─── Vision Compare ──────────────────────────────
    {
      name: 'vision_compare',
      description: 'Side-by-side comparison of two visual observations. Shows similarity metrics.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          id1: { type: 'number', description: 'First observation ID' },
          id2: { type: 'number', description: 'Second observation ID' },
        },
        required: ['id1', 'id2'],
      },
      async execute(toolCallId: string, params: any) {
        try {
          const obs1 = await storage.getObservation(agentId, params.id1);
          const obs2 = await storage.getObservation(agentId, params.id2);

          if (!obs1) return errorResult(`Observation ${params.id1} not found`);
          if (!obs2) return errorResult(`Observation ${params.id2} not found`);

          // Calculate perceptual hash similarity
          const hashSimilarity = similarity.calculateSimilarity(obs1.phash, obs2.phash);

          // Calculate visual diff
          const visualDiff = await diff.computeVisualDiff(
            obs1.id,
            obs2.id,
            obs1.thumbnail,
            obs2.thumbnail
          );

          return jsonResult({
            observation1: {
              id: obs1.id,
              timestamp: obs1.timestamp,
              description: obs1.metadata.description,
              dimensions: { width: obs1.metadata.width, height: obs1.metadata.height },
            },
            observation2: {
              id: obs2.id,
              timestamp: obs2.timestamp,
              description: obs2.metadata.description,
              dimensions: { width: obs2.metadata.width, height: obs2.metadata.height },
            },
            comparison: {
              hashSimilarity,
              visualSimilarity: visualDiff.similarity,
              pixelDiffRatio: visualDiff.pixelDiffRatio,
              changedRegions: visualDiff.changedRegions,
              timeDelta: Math.abs(obs2.timestamp - obs1.timestamp),
            },
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },

    // ─── Vision Diff ─────────────────────────────────
    {
      name: 'vision_diff',
      description: 'Pixel-level diff between two visual observations. Shows changed regions.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          beforeId: { type: 'number', description: 'Before observation ID' },
          afterId: { type: 'number', description: 'After observation ID' },
        },
        required: ['beforeId', 'afterId'],
      },
      async execute(toolCallId: string, params: any) {
        try {
          const beforeObs = await storage.getObservation(agentId, params.beforeId);
          const afterObs = await storage.getObservation(agentId, params.afterId);

          if (!beforeObs) return errorResult(`Before observation ${params.beforeId} not found`);
          if (!afterObs) return errorResult(`After observation ${params.afterId} not found`);

          const visualDiff = await diff.computeVisualDiff(
            beforeObs.id,
            afterObs.id,
            beforeObs.thumbnail,
            afterObs.thumbnail
          );

          const totalChangedArea = diff.calculateTotalChangedArea(visualDiff.changedRegions);

          return jsonResult({
            beforeId: beforeObs.id,
            afterId: afterObs.id,
            similarity: visualDiff.similarity,
            pixelDiffRatio: visualDiff.pixelDiffRatio,
            changedRegions: visualDiff.changedRegions,
            totalChangedArea,
            summary: totalChangedArea > 0 
              ? `${visualDiff.changedRegions.length} regions changed, covering ${totalChangedArea} pixels`
              : 'No significant changes detected',
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },

    // ─── Vision Similar ──────────────────────────────
    {
      name: 'vision_similar',
      description: 'Find visually similar observations using perceptual hashing.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          targetId: {
            type: 'number',
            description: 'Reference observation ID to find similar images for',
          },
          minSimilarity: {
            type: 'number',
            description: 'Minimum similarity threshold (0.0-1.0, default 0.7)',
            minimum: 0.0,
            maximum: 1.0,
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results (default 10)',
            maximum: 50,
          },
          sessionId: {
            type: 'number',
            description: 'Limit search to specific session',
          },
        },
        required: ['targetId'],
      },
      async execute(toolCallId: string, params: any) {
        try {
          const targetObs = await storage.getObservation(agentId, params.targetId);
          if (!targetObs) {
            return errorResult(`Target observation ${params.targetId} not found`);
          }

          const matches = await similarity.findSimilarObservations(agentId, targetObs.phash, {
            minSimilarity: params.minSimilarity || 0.7,
            maxResults: params.maxResults || 10,
            excludeIds: [params.targetId],
            sessionId: params.sessionId,
          });

          // Enrich matches with observation details
          const enrichedMatches = [];
          for (const match of matches) {
            const obs = await storage.getObservation(agentId, match.id);
            if (obs) {
              enrichedMatches.push({
                id: match.id,
                similarity: match.similarity,
                timestamp: obs.timestamp,
                description: obs.metadata.description,
                sessionId: obs.sessionId,
                source: obs.source,
              });
            }
          }

          return jsonResult({
            targetId: params.targetId,
            matches: enrichedMatches,
            count: enrichedMatches.length,
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },

    // ─── Vision Track ────────────────────────────────
    {
      name: 'vision_track',
      description: 'Track changes to a specific page over time by comparing with previous captures.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          baselineId: {
            type: 'number',
            description: 'Baseline observation ID to compare against',
          },
          captureNew: {
            type: 'boolean',
            description: 'Whether to capture a new screenshot for comparison (default true)',
          },
          description: {
            type: 'string',
            description: 'Description for the new capture (if capturing)',
          },
        },
        required: ['baselineId'],
      },
      async execute(toolCallId: string, params: any) {
        try {
          const baseline = await storage.getObservation(agentId, params.baselineId);
          if (!baseline) {
            return errorResult(`Baseline observation ${params.baselineId} not found`);
          }

          let currentObsId: number;

          if (params.captureNew !== false) {
            // Capture new screenshot
            const browser = (globalThis as any).browser;
            if (!browser) {
              return errorResult('Browser not available for screenshot');
            }

            const screenshot = await browser.screenshot({ fullPage: false });
            const result = await capture.captureFromScreenshot(screenshot);

            if (params.description) {
              result.metadata.description = params.description;
            }

            const sessionKey = `${agentId}-session`;
            const sessionId = activeSessions.get(sessionKey) || 0;

            currentObsId = await storage.addObservation(agentId, {
              timestamp: Date.now(),
              sessionId,
              source: result.source,
              phash: result.phash,
              thumbnail: result.thumbnail,
              metadata: result.metadata,
              memoryLink: baseline.id, // Link to baseline
            });
          } else {
            // Use most recent observation
            const recent = await storage.getRecentObservations(agentId, 1);
            if (recent.length === 0) {
              return errorResult('No recent observations found for comparison');
            }
            currentObsId = recent[0].id;
          }

          const currentObs = await storage.getObservation(agentId, currentObsId);
          if (!currentObs) {
            return errorResult('Failed to get current observation');
          }

          // Compute diff
          const visualDiff = await diff.computeVisualDiff(
            baseline.id,
            currentObs.id,
            baseline.thumbnail,
            currentObs.thumbnail
          );

          // Analyze change pattern
          const timeDelta = currentObs.timestamp - baseline.timestamp;
          const changeScore = 1 - visualDiff.similarity;

          return jsonResult({
            baseline: {
              id: baseline.id,
              timestamp: baseline.timestamp,
              description: baseline.metadata.description,
            },
            current: {
              id: currentObs.id,
              timestamp: currentObs.timestamp,
              description: currentObs.metadata.description,
            },
            tracking: {
              timeDelta,
              similarity: visualDiff.similarity,
              changeScore,
              changedRegions: visualDiff.changedRegions,
              analysis: changeScore < 0.05 
                ? 'No significant changes'
                : changeScore < 0.2 
                ? 'Minor changes detected'
                : changeScore < 0.5
                ? 'Moderate changes detected'
                : 'Major changes detected',
            },
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },

    // ─── Vision OCR ──────────────────────────────────
    {
      name: 'vision_ocr',
      description: 'Extract text from a visual observation using browser accessibility tree as proxy.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          observationId: {
            type: 'number',
            description: 'Observation ID to extract text from',
          },
          useAccessibilityTree: {
            type: 'boolean',
            description: 'Use browser accessibility tree for text extraction (default true)',
          },
        },
        required: ['observationId'],
      },
      async execute(toolCallId: string, params: any) {
        try {
          const observation = await storage.getObservation(agentId, params.observationId);
          if (!observation) {
            return errorResult(`Observation ${params.observationId} not found`);
          }

          let extractedText = '';

          if (params.useAccessibilityTree !== false) {
            // Use browser accessibility tree for text extraction
            const browser = (globalThis as any).browser;
            if (browser) {
              try {
                const snapshot = await browser.snapshot();
                if (snapshot && snapshot.content) {
                  extractedText = snapshot.content;
                }
              } catch (error) {
                console.warn('Failed to get accessibility tree:', error);
              }
            }
          }

          // Fallback: Extract any text from observation metadata
          if (!extractedText) {
            extractedText = [
              observation.metadata.description || '',
              ...observation.metadata.labels,
            ].filter(Boolean).join(' ');
          }

          return jsonResult({
            observationId: params.observationId,
            extractedText,
            source: params.useAccessibilityTree !== false ? 'accessibility_tree' : 'metadata',
            timestamp: observation.timestamp,
            textLength: extractedText.length,
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },

    // ─── Vision Health ───────────────────────────────
    {
      name: 'vision_health',
      description: 'Get statistics and health metrics about visual memory system.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async execute(toolCallId: string, params: any) {
        try {
          const stats = await storage.getStoreStats(agentId);
          
          // Calculate additional metrics
          const recent = await storage.getRecentObservations(agentId, 10);
          const recentActivity = recent.length > 0 
            ? Date.now() - recent[0].timestamp
            : null;

          // Find duplicates
          const duplicates = await similarity.findDuplicates(agentId, 0.95);
          const duplicateCount = duplicates.reduce((sum, group) => sum + group.duplicates.length, 0);

          return jsonResult({
            statistics: {
              totalObservations: stats.totalObservations,
              totalSessions: stats.totalSessions,
              averageQualityScore: Math.round(stats.avgQualityScore * 100) / 100,
              oldestCapture: stats.oldestTimestamp,
              newestCapture: stats.newestTimestamp,
              totalStorageSize: stats.totalSize,
            },
            health: {
              lastActivityMs: recentActivity,
              duplicateObservations: duplicateCount,
              storageEfficiency: stats.totalObservations > 0 
                ? Math.round((stats.totalObservations - duplicateCount) / stats.totalObservations * 100)
                : 100,
              status: stats.totalObservations > 0 ? 'active' : 'empty',
            },
            recommendations: [
              duplicateCount > 0 ? `Consider removing ${duplicateCount} duplicate observations` : null,
              stats.avgQualityScore < 0.6 ? 'Quality scores are low, consider capturing higher resolution images' : null,
              stats.totalObservations > 1000 ? 'Large number of observations, consider archiving old data' : null,
            ].filter(Boolean),
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },

    // ─── Vision Session Start ───────────────────────
    {
      name: 'vision_session_start',
      description: 'Begin a named observation session for grouping related captures.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Name/description for this observation session',
          },
        },
        required: [],
      },
      async execute(toolCallId: string, params: any) {
        try {
          const store = await storage.loadStore(agentId);
          const sessionId = ++store.sessionCount;
          
          // Save updated session count
          await storage.saveStore(agentId, store);

          // Track active session
          const sessionKey = `${agentId}-session`;
          activeSessions.set(sessionKey, sessionId);

          return jsonResult({
            sessionId,
            name: params.name || `Session ${sessionId}`,
            startTime: Date.now(),
            message: 'Visual observation session started',
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },

    // ─── Vision Session End ──────────────────────────
    {
      name: 'vision_session_end',
      description: 'End current observation session with summary.',
      category: 'memory' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          sessionId: {
            type: 'number',
            description: 'Session ID to end (uses current session if not specified)',
          },
        },
        required: [],
      },
      async execute(toolCallId: string, params: any) {
        try {
          const sessionKey = `${agentId}-session`;
          const sessionId = params.sessionId || activeSessions.get(sessionKey) || 0;

          if (sessionId === 0) {
            return errorResult('No active session found');
          }

          // Get session observations
          const sessionObservations = await storage.getSessionObservations(agentId, sessionId);
          
          if (sessionObservations.length === 0) {
            return textResult(`Session ${sessionId} ended with no observations.`);
          }

          // Generate session summary
          const startTime = Math.min(...sessionObservations.map(obs => obs.timestamp));
          const endTime = Math.max(...sessionObservations.map(obs => obs.timestamp));
          const duration = endTime - startTime;

          const avgQuality = sessionObservations.reduce((sum, obs) => 
            sum + obs.metadata.qualityScore, 0) / sessionObservations.length;

          const sources = new Set(sessionObservations.map(obs => obs.source.type));

          // Clear active session
          activeSessions.delete(sessionKey);

          return jsonResult({
            sessionId,
            summary: {
              totalObservations: sessionObservations.length,
              duration,
              startTime,
              endTime,
              averageQuality: Math.round(avgQuality * 100) / 100,
              sources: Array.from(sources),
              observationIds: sessionObservations.map(obs => obs.id),
            },
            message: `Session ${sessionId} completed with ${sessionObservations.length} observations`,
          });
        } catch (error: any) {
          return errorResult(error.message);
        }
      },
    },
  ];
}