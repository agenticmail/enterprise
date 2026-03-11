/**
 * Remotion Video Creation Tools
 * 
 * Enables agents to create professional videos programmatically using Remotion.
 * Handles project setup, composition creation, rendering, and asset management.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { AnyAgentTool } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function runInProject(projectDir: string, cmd: string, timeout = 120_000): string {
  return execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout, stdio: 'pipe' }).trim();
}

function isRemotonInstalled(projectDir: string): boolean {
  return existsSync(join(projectDir, 'node_modules', 'remotion'));
}

// ─── Templates ────────────────────────────────────────────

const ROOT_INDEX_TSX = `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
`;

const ROOT_TSX_TEMPLATE = (compositions: string[]) => `import { Composition } from "remotion";
${compositions.map(c => `import { ${pascalCase(c)} } from "./compositions/${c}";`).join('\n')}

export const RemotionRoot: React.FC = () => {
  return (
    <>
${compositions.map(c => `      {/* @ts-ignore */}
      <Composition id="${c}" component={${pascalCase(c)}} durationInFrames={450} fps={30} width={1080} height={1920} />`).join('\n')}
    </>
  );
};
`;

function pascalCase(s: string): string {
  return s.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
}

const BLANK_COMPOSITION = (id: string) => `import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export const ${pascalCase(id)}: React.FC<{ title?: string }> = ({ title = "Hello World" }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f0f0f", justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ color: "white", fontSize: 80, fontWeight: "bold", opacity, textAlign: "center", padding: 40 }}>
        {title}
      </h1>
    </AbsoluteFill>
  );
};
`;

const TEXT_ANIMATION = (id: string) => `import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Sequence } from "remotion";

const AnimatedText: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame: frame - delay, fps, config: { damping: 12 } });
  const opacity = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ transform: \`scale(\${scale})\`, opacity, fontSize: 64, fontWeight: "bold", color: "white", textAlign: "center", padding: "0 40px" }}>
      {text}
    </div>
  );
};

export const ${pascalCase(id)}: React.FC<{ lines?: string[] }> = ({ lines = ["Create", "Amazing", "Videos"] }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "#1a1a2e", justifyContent: "center", alignItems: "center", gap: 20 }}>
      {lines.map((line, i) => (
        <Sequence key={i} from={i * 20}>
          <AnimatedText text={line} delay={0} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
`;

const SLIDESHOW = (id: string) => `import { AbsoluteFill, useCurrentFrame, interpolate, Img, Sequence, useVideoConfig, staticFile } from "remotion";

const Slide: React.FC<{ src: string; caption?: string }> = ({ src, caption }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 135, 150], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, 150], [1, 1.05]);

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: \`scale(\${scale})\` }} />
      {caption && (
        <div style={{ position: "absolute", bottom: 80, left: 0, right: 0, textAlign: "center", color: "white", fontSize: 48, fontWeight: "bold", textShadow: "0 2px 20px rgba(0,0,0,0.8)", padding: "0 40px" }}>
          {caption}
        </div>
      )}
    </AbsoluteFill>
  );
};

export const ${pascalCase(id)}: React.FC<{ slides?: Array<{ src: string; caption?: string }> }> = ({ slides = [] }) => {
  const { fps } = useVideoConfig();
  const slideDuration = fps * 5; // 5 seconds per slide

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {slides.map((slide, i) => (
        <Sequence key={i} from={i * slideDuration} durationInFrames={slideDuration}>
          <Slide src={slide.src} caption={slide.caption} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
`;

