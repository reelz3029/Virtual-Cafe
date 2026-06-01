/**
 * utils/characterRenderer.js
 * 2D 빌보드 고양이 캐릭터 — "번(bun) 고양이" 비율 (머리 크게 ~2.2등신)
 *
 * - 아웃라인: 다크 초콜릿 #3A2418 (순검정 금지)
 * - 핑크 제거 → 살구/로즈브라운 (귀안 #E8C0A8, 코 #C08070, 볼 apricot)
 * - 무늬(drawPattern): tabby / calico / cow / tuxedo / siamese
 * - 표정(expression): normal / study / sip / talk
 * - 사물(item): laptop / book / cup / knit / sketch (앞발 사이)
 * - 방향(dir): front / back (안쪽 보는 좌석은 back)
 *
 * 호환: avatar = { bodyColor, accessories[] } 유지.
 *   opts = { expression, item, dir } (선택) — 캐시 키에 포함.
 */

import * as THREE from 'three';

const SIZE = 128;
const OUT  = '#3A2418';   // 다크 초콜릿 아웃라인
const textureCache = new Map();

// ── 털 프리셋 (base + 무늬색 + 타입) ───────────────────────
const FUR_PRESETS = {
  cream:    { base: '#F2E3CC', patt: '#D9C4A0', type: 'solid'   },
  cheese:   { base: '#E8B87A', patt: '#C4823E', type: 'tabby'   },
  calico:   { base: '#F4ECDC', patt: '#D89248', type: 'calico'  },
  mackerel: { base: '#C9A06A', patt: '#7A5230', type: 'tabby'   },
  tuxedo:   { base: '#4A423A', patt: '#F2E8DC', type: 'tuxedo'  },
  cow:      { base: '#F2ECE2', patt: '#3A2E26', type: 'cow'     },
  siamese:  { base: '#E8DCC4', patt: '#6B4A38', type: 'siamese' },
  ginger:   { base: '#E8943E', patt: '#C46A1E', type: 'tabby'   },
};
const PRESET_TYPES = ['solid', 'tabby', 'calico', 'tuxedo', 'cow', 'siamese'];

/** avatar → 털 정보. fur 프리셋명이 있으면 그걸, 없으면 bodyColor 기반 파생 */
function deriveFur(avatar = {}) {
  if (avatar.fur && FUR_PRESETS[avatar.fur]) return FUR_PRESETS[avatar.fur];
  const base = avatar.bodyColor || '#F2E3CC';
  // bodyColor 해시로 무늬 타입을 결정론적으로 부여 (색마다 일관된 무늬)
  const h = hashStr(base);
  const type = PRESET_TYPES[h % PRESET_TYPES.length];
  const patt = type === 'tuxedo' ? '#F2E8DC' : darken(base, 0.28);
  return { base, patt, type };
}

// ── 외부 API ───────────────────────────────────────────────
/**
 * @param {{bodyColor,accessories}} avatar
 * @param {string} username
 * @param {{expression?:string,item?:string,dir?:string}} opts
 */
export function createCharacterSprite(avatar = {}, username = '', opts = {}) {
  const texture = getCharacterTexture(avatar, opts);
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, alphaTest: 0.01,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.88, 1.12, 1);   // 멀리서도 번 고양이가 잘 보이게
  sprite.userData.username = username;
  return sprite;
}

