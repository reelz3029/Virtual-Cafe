/**
 * systems/npcBuffer.js
 * 빈 방 완충용 분위기 NPC 고양이 — 순수 연출, 상호작용 없음
 *
 * 실제 presence 와 무관하게, 내 방 실제 인원이 적을 때 배경에 고정 NPC 를 띄워
 * "완전히 혼자는 아닌" 느낌을 만든다. 인원이 차면 NPC 부터 사라진다.
 *
 * 사용:
 *   const npc = new NpcBuffer(scene, cafeScene);
 *   npc.spawn();                 // 고정 위치에 NPC 생성 (숨김 상태)
 *   npc.updateByOccupancy(n);    // onlineUsers.length 가 바뀔 때마다 호출
 *   npc.update(t);               // 애니메이션 루프에서 매 프레임
 *   npc.dispose();
 *
 * NPC 는 상호작용 대상이 아니므로 raycaster/클릭 대상에서 제외할 것
 * (worldRenderer 의 _onTableClick 은 this.tables 만 보므로 자동 제외됨).
 */

import * as THREE from 'three';
import { ROOM_CONFIG } from './roomAllocator.js';

// 고정 NPC 정의 — 위치는 카페 공간 기준(필요시 cafeScene 좌표에 맞게 조정)
// 위치는 cafeScene 룸 좌표 기준 (카운터 x4·z-6, 창=좌벽, 테이블 z0~4)
const NPC_DEFS = [
  // 카운터 바리스타 (카운터 뒤, 상반신 노출)
  { name: '점장냥', fur: '#8B6B4A', patt: '#5A3E28', type: 'tabby', item: 'cup',
    pos: { x: 4.0, y: 1.5, z: -5.6 }, role: 'barista' },
  // 창가에서 조는 고양이
  { name: '낮잠이', fur: '#F2E3CC', patt: '', type: 'solid', item: 'none',
    pos: { x: -6.6, y: 0.7, z: 2.2 }, role: 'sleeper' },
  // 책 읽는 단골
  { name: '책벌레', fur: '#4A423A', patt: '', type: 'tuxedo', item: 'book',
    pos: { x: -1.6, y: 0.7, z: -2.2 }, role: 'reader' },
];

export class NpcBuffer {
  constructor(scene) {
    this._scene = scene;
    this._group = new THREE.Group();
    this._group.name = 'npc-buffer';
    this._sprites = [];
    scene.add(this._group);
  }

  spawn() {
    NPC_DEFS.forEach((def, i) => {
      const tex = drawNpcCat(def);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(1.5, 1.6, 1);
      spr.position.set(def.pos.x, def.pos.y, def.pos.z);
      spr.userData = { baseY: def.pos.y, phase: i * 1.7, role: def.role };
      spr.visible = false;
      this._group.add(spr);
      this._sprites.push(spr);
    });
  }

  /**
   * 실제 인원수에 따라 NPC 표시 개수 조절
   * @param {number} realCount - onlineUsers.length
   */
  updateByOccupancy(realCount) {
    const cap = ROOM_CONFIG.capacity;
    let show;
    if (realCount >= cap * 0.5) show = 0;
    else if (realCount >= cap * 0.25) show = 1;
    else show = 3;

    this._sprites.forEach((spr, i) => {
      const want = i < show;
      if (spr.visible !== want) {
        spr.visible = want;
        if (want) spr.userData._fadeIn = 0; // 페이드인 시작
      }
    });
  }

  update(t) {
    this._sprites.forEach(spr => {
      if (!spr.visible) return;
      // 역할별 미세 애니메이션
      const u = spr.userData;
      if (u.role === 'sleeper') {
        spr.position.y = u.baseY + Math.sin(t * 0.8 + u.phase) * 0.02; // 느린 숨
      } else {
        spr.position.y = u.baseY + Math.sin(t * 1.5 + u.phase) * 0.04;
      }
      // 페이드인
      if (u._fadeIn !== undefined && u._fadeIn < 1) {
        u._fadeIn = Math.min(1, u._fadeIn + 0.03);
        spr.material.opacity = u._fadeIn;
      }
    });
  }

  dispose() {
    this._sprites.forEach(spr => {
      spr.material.map?.dispose();
      spr.material.dispose();
    });
    this._scene.remove(this._group);
    this._sprites = [];
  }
}