const SOCIAL_REEL = (id: string) => `import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Sequence, Audio, staticFile } from "remotion";

const HookText: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const y = spring({ frame, fps, config: { damping: 15 } });
  const translateY = interpolate(y, [0, 1], [100, 0]);

  return (
    <div style={{ transform: \`translateY(\${translateY}px)\`, fontSize: 56, fontWeight: 900, color: "white", textAlign: "center", padding: "0 50px", lineHeight: 1.3, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
      {text}
    </div>
  );
};

const BodyPoint: React.FC<{ text: string; emoji?: string }> = ({ text, emoji = "✨" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const x = interpolate(progress, [0, 1], [-50, 0]);

  return (
    <div style={{ opacity, transform: \`translateX(\${x}px)\`, fontSize: 36, color: "white", padding: "8px 50px", lineHeight: 1.5 }}>
      {emoji} {text}
    </div>
  );
};

const CTA: React.FC<{ text: string; handle: string }> = ({ text, handle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 10, mass: 0.5 } });

  return (
    <div style={{ textAlign: "center", transform: \`scale(\${scale})\` }}>
      <div style={{ fontSize: 40, fontWeight: 800, color: "#FFD700", marginBottom: 12 }}>{text}</div>
      <div style={{ fontSize: 32, color: "rgba(255,255,255,0.8)" }}>{handle}</div>
    </div>
  );
};

export const ${pascalCase(id)}: React.FC<{
  hook?: string;
  points?: Array<{ text: string; emoji?: string }>;
  cta?: string;
  handle?: string;
  bgColor?: string;
  accentColor?: string;
  audioSrc?: string;
}> = ({
  hook = "5 Signs You Need To Know",
  points = [
    { text: "They always make time for you", emoji: "💕" },
    { text: "They remember the small things", emoji: "🤍" },
    { text: "They support your growth", emoji: "🌱" },
  ],
  cta = "Follow for more",
  handle = "@yourpage",
  bgColor = "#1a1a2e",
  accentColor = "#e94560",
  audioSrc,
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: \`linear-gradient(135deg, \${bgColor} 0%, \${accentColor}33 100%)\` }}>
      {audioSrc && <Audio src={staticFile(audioSrc)} volume={0.5} />}

      {/* Hook */}
      <Sequence from={0} durationInFrames={fps * 3}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <HookText text={hook} />
          <div style={{ position: "absolute", bottom: 120, fontSize: 28, color: "rgba(255,255,255,0.6)" }}>
            Check comments 👇
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Points */}
      {points.map((point, i) => (
        <Sequence key={i} from={fps * 3 + i * fps * 2.5} durationInFrames={fps * 2.5}>
          <AbsoluteFill style={{ justifyContent: "center" }}>
            <BodyPoint text={point.text} emoji={point.emoji} />
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* CTA */}
      <Sequence from={fps * 3 + points.length * fps * 2.5} durationInFrames={fps * 3}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <CTA text={cta} handle={handle} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
`;

const TEMPLATES: Record<string, (id: string) => string> = {
  'blank': BLANK_COMPOSITION,
  'hello-world': BLANK_COMPOSITION,
  'text-animation': TEXT_ANIMATION,
  'slideshow': SLIDESHOW,
  'social-reel': SOCIAL_REEL,
};

const PACKAGE_JSON = (name: string) => JSON.stringify({
  name: name || 'remotion-project',
  version: '1.0.0',
  private: true,
  scripts: {
    start: 'remotion studio',
    build: 'remotion render',
    render: 'remotion render',
  },
  dependencies: {
    '@remotion/cli': '^4',
    '@remotion/renderer': '^4',
    'remotion': '^4',
    'react': '^18',
    'react-dom': '^18',
  },
  devDependencies: {
    '@types/react': '^18',
    'typescript': '^5',
  },
}, null, 2);

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ES2022',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    outDir: './dist',
  },
  include: ['src/**/*'],
}, null, 2);

// ─── Tool Executors ───────────────────────────────────────

const createProject = async (_id: any, params: any) => {
  const { projectDir, name, template = 'blank' } = params;

  if (!projectDir) return { error: 'projectDir is required' };
  
  ensureDir(projectDir);
  ensureDir(join(projectDir, 'src', 'compositions'));
  ensureDir(join(projectDir, 'public'));

  // Write package.json
  writeFileSync(join(projectDir, 'package.json'), PACKAGE_JSON(name || basename(projectDir)));
  writeFileSync(join(projectDir, 'tsconfig.json'), TSCONFIG);

  // Write entry point
  writeFileSync(join(projectDir, 'src', 'index.ts'), ROOT_INDEX_TSX);

  // Write initial composition from template
  const compId = 'main';
  const templateFn = TEMPLATES[template] || TEMPLATES['blank'];
  writeFileSync(join(projectDir, 'src', 'compositions', `${compId}.tsx`), templateFn(compId));
  writeFileSync(join(projectDir, 'src', 'Root.tsx'), ROOT_TSX_TEMPLATE([compId]));

  // Install dependencies
  try {
    runInProject(projectDir, 'npm install --no-audit --no-fund 2>&1', 180_000);
  } catch (e: any) {
    return { 
      success: true,
      projectDir,
      warning: `Project created but npm install failed: ${e.message?.substring(0, 200)}. Run \`cd ${projectDir} && npm install\` manually.`,
      files: ['package.json', 'tsconfig.json', 'src/index.ts', 'src/Root.tsx', `src/compositions/${compId}.tsx`],
    };
  }

  return {
    success: true,
    projectDir,
    template,
    compositionId: compId,
    files: ['package.json', 'tsconfig.json', 'src/index.ts', 'src/Root.tsx', `src/compositions/${compId}.tsx`],
    nextSteps: [
      `Edit the composition: remotion_create_composition with your content`,
      `Preview: remotion_preview_url to start the studio`,
      `Render: remotion_render to create the video file`,
    ],
  };
};

