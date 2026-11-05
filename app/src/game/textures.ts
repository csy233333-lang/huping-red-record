import * as THREE from 'three';

// 全部贴图用 Canvas 程序化绘制：青砖、土墙、标语、石板、屋顶

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, dark: boolean) {
  for (let i = 0; i < n; i++) {
    const v = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

function toTexture(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 青砖墙面 */
export function brickTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#5d6468';
  ctx.fillRect(0, 0, 256, 256);
  const bh = 16, bw = 42;
  for (let y = 0; y < 256 / bh; y++) {
    const off = y % 2 ? bw / 2 : 0;
    for (let x = -1; x < 256 / bw + 1; x++) {
      const g = 88 + Math.random() * 22;
      ctx.fillStyle = `rgb(${g - 6},${g + 2},${g + 7})`;
      ctx.fillRect(x * bw + off + 1, y * bh + 1, bw - 2, bh - 2);
    }
  }
  noise(ctx, 256, 256, 500, 0.1, true);
  noise(ctx, 256, 256, 260, 0.08, false);
  return toTexture(c);
}

/** 土坯墙面 */
export function mudTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#8a7a63';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 900, 0.1, true);
  noise(ctx, 256, 256, 500, 0.09, false);
  // 裂纹
  ctx.strokeStyle = 'rgba(60,50,38,0.35)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 40;
      y += Math.random() * 24;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(c);
}

/** 标语墙：底墙 + 褪色红字 + 风化 */
export function sloganTexture(text: string, base: 'brick' | 'mud' = 'brick'): THREE.CanvasTexture {
  const w = 512, h = 192;
  const { c, ctx } = canvas(w, h);
  const baseTex = base === 'brick' ? brickTexture() : mudTexture();
  ctx.drawImage(baseTex.image as HTMLCanvasElement, 0, 0, w, h);
  // 白灰底（部分标语直接写在墙上，垫一层薄白）
  ctx.fillStyle = 'rgba(226,218,200,0.35)';
  ctx.fillRect(14, 18, w - 28, h - 36);
  // 标语红字（竖排感 => 横排大字）
  const chars = [...text];
  const isLong = chars.length > 8;
  ctx.fillStyle = '#8e2f24';
  ctx.font = `bold ${isLong ? 46 : 64}px "Kaiti SC","KaiTi","STKaiti",serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 略微手写抖动
  const step = (w - 60) / chars.length;
  chars.forEach((ch, i) => {
    const jitter = (Math.random() - 0.5) * 6;
    ctx.save();
    ctx.translate(30 + step * i + step / 2, h / 2 + jitter);
    ctx.rotate((Math.random() - 0.5) * 0.06);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  // 风化：随机擦除 + 雨痕
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.12 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 竖向雨痕
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * w;
    const grad = ctx.createLinearGradient(x, 0, x, h);
    grad.addColorStop(0, 'rgba(0,0,0,0.0)');
    grad.addColorStop(1, `rgba(0,0,0,${0.06 + Math.random() * 0.12})`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 2 + Math.random() * 5, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  noise(ctx, w, h, 320, 0.07, true);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** 泥土地面 */
export function groundTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#7a6c56';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 1400, 0.12, true);
  noise(ctx, 256, 256, 700, 0.08, false);
  // 杂草点
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(90,104,62,${0.25 + Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2 + Math.random() * 3);
  }
  return toTexture(c, 10);
}

/** 石板路 */
export function stonePathTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#6e6a60';
  ctx.fillRect(0, 0, 256, 256);
  const sw = 62, sh = 40;
  for (let y = 0; y < 7; y++) {
    const off = y % 2 ? sw / 2 : 0;
    for (let x = -1; x < 5; x++) {
      const g = 118 + Math.random() * 26;
      ctx.fillStyle = `rgb(${g},${g - 4},${g - 12})`;
      ctx.beginPath();
      ctx.roundRect(x * sw + off + 3, y * sh + 3, sw - 6, sh - 6, 8);
      ctx.fill();
    }
  }
  noise(ctx, 256, 256, 500, 0.1, true);
  return toTexture(c, 4);
}

/** 瓦片屋顶 */
export function roofTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#4c4f52';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const g = 70 + Math.random() * 18;
      ctx.fillStyle = `rgb(${g},${g + 2},${g + 4})`;
      ctx.beginPath();
      ctx.arc(x * 32 + 16, y * 32 + 30, 15, Math.PI, 0);
      ctx.fill();
    }
  }
  noise(ctx, 256, 256, 400, 0.12, true);
  return toTexture(c, 2);
}

/** 树皮 */
export function barkTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = '#5a4a38';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 24; i++) {
    ctx.strokeStyle = `rgba(40,32,24,${0.25 + Math.random() * 0.3})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const x = Math.random() * 128;
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 6, 42, x - 6, 84, x + 4, 128);
    ctx.stroke();
  }
  return toTexture(c);
}