// ── NPC 고양이 텍스처 (컨셉 데모와 동일 방식, 공부중 표정) ──
function drawNpcCat(def) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const cx = 64, OUT = '#3A2418', fur = def.fur, patt = def.patt;
  x.lineJoin = x.lineCap = 'round';

  // 그림자
  x.fillStyle = 'rgba(58,36,24,.16)';
  x.beginPath(); x.ellipse(cx, 118, 22, 5, 0, 0, 7); x.fill();
  // 꼬리
  x.strokeStyle = OUT; x.lineWidth = 10;
  x.beginPath(); x.moveTo(cx + 16, 96); x.quadraticCurveTo(cx + 40, 78, cx + 30, 52); x.stroke();
  x.strokeStyle = fur; x.lineWidth = 5.5; x.stroke();
  // 몸통
  ell(x, cx, 92, 26, 24, fur, OUT, 4);
  // 앞발
  ell(x, cx - 16, 110, 11, 8, fur, OUT, 3.5);
  ell(x, cx + 16, 110, 11, 8, fur, OUT, 3.5);
  // 사물
  drawItem(x, cx, def.item);
  // 귀
  ear(x, cx - 26, 32, -0.25, fur, OUT);
  ear(x, cx + 26, 32, 0.25, fur, OUT);
  // 머리
  circ(x, cx, 52, 32, fur, OUT, 4);
  // 무늬
  if (def.type === 'tabby') {
    x.strokeStyle = patt; x.lineWidth = 4; x.globalAlpha = .8;
    for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(cx + i * 9, 24); x.lineTo(cx + i * 9, 40); x.stroke(); }
    x.globalAlpha = 1;
  }
  if (def.type === 'tuxedo') {
    x.fillStyle = '#F2E8DC'; x.beginPath(); x.ellipse(cx, 86, 15, 18, 0, 0, 7); x.fill();
  }
  // 얼굴 — 졸음(sleeper)은 감은 눈, 그 외는 반쯤 감은 눈
  x.strokeStyle = OUT; x.lineWidth = 3;
  if (def.role === 'sleeper') {
    x.beginPath(); x.arc(cx - 11, 53, 5, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
    x.beginPath(); x.arc(cx + 11, 53, 5, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
    // zzz
    x.fillStyle = '#8FA89A'; x.font = '700 13px sans-serif';
    x.fillText('z', cx + 30, 40); x.font = '700 9px sans-serif'; x.fillText('z', cx + 40, 32);
  } else {
    x.beginPath(); x.arc(cx - 11, 52, 5, Math.PI * .15, Math.PI * .85); x.stroke();
    x.beginPath(); x.arc(cx + 11, 52, 5, Math.PI * .15, Math.PI * .85); x.stroke();
  }
  // 볼
  x.fillStyle = 'rgba(220,150,110,.3)';
  x.beginPath(); x.ellipse(cx - 20, 60, 7, 4, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(cx + 20, 60, 7, 4, 0, 0, 7); x.fill();
  // 코
  x.fillStyle = '#C08070';
  x.beginPath(); x.moveTo(cx, 62); x.lineTo(cx - 3, 66); x.lineTo(cx + 3, 66); x.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

// ── 드로잉 헬퍼 (컨셉 데모와 동일) ──
function ell(x, cx, cy, rx, ry, f, s, lw) {
  x.fillStyle = f; x.strokeStyle = s; x.lineWidth = lw;
  x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill(); x.stroke();
}
function circ(x, cx, cy, r, f, s, lw) {
  x.fillStyle = f; x.strokeStyle = s; x.lineWidth = lw;
  x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.stroke();
}
function ear(x, px, py, rot, f, s) {
  x.save(); x.translate(px, py); x.rotate(rot);
  x.fillStyle = f; x.strokeStyle = s; x.lineWidth = 4;
  x.beginPath(); x.moveTo(-13, 12); x.quadraticCurveTo(-3, -16, 12, 9); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#E8C0A8';
  x.beginPath(); x.moveTo(-7, 9); x.quadraticCurveTo(-1, -6, 7, 7); x.closePath(); x.fill();
  x.restore();
}
function drawItem(x, cx, item) {
  if (item === 'laptop') {
    x.fillStyle = '#5A6B7A'; x.strokeStyle = '#3A2418'; x.lineWidth = 3;
    x.beginPath(); x.rect(cx - 12, 98, 24, 14); x.fill(); x.stroke();
    x.fillStyle = '#8FA8C8'; x.fillRect(cx - 9, 100, 18, 9);
  } else if (item === 'book') {
    x.fillStyle = '#A6543E'; x.strokeStyle = '#3A2418'; x.lineWidth = 3;
    x.beginPath(); x.rect(cx - 13, 100, 26, 11); x.fill(); x.stroke();
    x.strokeStyle = '#F2E8DC'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(cx, 101); x.lineTo(cx, 110); x.stroke();
  } else if (item === 'cup') {
    x.fillStyle = '#C89A6A'; x.strokeStyle = '#3A2418'; x.lineWidth = 3;
    x.beginPath(); x.rect(cx - 8, 101, 16, 11); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(143,168,154,.7)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx - 2, 99); x.quadraticCurveTo(cx - 5, 93, cx - 2, 88); x.stroke();
  }
}
