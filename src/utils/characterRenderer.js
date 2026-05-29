/**
 * utils/characterRenderer.js
 * 2D 빌보드 방식 고양이 캐릭터 렌더러
 * Canvas 2D로 캐릭터를 그린 후 Three.js SpriteMaterial로 빌보드 표시
 */

import * as THREE from 'three';

// ── 캔버스 크기 ───────────────────────────────────────────
const CANVAS_SIZE = 128;  // 2의 거듭제곱으로 GPU 최적화

// ── 텍스처 캐시 ──────────────────────────────────────────
const textureCache = new Map();

/**
 * 캐릭터 설정으로 Three.js Sprite 생성
 * @param {{ bodyColor: string, accessories: string[] }} avatar
 * @param {string} username
 * @returns {THREE.Sprite}
 */
export function createCharacterSprite(avatar, username = '') {
  const texture = getCharacterTexture(avatar);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.01,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.7, 0.9, 1);  // 캐릭터 크기 (Three.js 유닛)
  sprite.userData.avatarKey = getAvatarKey(avatar);
  sprite.userData.username = username;

  return sprite;
}

/**
 * 이름표 Sprite 생성
 * @param {string} username
 * @param {boolean} isMe
 */
export function createNameTag(username, isMe = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  // 배경
  const bg = isMe ? 'rgba(90,62,24,0.85)' : 'rgba(30,20,10,0.65)';
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, 128, 32, 8);
  ctx.fill();

  // 텍스트
  ctx.fillStyle = isMe ? '#F7F0E0' : '#EDE0C4';
  ctx.font = `${isMe ? '600 ' : ''}11px "DM Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(username.slice(0, 10), 64, 17);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.65, 0.16, 1);
  return sprite;
}

/**
 * 커피컵 Sprite 생성 (커피 들고 있을 때)
 * @param {string} emoji
 */
export function createCoffeeSprite(emoji = '☕') {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  ctx.font = '22px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 16, 16);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.22, 0.22, 1);
  return sprite;
}

// ── 텍스처 생성 ──────────────────────────────────────────

function getAvatarKey({ bodyColor, accessories = [] }) {
  return `${bodyColor}_${[...accessories].sort().join(',')}`;
}

function getCharacterTexture(avatar) {
  const key = getAvatarKey(avatar);
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = drawCharacter(avatar);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

/**
 * Canvas 2D로 고양이 캐릭터 그리기 — 치비 라인아트 스타일
 * 큰 둥근 눈, 뭉툭한 체형, 깔끔한 아웃라인
 */
function drawCharacter({ bodyColor = '#F4ECD8', accessories = [] } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const cx = 64;
  const dark = darken(bodyColor, 0.18);
  const pinkInner = '#FFD8D0';

  // ── 그림자 ──
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#2A1408';
  ctx.beginPath();
  ctx.ellipse(cx, 118, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── 꼬리 ──
  ctx.save();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 18, 98);
  ctx.quadraticCurveTo(cx + 42, 80, cx + 30, 60);
  ctx.stroke();
  ctx.strokeStyle = lighten(bodyColor, 0.06);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();

  // ── 몸통 (아웃라인 + 채우기) ──
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(cx, 97, 26, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx, 96, 24, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 심플 셔츠/복장 오버레이 (앞치마 없을 때) ──
  if (!accessories.includes('apron')) {
    const shirtColor = lighten(darken(bodyColor, 0.08), 0.12);
    ctx.fillStyle = shirtColor;
    ctx.beginPath();
    ctx.ellipse(cx, 100, 18, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 앞발 ──
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(cx - 19, 112, 11, 7.5, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx - 19, 111, 9.5, 6.2, -0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(cx + 19, 112, 11, 7.5, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx + 19, 111, 9.5, 6.2, 0.12, 0, Math.PI * 2);
  ctx.fill();

  // ── 앞치마 (apron 악세서리) ──
  if (accessories.includes('apron')) drawApron(ctx, cx);

  // ── 귀 (모자 없을 때만) ──
  if (!accessories.includes('hat')) drawEars(ctx, cx, bodyColor, dark, pinkInner);

  // ── 머리 (아웃라인 + 채우기) ──
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(cx, 56, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(cx, 55, 28, 0, Math.PI * 2);
  ctx.fill();

  // ── 얼굴 ──
  drawFace(ctx, cx, accessories.includes('glasses'));

  // ── 장신구 ──
  if (accessories.includes('hat'))        drawHat(ctx, cx);
  if (accessories.includes('bow'))        drawBow(ctx, cx);
  if (accessories.includes('scarf'))      drawScarf(ctx, cx);
  if (accessories.includes('headphones')) drawHeadphones(ctx, cx, bodyColor);

  return canvas;
}

// ── 세부 드로잉 함수들 ────────────────────────────────────

function drawEars(ctx, cx, bodyColor, dark, pinkInner) {
  // 왼쪽 귀 — 둥근 치비 스타일
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(cx - 22, 32, 12, 16, -0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx - 22, 32, 10, 13, -0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pinkInner;
  ctx.beginPath();
  ctx.ellipse(cx - 22, 33, 6, 8, -0.22, 0, Math.PI * 2);
  ctx.fill();

  // 오른쪽 귀
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(cx + 22, 32, 12, 16, 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx + 22, 32, 10, 13, 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pinkInner;
  ctx.beginPath();
  ctx.ellipse(cx + 22, 33, 6, 8, 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawFace(ctx, cx, hasGlasses) {
  if (hasGlasses) {
    drawGlasses(ctx, cx);
  }

  // 큰 동그란 눈 — 치비 스타일 (안경 없을 때)
  if (!hasGlasses) {
    ctx.fillStyle = '#1A1010';
    ctx.beginPath();
    ctx.arc(cx - 10, 55, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - 8, 52, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1A1010';
    ctx.beginPath();
    ctx.arc(cx + 10, 55, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx + 12, 52, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 코 (작은 삼각형)
  ctx.fillStyle = '#E08090';
  ctx.beginPath();
  ctx.moveTo(cx, 65);
  ctx.lineTo(cx - 3, 68);
  ctx.lineTo(cx + 3, 68);
  ctx.closePath();
  ctx.fill();

  // 수염
  ctx.strokeStyle = 'rgba(100,70,40,0.42)';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 6, 67); ctx.lineTo(cx - 24, 64); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 6, 70); ctx.lineTo(cx - 24, 72); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, 67); ctx.lineTo(cx + 24, 64); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, 70); ctx.lineTo(cx + 24, 72); ctx.stroke();

  // 입
  ctx.strokeStyle = 'rgba(80,45,18,0.65)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 5, 71);
  ctx.quadraticCurveTo(cx - 2, 75, cx, 73);
  ctx.quadraticCurveTo(cx + 2, 75, cx + 5, 71);
  ctx.stroke();

  // 볼터치
  ctx.fillStyle = 'rgba(240,140,125,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx - 18, 65, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 18, 65, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawApron(ctx, cx) {
  // 흰 앞치마 비브
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath();
  ctx.moveTo(cx - 9, 80);
  ctx.lineTo(cx + 9, 80);
  ctx.lineTo(cx + 13, 108);
  ctx.lineTo(cx - 13, 108);
  ctx.closePath();
  ctx.fill();
  // 목 걸이 스트랩
  ctx.strokeStyle = 'rgba(190,160,100,0.58)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, 80, 6, 0, Math.PI, true);
  ctx.stroke();
  // 주머니 디테일
  ctx.strokeStyle = 'rgba(170,140,80,0.26)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 6, 91, 12, 9);
}

function drawHat(ctx, cx) {
  // 모자 챙
  ctx.fillStyle = '#3A2010';
  ctx.beginPath();
  ctx.ellipse(cx, 36, 28, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // 모자 몸통
  ctx.fillStyle = '#4A2E14';
  ctx.beginPath();
  ctx.rect(cx - 18, 14, 36, 24);
  ctx.fill();

  // 모자 윗면
  ctx.fillStyle = '#3A2010';
  ctx.beginPath();
  ctx.ellipse(cx, 14, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 리본 (갈색 띠)
  ctx.fillStyle = '#C4704A';
  ctx.fillRect(cx - 18, 29, 36, 6);

  // 리본 버클
  ctx.fillStyle = '#E8B84B';
  ctx.beginPath();
  ctx.rect(cx - 5, 30, 10, 4);
  ctx.fill();
}

function drawGlasses(ctx, cx) {
  ctx.strokeStyle = '#5A3A1A';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(180,210,240,0.3)';

  ctx.beginPath();
  ctx.arc(cx - 10, 55, 8, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx + 10, 55, 8, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 2, 55); ctx.lineTo(cx + 2, 55);
  ctx.stroke();

  // 눈
  ctx.fillStyle = '#1A1010';
  ctx.beginPath();
  ctx.arc(cx - 10, 55, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, 55, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx - 8, 52, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 12, 52, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBow(ctx, cx) {
  const bx = cx + 26;
  const by = 34;

  ctx.fillStyle = '#E8608A';
  // 왼쪽 날개
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.bezierCurveTo(bx - 12, by - 8, bx - 12, by + 8, bx, by);
  ctx.fill();
  // 오른쪽 날개
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.bezierCurveTo(bx + 12, by - 8, bx + 12, by + 8, bx, by);
  ctx.fill();
  // 중심
  ctx.fillStyle = '#C84A6A';
  ctx.beginPath();
  ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawScarf(ctx, cx) {
  ctx.fillStyle = '#E84848';
  ctx.beginPath();
  ctx.rect(cx - 22, 77, 44, 10);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.rect(cx - 20 + i * 9, 79, 4, 2);
    ctx.fill();
  }

  ctx.fillStyle = '#E84848';
  ctx.beginPath();
  ctx.rect(cx - 5, 85, 14, 18);
  ctx.fill();
}

function drawHeadphones(ctx, cx, bodyColor) {
  ctx.strokeStyle = '#2A2A3A';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, 52, 30, Math.PI * 1.12, Math.PI * 1.88, false);
  ctx.stroke();

  ctx.fillStyle = '#3A3A4A';
  ctx.beginPath();
  ctx.ellipse(cx + 28, 56, 8, 10, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6A6A8A';
  ctx.beginPath();
  ctx.ellipse(cx + 28, 56, 5, 7, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3A3A4A';
  ctx.beginPath();
  ctx.ellipse(cx - 28, 56, 8, 10, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6A6A8A';
  ctx.beginPath();
  ctx.ellipse(cx - 28, 56, 5, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

// 안경은 drawFace에 통합
// drawFace(ctx, cx, hasGlasses) — hasGlasses=true면 drawGlasses 호출

// ── 색상 유틸 ─────────────────────────────────────────────

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 200, g: 160, b: 120 };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => {
    const hex = Math.max(0, Math.min(255, Math.round(v))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

// roundRect 폴리필
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** 텍스처 캐시 정리 */
export function disposeCharacterTextures() {
  textureCache.forEach(texture => texture.dispose());
  textureCache.clear();
}
