/**
 * MCP Skill Adapter — AWS Services
 *
 * Maps AWS REST API endpoints to MCP tool handlers.
 * Covers S3 bucket listing, Lambda function listing, and Lambda invocation.
 *
 * All requests are signed with AWS Signature V4 using the lightweight
 * signer in `../framework/aws-sigv4.js` — no AWS SDK dependency.
 *
 * AWS API docs:
 *   - S3: https://docs.aws.amazon.com/AmazonS3/latest/API/
 *   - Lambda: https://docs.aws.amazon.com/lambda/latest/dg/API_Reference.html
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';
import { signAwsRequest } from '../framework/aws-sigv4.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the AWS region from skill config or credentials */
function awsRegion(ctx: ToolExecutionContext): string {
  return (
    ctx.skillConfig.region ||
    ctx.credentials.fields?.region ||
    'us-east-1'
  );
}

/**
 * Sign an AWS request and execute it through the framework's apiExecutor.
 * Uses `rawBody` to bypass the executor's default JSON serialization so the
 * body is sent exactly as signed.
 */
async function signedAwsRequest(
  ctx: ToolExecutionContext,
  service: string,
  method: string,
  url: string,
  body?: string,
): Promise<any> {
  const accessKeyId = ctx.credentials.fields?.accessKeyId ?? '';
  const secretAccessKey = ctx.credentials.fields?.secretAccessKey ?? '';
  const region = awsRegion(ctx);

  const signed = signAwsRequest({
    method,
    url,
    headers: {},
    body,
    accessKeyId,
    secretAccessKey,
    region,
    service,
  });

  return ctx.apiExecutor.request({
    method,
    url: signed.url,
    headers: signed.headers,
    ...(body !== undefined
      ? {
          rawBody: Buffer.from(body, 'utf8'),
          rawContentType: service === 's3' ? 'application/xml' : 'application/json',
        }
      : {}),
  });
}

/** Format an AWS API error into a consistent ToolResult */
function awsError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.Code || data.__type || '';
      const message = data.Message || data.message || '';
      if (code || message) {
        return { content: `AWS API error: ${code} — ${message}`, isError: true };
      }
    }
    // S3 returns XML error bodies — try to pull Code/Message from string
    if (data && typeof data === 'string') {
      const code = xmlText(data, 'Code');
      const message = xmlText(data, 'Message');
      if (code || message) {
        return { content: `AWS API error: ${code} — ${message}`, isError: true };
      }
    }
    return { content: err.message, isError: true };
  }
  return { content: String(err), isError: true };
}

// ─── XML Parsing Helpers (S3 returns XML, not JSON) ─────

/** Extract the text content of a single XML element by tag name */
function xmlText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const m = re.exec(xml);
  return m ? m[1] : '';
}

/** Extract all occurrences of an element and return their inner XML */
function xmlElements(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g');
  const matches = xml.match(re);
  return matches ?? [];
}

// ─── Tool: aws_list_s3_buckets ──────────────────────────

const listS3Buckets: ToolHandler = {
  description:
    'List all S3 buckets in the AWS account. Returns bucket names and creation dates.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const url = 'https://s3.amazonaws.com/';
      const result = await signedAwsRequest(ctx, 's3', 'GET', url);

      // S3 ListAllMyBuckets returns XML — parse with regex
      const xml = typeof result === 'string' ? result : String(result);
      const bucketElements = xmlElements(xml, 'Bucket');

      if (bucketElements.length === 0) {
        return { content: 'No S3 buckets found in this account.' };
      }

      const lines = bucketElements.map((el) => {
        const name = xmlText(el, 'Name') || 'unknown';
        const created = xmlText(el, 'CreationDate') || 'unknown';
        return `• ${name} (created: ${created})`;
      });

      return {
        content: `${bucketElements.length} S3 bucket(s):\n\n${lines.join('\n')}`,
        metadata: { bucketCount: bucketElements.length },
      };
    } catch (err) {
      return awsError(err);
    }
  },
};

// ─── Tool: aws_list_lambda_functions ────────────────────