export function createNameTag(username, isMe = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = isMe ? 'rgba(90,62,24,0.85)' : 'rgba(40,26,16,0.68)';
  roundRect(ctx, 0, 0, 128, 32, 9); ctx.fill();
  ctx.fillStyle = isMe ? '#FFE6C2' : '#EDE0C4';
  ctx.font = `${isMe ? '600 ' : ''}11px "DM Sans", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(username).slice(0, 10), 64, 17);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.66, 0.165, 1);
  return sprite;
}

export function createCoffeeSprite(emoji = '☕') {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 16, 16);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.22, 0.22, 1);
  return sprite;
}

export function disposeCharacterTextures() {
  textureCache.forEach(t => t.dispose());
  textureCache.clear();
}

// ── 텍스처 캐시 ────────────────────────────────────────────
function getCharacterTexture(avatar, opts) {
  const fur = deriveFur(avatar);
  const acc = (avatar.accessories || []).slice().sort().join(',');
  const expression = opts.expression || 'normal';
  const item = opts.item || 'none';
  const dir = opts.dir || 'front';
  const key = `${fur.base}_${fur.type}_${expression}_${item}_${dir}_${acc}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = drawCharacter(fur, avatar.accessories || [], expression, item, dir);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

// ── 캐릭터 드로잉 ──────────────────────────────────────────
function drawCharacter(fur, accessories, expression, item, dir) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.lineJoin = ctx.lineCap = 'round';
  const cx = 64;
  const { base, patt, type } = fur;

  // 그림자
  ctx.save();
  ctx.globalAlpha = 0.12; ctx.fillStyle = '#2A1408';
  ctx.beginPath(); ctx.ellipse(cx, 120, 21, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // 꼬리
  ctx.strokeStyle = OUT; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(cx + 15, 104); ctx.quadraticCurveTo(cx + 40, 86, cx + 30, 64); ctx.stroke();
  ctx.strokeStyle = base; ctx.lineWidth = 5.5; ctx.stroke();

  // 몸통 (작게 — 번 비율)
  fillOutlined(ctx, () => ctx.ellipse(cx, 100, 21, 19, 0, 0, Math.PI * 2), base, 3.5);

  // 앞발
  fillOutlined(ctx, () => ctx.ellipse(cx - 13, 114, 9, 6.5, -0.1, 0, Math.PI * 2), base, 3);
  fillOutlined(ctx, () => ctx.ellipse(cx + 13, 114, 9, 6.5, 0.1, 0, Math.PI * 2), base, 3);

  // 사물 (앞발 사이)
  if (item && item !== 'none') drawItem(ctx, cx, item);

  // 앞치마
  if (accessories.includes('apron')) drawApron(ctx, cx);

  // 귀 (모자 없을 때)
  if (!accessories.includes('hat')) drawEars(ctx, cx, base);

  // 머리 (크게)
  fillOutlined(ctx, () => ctx.arc(cx, 50, 31, 0, Math.PI * 2), base, 4);

  // 무늬
  drawPattern(ctx, cx, type, base, patt);

  if (dir === 'back') {
    // 뒤통수 — 얼굴 없이 귀/등만, 가벼운 음영
    ctx.fillStyle = 'rgba(58,36,24,0.08)';
    ctx.beginPath(); ctx.arc(cx, 50, 31, 0, Math.PI * 2); ctx.fill();
  } else {
    drawFace(ctx, cx, expression, accessories.includes('glasses'));
  }

  // 장신구
  if (accessories.includes('hat'))        drawHat(ctx, cx);
  if (accessories.includes('bow'))        drawBow(ctx, cx);
  if (accessories.includes('scarf'))      drawScarf(ctx, cx);
  if (accessories.includes('headphones')) drawHeadphones(ctx, cx);

  return canvas;
}

// 아웃라인 깔고 채우기 헬퍼
function fillOutlined(ctx, pathFn, fill, lw) {
  ctx.fillStyle = OUT;
  ctx.beginPath(); pathFn(); ctx.fill();
  // 살짝 안쪽으로 채움 (아웃라인 보이게)
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath(); pathFn(); ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.restore();
}

function drawEars(ctx, cx, base) {
  [[-22, -0.22], [22, 0.22]].forEach(([dx, rot]) => {
    ctx.save(); ctx.translate(cx + dx, 30); ctx.rotate(rot);
    ctx.fillStyle = OUT;
    ctx.beginPath(); ctx.moveTo(-12, 13); ctx.quadraticCurveTo(-2, -17, 13, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.moveTo(-9, 11); ctx.quadraticCurveTo(-1, -12, 10, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E8C0A8';   // 귀안 살구
    ctx.beginPath(); ctx.moveTo(-6, 9); ctx.quadraticCurveTo(-1, -6, 7, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
}

function drawPattern(ctx, cx, type, base, patt) {
  ctx.save();
  if (type === 'tabby') {
    ctx.strokeStyle = patt; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.85;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * 9, 22); ctx.lineTo(cx + i * 9, 36); ctx.stroke();
    }
    // 몸통 줄무늬
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(cx - 14, 96 + i * 7); ctx.lineTo(cx + 14, 96 + i * 7); ctx.stroke();
    }
  } else if (type === 'calico') {
    ctx.fillStyle = patt;
    ctx.beginPath(); ctx.ellipse(cx - 15, 40, 12, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3E362E';
    ctx.beginPath(); ctx.ellipse(cx + 13, 56, 10, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = patt;
    ctx.beginPath(); ctx.ellipse(cx + 10, 98, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'cow') {
    ctx.fillStyle = patt;
    ctx.beginPath(); ctx.ellipse(cx + 14, 44, 11, 10, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - 12, 100, 10, 9, 0, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'tuxedo') {
    // 가슴 흰 털 + 얼굴 블레이즈
    ctx.fillStyle = patt;
    ctx.beginPath(); ctx.ellipse(cx, 104, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, 62, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'siamese') {
    // 포인트: 얼굴/귀 끝 어둡게
    ctx.globalAlpha = 0.5; ctx.fillStyle = patt;
    ctx.beginPath(); ctx.ellipse(cx, 58, 16, 14, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawFace(ctx, cx, expression, hasGlasses) {
  if (hasGlasses) drawGlasses(ctx, cx);
  const ey = 52;

  // 눈 — 표정별
  ctx.strokeStyle = OUT; ctx.fillStyle = OUT; ctx.lineWidth = 3;
  if (expression === 'sip') {
    // 감은 행복한 눈 ^^
    eyeArc(ctx, cx - 11, ey, 5, Math.PI * 1.15, Math.PI * 1.85);
    eyeArc(ctx, cx + 11, ey, 5, Math.PI * 1.15, Math.PI * 1.85);
  } else if (expression === 'study') {
    // 반쯤 감은 눈 + 작은 하트
    eyeArc(ctx, cx - 11, ey, 5, Math.PI * 0.12, Math.PI * 0.88);
    eyeArc(ctx, cx + 11, ey, 5, Math.PI * 0.12, Math.PI * 0.88);
    drawHeart(ctx, cx + 26, 34, '#F4ECDC');
  } else {
    // normal / talk — 큰 동그란 눈
    eyeDot(ctx, cx - 10, ey);
    eyeDot(ctx, cx + 10, ey);
  }

  // 코 (로즈브라운)
  ctx.fillStyle = '#C08070';
  ctx.beginPath(); ctx.moveTo(cx, 62); ctx.lineTo(cx - 3, 66); ctx.lineTo(cx + 3, 66); ctx.closePath(); ctx.fill();

  // 입 — talk 면 작게 벌림
  ctx.strokeStyle = 'rgba(80,45,18,0.6)'; ctx.lineWidth = 1.6;
  if (expression === 'talk') {
    ctx.fillStyle = '#9A5040';
    ctx.beginPath(); ctx.ellipse(cx, 70, 3, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 5, 67); ctx.quadraticCurveTo(cx, 71, cx + 5, 67); ctx.stroke();
  }

  // 수염
  ctx.strokeStyle = 'rgba(100,70,40,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 6, 63); ctx.lineTo(cx - 24, 61); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 6, 66); ctx.lineTo(cx - 24, 68); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, 63); ctx.lineTo(cx + 24, 61); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, 66); ctx.lineTo(cx + 24, 68); ctx.stroke();

  // 볼터치 (살구)
  ctx.fillStyle = 'rgba(220,150,110,0.3)';
  ctx.beginPath(); ctx.ellipse(cx - 19, 60, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 19, 60, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
}

function eyeDot(ctx, x, y) {
  ctx.fillStyle = OUT;
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(x + 2, y - 3, 2, 0, Math.PI * 2); ctx.fill();
}
function eyeArc(ctx, x, y, r, a0, a1) {
  ctx.strokeStyle = OUT; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
}
function drawHeart(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + 3);
  ctx.bezierCurveTo(x - 4, y - 2, x - 5, y + 1, x, y + 5);
  ctx.bezierCurveTo(x + 5, y + 1, x + 4, y - 2, x, y + 3);
  ctx.fill();
}

// ── 사물 (앞발 사이) ───────────────────────────────────────
function drawItem(ctx, cx, item) {
  ctx.lineWidth = 3; ctx.strokeStyle = OUT;
  if (item === 'laptop') {
    ctx.fillStyle = '#5A6B7A';
    ctx.beginPath(); ctx.rect(cx - 12, 102, 24, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8FA8C8'; ctx.fillRect(cx - 9, 104, 18, 8);
  } else if (item === 'book') {
    ctx.fillStyle = '#A6543E';
    ctx.beginPath(); ctx.rect(cx - 13, 104, 26, 10); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#F2E8DC'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, 105); ctx.lineTo(cx, 113); ctx.stroke();
  } else if (item === 'cup') {
    ctx.fillStyle = '#C89A6A';
    ctx.beginPath(); ctx.rect(cx - 8, 104, 16, 11); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(143,168,154,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 2, 102); ctx.quadraticCurveTo(cx - 5, 97, cx - 2, 92); ctx.stroke();
  } else if (item === 'knit') {
    ctx.fillStyle = '#B5705A';
    ctx.beginPath(); ctx.arc(cx, 108, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#9A8C6E'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + 6, 106); ctx.lineTo(cx + 16, 100); ctx.stroke();
  } else if (item === 'sketch') {
    ctx.fillStyle = '#F2E8DC';
    ctx.beginPath(); ctx.rect(cx - 12, 103, 24, 12); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#7B8B5A'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 7, 110); ctx.lineTo(cx + 2, 105); ctx.lineTo(cx + 8, 111); ctx.stroke();
  }
}

// ── 장신구 (번 비율에 맞춰 조정) ───────────────────────────
function drawApron(ctx, cx) {
  ctx.fillStyle = 'rgba(245,237,216,0.92)';
  ctx.beginPath();
  ctx.moveTo(cx - 8, 88); ctx.lineTo(cx + 8, 88);
  ctx.lineTo(cx + 11, 114); ctx.lineTo(cx - 11, 114); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(150,120,80,0.5)'; ctx.lineWidth = 1;
  ctx.strokeRect(cx - 5, 96, 10, 8);
}
function drawHat(ctx, cx) {
  ctx.fillStyle = '#5A3E28';
  ctx.beginPath(); ctx.ellipse(cx, 32, 27, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6B4A2E'; ctx.fillRect(cx - 16, 12, 32, 22);
  ctx.fillStyle = '#5A3E28';
  ctx.beginPath(); ctx.ellipse(cx, 12, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#C4704A'; ctx.fillRect(cx - 16, 27, 32, 5);
}
function drawGlasses(ctx, cx) {
  ctx.strokeStyle = '#5A3A1A'; ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(180,210,240,0.28)';
  ctx.beginPath(); ctx.arc(cx - 10, 52, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 10, 52, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 2, 52); ctx.lineTo(cx + 2, 52); ctx.stroke();
}
function drawBow(ctx, cx) {
  const bx = cx + 24, by = 32;
  ctx.fillStyle = '#C4885A';
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.bezierCurveTo(bx - 11, by - 7, bx - 11, by + 7, bx, by); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.bezierCurveTo(bx + 11, by - 7, bx + 11, by + 7, bx, by); ctx.fill();
  ctx.fillStyle = '#A6543E';
  ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
}
function drawScarf(ctx, cx) {
  ctx.fillStyle = '#A6543E';
  ctx.fillRect(cx - 20, 80, 40, 9);
  ctx.fillStyle = '#E8DCC4';
  for (let i = 0; i < 5; i++) ctx.fillRect(cx - 18 + i * 8, 82, 3, 2);
  ctx.fillStyle = '#A6543E'; ctx.fillRect(cx - 4, 87, 12, 16);
}
function drawHeadphones(ctx, cx) {
  ctx.strokeStyle = '#3A2E26'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, 48, 30, Math.PI * 1.12, Math.PI * 1.88, false); ctx.stroke();
  ctx.fillStyle = '#3A2E26';
  ctx.beginPath(); ctx.ellipse(cx + 28, 52, 7, 9, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx - 28, 52, 7, 9, -0.3, 0, Math.PI * 2); ctx.fill();
}

// ── 색상/유틸 ──────────────────────────────────────────────
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
           : { r: 200, g: 160, b: 120 };
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => {
    const h = Math.max(0, Math.min(255, Math.round(v))).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');
}
function darken(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
