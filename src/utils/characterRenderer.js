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
 * Canvas 2D로 고양이 캐릭터 그리기
 * 귀엽고 단순한 2D 벡터 스타일
 */
function drawCharacter({ bodyColor = '#F4C896', accessories = [] } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const cx = 64;  // 중심 X
  const scale = 1; // 전체 스케일

  // ── 색상 계산 ──
  const dark = darken(bodyColor, 0.2);
  const light = lighten(bodyColor, 0.15);
  const pinkInner = '#F8C0C0';

  // ── 그림자 ──
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#3A2010';
  ctx.beginPath();
  ctx.ellipse(cx, 110, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── 꼬리 ──
  ctx.save();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 16, 92);
  ctx.quadraticCurveTo(cx + 40, 85, cx + 30, 68);
  ctx.stroke();
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  // ── 몸통 ──
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx, 82, 22, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  // 몸통 밝은 부분
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(cx - 3, 76, 12, 16, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // ── 앞발 ──
  ctx.fillStyle = bodyColor;
  // 왼발
  ctx.beginPath();
  ctx.ellipse(cx - 14, 100, 7, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // 오른발
  ctx.beginPath();
  ctx.ellipse(cx + 14, 100, 7, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // 발 끝 (패드)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(cx - 14, 103, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 14, 103, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 귀 (모자 없을 때만) ──
  const hasHat = accessories.includes('hat');
  if (!hasHat) {
    drawEars(ctx, cx, bodyColor, dark, pinkInner);
  }

  // ── 머리 ──
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(cx, 56, 26, 0, Math.PI * 2);
  ctx.fill();

  // 머리 밝은 부분
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(cx - 4, 50, 14, 12, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // ── 얼굴 특징 ──
  drawFace(ctx, cx, accessories.includes('glasses'));

  // ── 장신구들 ──
  if (accessories.includes('hat'))       drawHat(ctx, cx);
  if (accessories.includes('bow'))       drawBow(ctx, cx);
  if (accessories.includes('scarf'))     drawScarf(ctx, cx);
  if (accessories.includes('headphones')) drawHeadphones(ctx, cx, bodyColor);

  return canvas;
}

// ── 세부 드로잉 함수들 ────────────────────────────────────

function drawEars(ctx, cx, bodyColor, dark, pinkInner) {
  // 왼쪽 귀
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(cx - 22, 42);
  ctx.lineTo(cx - 32, 20);
  ctx.lineTo(cx - 10, 34);
  ctx.closePath();
  ctx.fill();

  // 왼쪽 귀 안
  ctx.fillStyle = pinkInner;
  ctx.beginPath();
  ctx.moveTo(cx - 21, 40);
  ctx.lineTo(cx - 28, 25);
  ctx.lineTo(cx - 13, 36);
  ctx.closePath();
  ctx.fill();

  // 오른쪽 귀
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(cx + 22, 42);
  ctx.lineTo(cx + 32, 20);
  ctx.lineTo(cx + 10, 34);
  ctx.closePath();
  ctx.fill();

  // 오른쪽 귀 안
  ctx.fillStyle = pinkInner;
  ctx.beginPath();
  ctx.moveTo(cx + 21, 40);
  ctx.lineTo(cx + 28, 25);
  ctx.lineTo(cx + 13, 36);
  ctx.closePath();
  ctx.fill();
}

function drawFace(ctx, cx, hasGlasses) {
  // 안경이 있으면 렌즈+눈을 drawGlasses에서 통합 처리
  if (hasGlasses) {
    drawGlasses(ctx, cx);
  }

  // 눈 (안경 없을 때)
  if (!hasGlasses) {
    // 왼쪽 눈
    ctx.fillStyle = '#2A1A0A';
    ctx.beginPath();
    ctx.ellipse(cx - 9, 54, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 왼쪽 눈 하이라이트
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - 7, 52, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 오른쪽 눈
    ctx.fillStyle = '#2A1A0A';
    ctx.beginPath();
    ctx.ellipse(cx + 9, 54, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx + 11, 52, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 코
  ctx.fillStyle = '#E8808A';
  ctx.beginPath();
  ctx.moveTo(cx, 61);
  ctx.lineTo(cx - 3, 65);
  ctx.lineTo(cx + 3, 65);
  ctx.closePath();
  ctx.fill();

  // 수염 (왼쪽)
  ctx.strokeStyle = 'rgba(80,50,20,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 5, 64);  ctx.lineTo(cx - 20, 62);  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 5, 67);  ctx.lineTo(cx - 20, 68);  ctx.stroke();

  // 수염 (오른쪽)
  ctx.beginPath();
  ctx.moveTo(cx + 5, 64);  ctx.lineTo(cx + 20, 62);  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 5, 67);  ctx.lineTo(cx + 20, 68);  ctx.stroke();

  // 입 (w 모양 귀여운 입)
  ctx.strokeStyle = '#2A1A0A';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 5, 69);
  ctx.quadraticCurveTo(cx - 2, 73, cx, 71);
  ctx.quadraticCurveTo(cx + 2, 73, cx + 5, 69);
  ctx.stroke();

  // 볼터치
  ctx.fillStyle = 'rgba(240,140,130,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx - 14, 63, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 14, 63, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
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

  // 왼쪽 렌즈
  ctx.beginPath();
  ctx.arc(cx - 9, 54, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 오른쪽 렌즈
  ctx.beginPath();
  ctx.arc(cx + 9, 54, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 브릿지
  ctx.beginPath();
  ctx.moveTo(cx - 2, 54);
  ctx.lineTo(cx + 2, 54);
  ctx.stroke();

  // 눈 (안경 위에)
  ctx.fillStyle = '#2A1A0A';
  ctx.beginPath();
  ctx.ellipse(cx - 9, 54, 3.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 9, 54, 3.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx - 7, 52, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 11, 52, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawBow(ctx, cx) {
  // 리본 (오른쪽 귀 옆)
  const bx = cx + 22;
  const by = 38;

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
  // 목도리
  ctx.fillStyle = '#E84848';
  ctx.beginPath();
  ctx.rect(cx - 22, 72, 44, 10);
  ctx.fill();

  // 목도리 패턴
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.rect(cx - 20 + i * 9, 74, 4, 2);
    ctx.fill();
  }

  // 늘어진 부분
  ctx.fillStyle = '#E84848';
  ctx.beginPath();
  ctx.rect(cx - 5, 80, 14, 20);
  ctx.fill();
}

function drawHeadphones(ctx, cx, bodyColor) {
  // 헤드밴드
  ctx.strokeStyle = '#2A2A3A';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, 48, 28, Math.PI * 1.15, Math.PI * 1.85, false);
  ctx.stroke();

  // 오른쪽 이어패드
  ctx.fillStyle = '#3A3A4A';
  ctx.beginPath();
  ctx.ellipse(cx + 26, 52, 8, 10, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6A6A8A';
  ctx.beginPath();
  ctx.ellipse(cx + 26, 52, 5, 7, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // 왼쪽 이어패드
  ctx.fillStyle = '#3A3A4A';
  ctx.beginPath();
  ctx.ellipse(cx - 26, 52, 8, 10, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6A6A8A';
  ctx.beginPath();
  ctx.ellipse(cx - 26, 52, 5, 7, -0.3, 0, Math.PI * 2);
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
