import { h, useState, useEffect, useCallback } from './utils.js';

// ─── Three animated canvas backgrounds for the login page ───
// Randomly picks one on each page load. Only shown when no custom company background.

var CHARS_BLOCK = '\u2591\u2592\u2593\u2588\u2580\u2584\u258C\u2590\u2502\u2500\u2524\u251C\u2534\u252C\u256D\u256E\u2570\u256F';
var CHARS_DOT = '\u00B7\u2218\u25CB\u25EF\u25CC\u25CF\u25C9';

function renderSphere(ctx, rect, time) {
  var centerX = rect.width / 2;
  var centerY = rect.height / 2;
  var radius = Math.min(rect.width, rect.height) * 0.525;

  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  var points = [];

  for (var phi = 0; phi < Math.PI * 2; phi += 0.15) {
    for (var theta = 0; theta < Math.PI; theta += 0.15) {
      var x = Math.sin(theta) * Math.cos(phi + time * 0.5);
      var y = Math.sin(theta) * Math.sin(phi + time * 0.5);
      var z = Math.cos(theta);

      var rotY = time * 0.3;
      var newX = x * Math.cos(rotY) - z * Math.sin(rotY);
      var newZ = x * Math.sin(rotY) + z * Math.cos(rotY);

      var rotX = time * 0.2;
      var newY = y * Math.cos(rotX) - newZ * Math.sin(rotX);
      var finalZ = y * Math.sin(rotX) + newZ * Math.cos(rotX);

      var depth = (finalZ + 1) / 2;
      var charIndex = Math.floor(depth * (CHARS_BLOCK.length - 1));

      points.push({ x: centerX + newX * radius, y: centerY + newY * radius, z: finalZ, ch: CHARS_BLOCK[charIndex] });
    }
  }

  points.sort(function(a, b) { return a.z - b.z; });
  points.forEach(function(p) {
    var alpha = 0.15 + (p.z + 1) * 0.3;
    ctx.fillStyle = 'rgba(120, 120, 140, ' + alpha + ')';
    ctx.fillText(p.ch, p.x, p.y);
  });
}

function renderTetrahedron(ctx, rect, time) {
  var centerX = rect.width / 2;
  var centerY = rect.height / 2;
  var scale = Math.min(rect.width, rect.height) * 0.7;

  ctx.font = '18px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  var verts = [
    { x: 0, y: 1, z: 0 },
    { x: -0.943, y: -0.333, z: -0.5 },
    { x: 0.943, y: -0.333, z: -0.5 },
    { x: 0, y: -0.333, z: 1 },
  ];

  var edges = [[0,1],[0,2],[0,3],[1,2],[2,3],[3,1]];
  var faces = [[0,1,2],[0,2,3],[0,3,1],[1,3,2]];

  function rotY(p, a) { return { x: p.x * Math.cos(a) - p.z * Math.sin(a), y: p.y, z: p.x * Math.sin(a) + p.z * Math.cos(a) }; }
  function rotX(p, a) { return { x: p.x, y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) }; }
  function rotZ(p, a) { return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a), z: p.z }; }

  var points = [];

  edges.forEach(function(e) {
    var v1 = verts[e[0]], v2 = verts[e[1]];
    for (var t = 0; t <= 1; t += 0.05) {
      var pt = { x: v1.x + (v2.x - v1.x) * t, y: v1.y + (v2.y - v1.y) * t, z: v1.z + (v2.z - v1.z) * t };
      pt = rotY(pt, time * 0.4); pt = rotX(pt, time * 0.3); pt = rotZ(pt, time * 0.2);
      var d = (pt.z + 1.5) / 3;
      var ci = Math.min(Math.floor(d * (CHARS_BLOCK.length - 1)), CHARS_BLOCK.length - 1);
      points.push({ x: centerX + pt.x * scale, y: centerY - pt.y * scale, z: pt.z, ch: CHARS_BLOCK[ci] });
    }
  });

  faces.forEach(function(f) {
    var v1 = verts[f[0]], v2 = verts[f[1]], v3 = verts[f[2]];
    for (var u = 0; u <= 1; u += 0.12) {
      for (var v = 0; v <= 1 - u; v += 0.12) {
        var w = 1 - u - v;
        var pt = { x: v1.x * u + v2.x * v + v3.x * w, y: v1.y * u + v2.y * v + v3.y * w, z: v1.z * u + v2.z * v + v3.z * w };
        pt = rotY(pt, time * 0.4); pt = rotX(pt, time * 0.3); pt = rotZ(pt, time * 0.2);
        var d = (pt.z + 1.5) / 3;
        var ci = Math.min(Math.floor(d * (CHARS_BLOCK.length - 1)), CHARS_BLOCK.length - 1);
        points.push({ x: centerX + pt.x * scale, y: centerY - pt.y * scale, z: pt.z, ch: CHARS_BLOCK[ci] });
      }
    }
  });

  points.sort(function(a, b) { return a.z - b.z; });
  points.forEach(function(p) {
    var alpha = 0.1 + (p.z + 1.5) * 0.2;
    ctx.fillStyle = 'rgba(120, 120, 140, ' + Math.min(alpha, 0.7) + ')';
    ctx.fillText(p.ch, p.x, p.y);
  });
}

function renderWave(ctx, rect, time) {
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  var cols = Math.floor(rect.width / 20);
  var rows = Math.floor(rect.height / 20);

  for (var y = 0; y < rows; y++) {
    for (var x = 0; x < cols; x++) {
      var px = (x + 0.5) * (rect.width / cols);
      var py = (y + 0.5) * (rect.height / rows);

      var wave1 = Math.sin(x * 0.2 + time * 2) * Math.cos(y * 0.15 + time);
      var wave2 = Math.sin((x + y) * 0.1 + time * 1.5);
      var wave3 = Math.cos(x * 0.1 - y * 0.1 + time * 0.8);

      var combined = (wave1 + wave2 + wave3) / 3;
      var normalized = (combined + 1) / 2;

      var charIndex = Math.floor(normalized * (CHARS_DOT.length - 1));
      var alpha = 0.1 + normalized * 0.4;

      ctx.fillStyle = 'rgba(120, 120, 140, ' + alpha + ')';
      ctx.fillText(CHARS_DOT[charIndex], px, py);
    }
  }
}

var RENDERERS = [
  { fn: renderSphere, speed: 0.02 },
  { fn: renderTetrahedron, speed: 0.015 },
  { fn: renderWave, speed: 0.03 },
];

export function LoginAnimation() {
  var _choice = useState(function() { return Math.floor(Math.random() * RENDERERS.length); });
  var choice = _choice[0];

  var canvasRef = useCallback(function(canvas) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var renderer = RENDERERS[choice];
    var time = 0;
    var frameId = 0;

    function resize() {
      var dpr = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    resize();
    window.addEventListener('resize', resize);

    function render() {
      var rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      renderer.fn(ctx, rect, time);
      time += renderer.speed;
      frameId = requestAnimationFrame(render);
    }

    render();

    canvas._cleanup = function() {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frameId);
    };
  }, [choice]);

  useEffect(function() {
    return function() {
      // Cleanup on unmount — find canvas and call cleanup
      var c = document.getElementById('login-anim-canvas');
      if (c && c._cleanup) c._cleanup();
    };
  }, []);

  return h('canvas', {
    id: 'login-anim-canvas',
    ref: canvasRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      pointerEvents: 'none',
    }
  });
}