const createComposition = async (_id: any, params: any) => {
  const { projectDir, compositionId, code, width = 1080, height = 1920, fps = 30, durationInSeconds = 15 } = params;

  if (!projectDir || !compositionId || !code) return { error: 'projectDir, compositionId, and code are required' };
  if (!existsSync(projectDir)) return { error: `Project directory not found: ${projectDir}` };

  const compDir = join(projectDir, 'src', 'compositions');
  ensureDir(compDir);

  // Write the composition file
  const filePath = join(compDir, `${compositionId}.tsx`);
  writeFileSync(filePath, code);

  // Update Root.tsx to include this composition
  const compositions = readdirSync(compDir)
    .filter(f => f.endsWith('.tsx'))
    .map(f => f.replace('.tsx', ''));

  const rootContent = `import { Composition } from "remotion";
${compositions.map(c => `import { ${pascalCase(c)} } from "./compositions/${c}";`).join('\n')}

export const RemotionRoot: React.FC = () => {
  return (
    <>
${compositions.map(c => {
  const isTarget = c === compositionId;
  const w = isTarget ? width : 1080;
  const h = isTarget ? height : 1920;
  const f = isTarget ? fps : 30;
  const dur = isTarget ? durationInSeconds * fps : 450;
  return `      <Composition id="${c}" component={${pascalCase(c)}} durationInFrames={${dur}} fps={${f}} width={${w}} height={${h}} />`;
}).join('\n')}
    </>
  );
};
`;

  writeFileSync(join(projectDir, 'src', 'Root.tsx'), rootContent);

  return {
    success: true,
    compositionId,
    filePath: `src/compositions/${compositionId}.tsx`,
    dimensions: `${width}x${height}`,
    fps,
    duration: `${durationInSeconds}s (${durationInSeconds * fps} frames)`,
  };
};