const listLambdaFunctions: ToolHandler = {
  description:
    'List Lambda functions in the configured AWS region. Returns function names, runtimes, and memory settings.',
  inputSchema: {
    type: 'object',
    properties: {
      max_items: {
        type: 'number',
        description: 'Maximum number of functions to return (default 50)',
      },
      marker: {
        type: 'string',
        description: 'Pagination marker from a previous response',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const region = awsRegion(ctx);
      const baseUrl = `https://lambda.${region}.amazonaws.com`;
      let url = `${baseUrl}/2015-03-31/functions`;

      // Build query string
      const qsParts: string[] = [];
      if (params.max_items) qsParts.push(`MaxItems=${encodeURIComponent(String(params.max_items))}`);
      if (params.marker) qsParts.push(`Marker=${encodeURIComponent(params.marker)}`);
      if (qsParts.length > 0) url += `?${qsParts.join('&')}`;

      const result = await signedAwsRequest(ctx, 'lambda', 'GET', url);

      // Lambda returns JSON
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      const functions: any[] = data.Functions || [];

      if (functions.length === 0) {
        return {
          content: `No Lambda functions found in region ${region}.`,
          metadata: { functionCount: 0, region },
        };
      }

      const lines = functions.map((fn: any) => {
        const name = fn.FunctionName || 'unknown';
        const runtime = fn.Runtime || 'unknown';
        const memory = fn.MemorySize ? `${fn.MemorySize}MB` : 'N/A';
        const lastModified = fn.LastModified || 'unknown';
        return `• ${name} — runtime: ${runtime}, memory: ${memory}, modified: ${lastModified}`;
      });

      return {
        content: `${functions.length} Lambda function(s) in ${region}:\n\n${lines.join('\n')}`,
        metadata: {
          functionCount: functions.length,
          region,
          nextMarker: data.NextMarker || null,
        },
      };
    } catch (err) {
      return awsError(err);
    }
  },
};

// ─── Tool: aws_invoke_lambda ────────────────────────────

const invokeLambda: ToolHandler = {
  description:
    'Invoke an AWS Lambda function by name. Optionally pass a JSON payload. Returns the function response.',
  inputSchema: {
    type: 'object',
    properties: {
      function_name: {
        type: 'string',
        description: 'Name or ARN of the Lambda function to invoke',
      },
      payload: {
        type: 'object',
        description: 'JSON payload to send to the function (optional)',
      },
      invocation_type: {
        type: 'string',
        enum: ['RequestResponse', 'Event', 'DryRun'],
        description: 'Invocation type (default: RequestResponse for synchronous)',
      },
    },
    required: ['function_name'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const region = awsRegion(ctx);
      const baseUrl = `https://lambda.${region}.amazonaws.com`;
      const fnName = encodeURIComponent(params.function_name);
      const invocationType = params.invocation_type || 'RequestResponse';

      const body = params.payload ? JSON.stringify(params.payload) : undefined;

      // For invocation type, Lambda expects the header on the HTTP request
      // We pass it through signedAwsRequest by pre-building the full URL
      const url = `${baseUrl}/2015-03-31/functions/${fnName}/invocations`;

      // Sign and send — we need custom headers for invocation type
      const accessKeyId = ctx.credentials.fields?.accessKeyId ?? '';
      const secretAccessKey = ctx.credentials.fields?.secretAccessKey ?? '';

      const signed = signAwsRequest({
        method: 'POST',
        url,
        headers: { 'X-Amz-Invocation-Type': invocationType },
        body,
        accessKeyId,
        secretAccessKey,
        region,
        service: 'lambda',
      });

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: signed.url,
        headers: signed.headers,
        ...(body !== undefined
          ? { rawBody: Buffer.from(body, 'utf8'), rawContentType: 'application/json' }
          : {}),
      });

      const data = typeof result === 'string' ? JSON.parse(result) : result;
      const statusCode = data.StatusCode || data.statusCode || 200;
      const functionError = data.FunctionError || null;

      if (functionError) {
        const errorPayload = typeof data.Payload === 'string'
          ? data.Payload
          : JSON.stringify(data.Payload || data);
        return {
          content: `Lambda function "${params.function_name}" returned an error (${functionError}):\n${errorPayload}`,
          isError: true,
          metadata: { functionName: params.function_name, statusCode, functionError },
        };
      }

      const payload = typeof data.Payload === 'string'
        ? data.Payload
        : JSON.stringify(data.Payload || data, null, 2);

      return {
        content: `Lambda "${params.function_name}" invoked successfully (status ${statusCode}):\n${payload}`,
        metadata: {
          functionName: params.function_name,
          statusCode,
          invocationType,
          region,
        },
      };
    } catch (err) {
      return awsError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const awsAdapter: SkillAdapter = {
  skillId: 'aws-services',
  name: 'AWS Services',
  // Base URL is dynamic per region; individual tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://lambda.us-east-1.amazonaws.com',
  auth: {
    type: 'credentials',
    fields: ['accessKeyId', 'secretAccessKey', 'region'],
  },
  tools: {
    aws_list_s3_buckets: listS3Buckets,
    aws_list_lambda_functions: listLambdaFunctions,
    aws_invoke_lambda: invokeLambda,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 30 },
  configSchema: {
    region: {
      type: 'string' as const,
      label: 'AWS Region',
      description: 'Default AWS region for API calls',
      required: true,
      default: 'us-east-1',
      placeholder: 'us-east-1',
    },
  },
};