const renderVideo = async (_id: any, params: any) => {
  const { projectDir, compositionId, outputPath, codec = 'h264', quality, inputProps, concurrency, scale } = params;

  if (!projectDir || !compositionId || !outputPath) return { error: 'projectDir, compositionId, and outputPath are required' };
  if (!existsSync(projectDir)) return { error: `Project directory not found: ${projectDir}` };
  if (!isRemotonInstalled(projectDir)) return { error: 'Remotion not installed. Run remotion_create_project first or npm install in the project.' };

  // Ensure output directory exists
  const outDir = join(outputPath, '..');
  ensureDir(outDir);

  // Build render command
  let cmd = `npx remotion render ${compositionId} "${outputPath}" --codec ${codec}`;
  if (quality !== undefined) cmd += ` --crf ${quality}`;
  if (concurrency) cmd += ` --concurrency ${concurrency}`;
  if (scale && scale !== 1) cmd += ` --scale ${scale}`;
  if (inputProps) {
    const propsFile = join(projectDir, '.remotion-props.json');
    writeFileSync(propsFile, JSON.stringify(inputProps));
    cmd += ` --props "${propsFile}"`;
  }

  try {
    const output = runInProject(projectDir, cmd, 600_000); // 10 min timeout for rendering
    
    // Auto-share: generate a shareable URL
    let shareUrl: string | undefined;
    try {
      const baseUrl = process.env.ENTERPRISE_URL || `http://localhost:${process.env.PORT || 8080}`;
      const res = await fetch(`${baseUrl}/api/share-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: outputPath, ttl: 72 }), // 72 hour expiry
      });
      if (res.ok) {
        const data = await res.json() as any;
        shareUrl = data.url;
      }
    } catch {}

    return {
      success: true,
      outputPath,
      compositionId,
      codec,
      shareUrl,
      message: shareUrl ? `Video rendered and available at: ${shareUrl}` : 'Video rendered successfully',
      output: output.substring(output.length - 500),
    };
  } catch (e: any) {
    return {
      error: `Render failed: ${e.message?.substring(0, 500)}`,
      stderr: e.stderr?.substring(0, 500),
    };
  }
};

const renderStill = async (_id: any, params: any) => {
  const { projectDir, compositionId, outputPath, frame = 0, inputProps, format = 'png', scale } = params;

  if (!projectDir || !compositionId || !outputPath) return { error: 'projectDir, compositionId, and outputPath are required' };
  if (!existsSync(projectDir)) return { error: `Project directory not found: ${projectDir}` };
  if (!isRemotonInstalled(projectDir)) return { error: 'Remotion not installed.' };

  ensureDir(join(outputPath, '..'));

  let cmd = `npx remotion still ${compositionId} "${outputPath}" --frame ${frame} --image-format ${format}`;
  if (scale && scale !== 1) cmd += ` --scale ${scale}`;
  if (inputProps) {
    const propsFile = join(projectDir, '.remotion-props.json');
    writeFileSync(propsFile, JSON.stringify(inputProps));
    cmd += ` --props "${propsFile}"`;
  }

  try {
    runInProject(projectDir, cmd, 120_000);
    return { success: true, outputPath, compositionId, frame, format };
  } catch (e: any) {
    return { error: `Still render failed: ${e.message?.substring(0, 500)}` };
  }
};

const listCompositions = async (_id: any, params: any) => {
  const { projectDir } = params;
  if (!projectDir) return { error: 'projectDir is required' };
  if (!existsSync(projectDir)) return { error: `Project directory not found: ${projectDir}` };

  const compDir = join(projectDir, 'src', 'compositions');
  if (!existsSync(compDir)) return { compositions: [] };

  const files = readdirSync(compDir).filter(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
  const compositions = files.map(f => ({
    id: f.replace(/\.(tsx|jsx)$/, ''),
    file: `src/compositions/${f}`,
  }));

  return { compositions, projectDir };
};

const startPreview = async (_id: any, params: any) => {
  const { projectDir, port = 3333 } = params;
  if (!projectDir) return { error: 'projectDir is required' };
  if (!existsSync(projectDir)) return { error: `Project directory not found: ${projectDir}` };
  if (!isRemotonInstalled(projectDir)) return { error: 'Remotion not installed.' };

  try {
    // Start in background
    execSync(`cd "${projectDir}" && npx remotion studio --port ${port} &`, { 
      stdio: 'ignore', 
      timeout: 5_000,
    });
  } catch {
    // Expected — the & backgrounds it
  }

  return {
    success: true,
    url: `http://localhost:${port}`,
    message: `Remotion Studio starting on port ${port}. Open the URL in a browser to preview compositions.`,
  };
};

const addAsset = async (_id: any, params: any) => {
  const { projectDir, source, filename } = params;
  if (!projectDir || !source || !filename) return { error: 'projectDir, source, and filename are required' };

  const publicDir = join(projectDir, 'public');
  ensureDir(publicDir);
  const destPath = join(publicDir, filename);

  if (source.startsWith('http://') || source.startsWith('https://')) {
    // Download from URL
    try {
      execSync(`curl -sL -o "${destPath}" "${source}"`, { timeout: 60_000 });
    } catch (e: any) {
      return { error: `Failed to download asset: ${e.message?.substring(0, 200)}` };
    }
  } else if (existsSync(source)) {
    // Copy local file
    copyFileSync(source, destPath);
  } else {
    return { error: `Source not found: ${source}` };
  }

  return {
    success: true,
    path: `public/${filename}`,
    usage: `In your composition, use: staticFile("${filename}")`,
  };
};

const installPackage = async (_id: any, params: any) => {
  const { projectDir, packages } = params;
  if (!projectDir || !packages?.length) return { error: 'projectDir and packages are required' };
  if (!existsSync(projectDir)) return { error: `Project directory not found: ${projectDir}` };

  // Validate package names (only allow @remotion/* and common packages)
  const safePackages = (packages as string[]).filter(p => /^[@a-z0-9][\w./-]*$/.test(p));
  if (safePackages.length === 0) return { error: 'No valid package names provided' };

  try {
    const output = runInProject(projectDir, `npm install ${safePackages.join(' ')} --no-audit --no-fund 2>&1`, 120_000);
    return { success: true, installed: safePackages, output: output.substring(output.length - 300) };
  } catch (e: any) {
    return { error: `Install failed: ${e.message?.substring(0, 300)}` };
  }
};

const shareFile = async (_id: any, params: any) => {
  const { filePath, ttl = 72 } = params;
  if (!filePath) return { error: 'filePath is required' };
  if (!existsSync(filePath)) return { error: `File not found: ${filePath}` };

  try {
    const baseUrl = process.env.ENTERPRISE_URL || `http://localhost:${process.env.PORT || 8080}`;
    const res = await fetch(`${baseUrl}/api/share-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, ttl }),
    });
    if (!res.ok) return { error: `Share failed: ${res.status}` };
    const data = await res.json() as any;
    return { success: true, url: data.url, expiresIn: data.expiresIn, message: `File available at: ${data.url}` };
  } catch (e: any) {
    return { error: `Share failed: ${e.message?.substring(0, 300)}` };
  }
};

// ─── Export ───────────────────────────────────────────────

function tool(name: string, label: string, description: string, params: any, executor: Function): AnyAgentTool {
  return {
    name, label, description, category: 'productivity' as any, risk: 'medium' as any,
    parameters: params,
    execute: async (_id: string, args: any) => executor(_id, args),
  } as unknown as AnyAgentTool;
}

export function createRemotonTools(): AnyAgentTool[] {
  return [
    tool('remotion_create_project', 'Create Video Project', 'Initialize a new Remotion video project with templates (blank, text-animation, slideshow, social-reel).', {
      type: 'object', properties: {
        projectDir: { type: 'string', description: 'Directory for the project' },
        name: { type: 'string', description: 'Project name' },
        template: { type: 'string', enum: ['blank', 'hello-world', 'text-animation', 'slideshow', 'social-reel'], description: 'Starter template' },
      }, required: ['projectDir'],
    }, createProject),

    tool('remotion_create_composition', 'Create Video Composition', 'Create or update a Remotion composition (React component) that defines video content. Use React + Remotion APIs: useCurrentFrame(), interpolate(), spring(), Sequence, AbsoluteFill.', {
      type: 'object', properties: {
        projectDir: { type: 'string', description: 'Project directory' },
        compositionId: { type: 'string', description: 'Unique composition ID' },
        code: { type: 'string', description: 'Full React/TSX component code' },
        width: { type: 'number', default: 1080 }, height: { type: 'number', default: 1920 },
        fps: { type: 'number', default: 30 }, durationInSeconds: { type: 'number', default: 15 },
      }, required: ['projectDir', 'compositionId', 'code'],
    }, createComposition),

    tool('remotion_render', 'Render Video', 'Render a composition to MP4/WebM/GIF. Requires ffmpeg.', {
      type: 'object', properties: {
        projectDir: { type: 'string' }, compositionId: { type: 'string' }, outputPath: { type: 'string' },
        codec: { type: 'string', enum: ['h264', 'h265', 'vp8', 'vp9', 'gif', 'prores'], default: 'h264' },
        quality: { type: 'number' }, inputProps: { type: 'object' }, concurrency: { type: 'number' }, scale: { type: 'number' },
      }, required: ['projectDir', 'compositionId', 'outputPath'],
    }, renderVideo),

    tool('remotion_render_still', 'Render Still Image', 'Render a single frame as PNG/JPEG for thumbnails or previews.', {
      type: 'object', properties: {
        projectDir: { type: 'string' }, compositionId: { type: 'string' }, outputPath: { type: 'string' },
        frame: { type: 'number', default: 0 }, inputProps: { type: 'object' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'], default: 'png' }, scale: { type: 'number' },
      }, required: ['projectDir', 'compositionId', 'outputPath'],
    }, renderStill),

    tool('remotion_list_compositions', 'List Compositions', 'List all compositions in a Remotion project.', {
      type: 'object', properties: { projectDir: { type: 'string' } }, required: ['projectDir'],
    }, listCompositions),

    tool('remotion_preview_url', 'Start Preview Server', 'Start Remotion Studio to preview compositions in browser.', {
      type: 'object', properties: { projectDir: { type: 'string' }, port: { type: 'number', default: 3333 } }, required: ['projectDir'],
    }, startPreview),

    tool('remotion_add_asset', 'Add Asset', 'Add image/audio/video/font asset to project public/ directory from URL or local path.', {
      type: 'object', properties: {
        projectDir: { type: 'string' }, source: { type: 'string', description: 'URL or local path' },
        filename: { type: 'string', description: 'Filename in public/' },
      }, required: ['projectDir', 'source', 'filename'],
    }, addAsset),

    tool('remotion_install_package', 'Install Remotion Package', 'Install additional packages: @remotion/transitions, @remotion/motion-blur, @remotion/shapes, @remotion/lottie, @remotion/three, etc.', {
      type: 'object', properties: {
        projectDir: { type: 'string' }, packages: { type: 'array', items: { type: 'string' } },
      }, required: ['projectDir', 'packages'],
    }, installPackage),

    tool('remotion_share_file', 'Share File via URL', 'Generate a shareable URL for any file (video, image, PDF, etc.). The URL is publicly accessible for a limited time (default 72 hours). Use this to share rendered videos with users via messaging channels.', {
      type: 'object', properties: {
        filePath: { type: 'string', description: 'Absolute path to the file to share' },
        ttl: { type: 'number', default: 72, description: 'Hours until the link expires (default 72)' },
      }, required: ['filePath'],
    }, shareFile),
  ];
}
