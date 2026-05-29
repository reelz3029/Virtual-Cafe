/**
 * scenes/cafeScene.js
 * 아이소메트릭 코너뷰 카페 씬 — 레퍼런스 이미지 스타일
 * 카메라: (9,9,9) 대각선 코너뷰 / 따뜻한 앰버 벽돌 바닥 / 우측벽 카운터 / 에디슨 램프
 */

import * as THREE from 'three';
import {
  createCharacterSprite,
  createNameTag,
  createCoffeeSprite,
} from '../utils/characterRenderer.js';
import { store } from '../store/gameStore.js';

const TABLE_R         = 0.42;
const SEAT_DIST       = 0.65;
const SEATS_PER_TABLE = 4;
const ROOM            = 7;     // 반방크기 → 방 14×14
const WALL_H          = 3.4;   // 벽 높이

// 따뜻한 앰버/허니 팔레트 — 레퍼런스 이미지 기준
const C = {
  brick1:        0xD4906A,
  brick2:        0xC07A52,
  brick3:        0xCC8460,
  grout:         0x9A5C32,
  wall:          0xF5EBDB,
  wallSide:      0xECDEC8,
  wallBase:      0xD8C8A4,
  counterTop:    0xCA9660,
  counterFront:  0xA06A2A,
  counterSide:   0x8A5620,
  tableTop:      0xC48A48,
  tableLeg:      0x6A3E1A,
  chairWood:     0x7A4C22,
  chairPad:      0xD4AA72,
  windowGlass:   0xBED8F2,
  windowFrame:   0x7A5428,
  lampCord:      0x2A1A08,
  lampBulb:      0xFFE898,
  lampSocket:    0x4A3020,
  leaf1:         0x5A8840,
  leaf2:         0x3A6828,
  pot:           0xB86840,
  shelfWood:     0x9A6030,
  signDark:      0x1E0E04,
  coffeeMachine: 0x1A100A,
};

const _matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}_${JSON.stringify(opts)}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  }
  return _matCache.get(key);
}

export class CafeScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.tables = new Map();
    this.characterSprites = new Map();
    this._tableCount = 0;
    this._raycaster = new THREE.Raycaster();
    this._staffCatGroup = null;

    this._setupLights();
    this._buildInitialScene(8);
  }

  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xFFF4E0, 0.9));

    // 메인 디렉셔널 (카메라 방향에서)
    const sun = new THREE.DirectionalLight(0xFFE8C0, 1.1);
    sun.position.set(9, 14, 9);
    this.scene.add(sun);

    // 보조광 (반대쪽 약간)
    const fill = new THREE.DirectionalLight(0xF0DCC0, 0.3);
    fill.position.set(-5, 6, -5);
    this.scene.add(fill);

    // 카운터 구역 포인트라이트
    const cl = new THREE.PointLight(0xFFD080, 0.9, 8);
    cl.position.set(5.5, 3.0, -2.5);
    this.scene.add(cl);
  }

  _buildInitialScene(tableCount) {
    this._buildFloor();
    this._buildRoom();
    this._buildCounter();
    this._buildDecorations();
    this._buildTables(tableCount);
    this._tableCount = tableCount;
  }

  // ── 벽돌 바닥 ─────────────────────────────────────────────
  _buildFloor() {
    const PX = 512;
    const bwPx = 52;
    const bhPx = 26;
    const rows = Math.ceil(PX / bhPx) + 2;

    const canvas = document.createElement('canvas');
    canvas.width = PX; canvas.height = PX;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#9A5C32';
    ctx.fillRect(0, 0, PX, PX);

    const brickColors = ['#D4906A', '#C87A52', '#CC8460', '#C07050', '#D09068'];

    for (let row = 0; row < rows; row++) {
      const offset = (row % 2) * (bwPx / 2);
      const cols = Math.ceil(PX / bwPx) + 2;
      for (let col = -1; col < cols; col++) {
        const x = col * bwPx - offset;
        const y = row * bhPx;
        if (x + bwPx < 0 || x > PX) continue;
        const ci = ((row * 3) + col * 2) % brickColors.length;
        ctx.fillStyle = brickColors[Math.abs(ci)];
        ctx.fillRect(x + 1.5, y + 1.5, bwPx - 3, bhPx - 3);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    const size = ROOM * 2;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.005;
    mesh.name = 'floor';
    this.scene.add(mesh);
  }

  // ── 방 구조 (3벽 + 천장 몰딩) ─────────────────────────────
  _buildRoom() {
    // 뒷벽 (z=-ROOM) — 카메라 기준 왼쪽 위에 보임
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM * 2, WALL_H, 0.18),
      mat(C.wall)
    );
    backWall.position.set(0, WALL_H / 2, -ROOM);
    this.scene.add(backWall);

    // 오른쪽 벽 (x=+ROOM) — 카메라 기준 오른쪽 위 (카운터 쪽)
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, WALL_H, ROOM * 2),
      mat(C.wallSide)
    );
    rightWall.position.set(ROOM, WALL_H / 2, 0);
    this.scene.add(rightWall);

    // 왼쪽 벽 (x=-ROOM) — 창문 있는 쪽
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, WALL_H, ROOM * 2),
      mat(C.wallSide)
    );
    leftWall.position.set(-ROOM, WALL_H / 2, 0);
    this.scene.add(leftWall);

    // 걸레받이
    const backBase = new THREE.Mesh(new THREE.BoxGeometry(ROOM*2, 0.16, 0.24), mat(C.wallBase));
    backBase.position.set(0, 0.08, -ROOM + 0.06);
    this.scene.add(backBase);

    const rightBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, ROOM*2), mat(C.wallBase));
    rightBase.position.set(ROOM - 0.06, 0.08, 0);
    this.scene.add(rightBase);

    // 천장 몰딩
    const backCeil = new THREE.Mesh(new THREE.BoxGeometry(ROOM*2, 0.14, 0.24), mat(C.wallBase));
    backCeil.position.set(0, WALL_H - 0.07, -ROOM + 0.06);
    this.scene.add(backCeil);

    const rightCeil = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, ROOM*2), mat(C.wallBase));
    rightCeil.position.set(ROOM - 0.06, WALL_H - 0.07, 0);
    this.scene.add(rightCeil);

    this._addCoffeeSign();
    this._addWindows();
    this._addMenuBoard();
  }

  _addCoffeeSign() {
    // 뒷벽 상단 "COFFEE" 사인
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 72;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1A0A02';
    ctx.fillRect(0, 0, 256, 72);

    ctx.font = 'bold 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFE090';
    ctx.shadowColor = '#FFB030';
    ctx.shadowBlur = 10;
    ctx.fillText('COFFEE', 128, 36);

    const tex = new THREE.CanvasTexture(canvas);
    // 테두리 프레임
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.78, 0.07),
      mat(C.shelfWood)
    );
    frame.position.set(-1.0, WALL_H - 0.65, -ROOM + 0.14);
    this.scene.add(frame);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.62, 0.08),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    sign.position.set(-1.0, WALL_H - 0.65, -ROOM + 0.15);
    this.scene.add(sign);
  }

  _addWindows() {
    // 왼쪽 벽 창문 3개
    const glassMat = new THREE.MeshLambertMaterial({
      color: C.windowGlass, transparent: true, opacity: 0.72,
    });

    // 가을 야외 배경 텍스처
    const outdoorCanvas = document.createElement('canvas');
    outdoorCanvas.width = 128; outdoorCanvas.height = 160;
    const ctx = outdoorCanvas.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, 80);
    sky.addColorStop(0, '#8BBFE8');
    sky.addColorStop(1, '#D4B870');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 128, 80);
    ctx.fillStyle = '#C0A050';
    ctx.fillRect(0, 80, 128, 80);
    // 나무
    ctx.fillStyle = '#7A4A1A';
    ctx.fillRect(48, 70, 12, 90);
    ctx.fillStyle = '#D07020';
    ctx.beginPath(); ctx.arc(54, 55, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#B85C10';
    ctx.beginPath(); ctx.arc(38, 68, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E08828';
    ctx.beginPath(); ctx.arc(70, 65, 18, 0, Math.PI * 2); ctx.fill();
    const outdoorTex = new THREE.CanvasTexture(outdoorCanvas);

    [-3.8, 0, 3.8].forEach(z => {
      // 야외 장면
      const outdoor = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 2.1, 1.85),
        new THREE.MeshLambertMaterial({ map: outdoorTex })
      );
      outdoor.position.set(-ROOM - 0.04, 1.6, z);
      this.scene.add(outdoor);

      // 창틀
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 2.3, 2.05),
        mat(C.windowFrame)
      );
      frame.position.set(-ROOM, 1.6, z);
      this.scene.add(frame);

      // 유리
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 2.0, 1.75), glassMat
      );
      glass.position.set(-ROOM, 1.6, z);
      this.scene.add(glass);

      // 수평 중간 바
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 2.05), mat(C.windowFrame));
      hBar.position.set(-ROOM, 1.6, z);
      this.scene.add(hBar);
      // 수직 중간 바
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.3, 0.07), mat(C.windowFrame));
      vBar.position.set(-ROOM, 1.6, z);
      this.scene.add(vBar);
    });
  }

  _addMenuBoard() {
    // 뒷벽 오른쪽에 메뉴 칠판
    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 128; boardCanvas.height = 96;
    const ctx = boardCanvas.getContext('2d');
    ctx.fillStyle = '#0E080A';
    ctx.fillRect(0, 0, 128, 96);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MENU', 64, 18);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(220,200,160,0.9)';
    ['Espresso  ₩4,000', 'Latte  ₩5,000', 'Cappuccino  ₩5,500', '오늘의 케이크 ₩6,000'].forEach((t, i) => {
      ctx.fillText(t, 64, 36 + i * 15);
    });
    const boardTex = new THREE.CanvasTexture(boardCanvas);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.45, 0.07), mat(C.shelfWood));
    frame.position.set(4.0, 2.15, -ROOM + 0.14);
    this.scene.add(frame);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 1.28, 0.09),
      new THREE.MeshLambertMaterial({ map: boardTex })
    );
    board.position.set(4.0, 2.15, -ROOM + 0.16);
    this.scene.add(board);
  }

  // ── 카운터 (오른쪽 벽을 따라) ─────────────────────────────
  _buildCounter() {
    const cZ1 = -5.8, cZ2 = 1.2;   // z 범위
    const cLen = cZ2 - cZ1;
    const cX1 = 4.6, cX2 = 6.8;    // x 범위 (오른쪽 벽쪽)
    const cH  = 0.94;
    const cD  = cX2 - cX1;

    // 카운터 몸체
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(cD, cH, cLen),
      mat(C.counterFront)
    );
    body.position.set((cX1 + cX2) / 2, cH / 2, (cZ1 + cZ2) / 2);
    this.scene.add(body);

    // 카운터 상판 (약간 오버행)
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(cD + 0.16, 0.09, cLen + 0.1),
      mat(C.counterTop)
    );
    top.position.set((cX1 + cX2) / 2 - 0.05, cH + 0.045, (cZ1 + cZ2) / 2);
    this.scene.add(top);

    // 앞면 "COFFEE!" 텍스처
    const cfCanvas = document.createElement('canvas');
    cfCanvas.width = 512; cfCanvas.height = 64;
    const cfCtx = cfCanvas.getContext('2d');
    cfCtx.fillStyle = '#A06A2A';
    cfCtx.fillRect(0, 0, 512, 64);
    cfCtx.font = 'bold 36px Georgia, serif';
    cfCtx.fillStyle = '#F0D080';
    cfCtx.textAlign = 'center';
    cfCtx.textBaseline = 'middle';
    cfCtx.fillText('COFFEE !', 256, 34);
    const cfTex = new THREE.CanvasTexture(cfCanvas);

    const frontFace = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, cH - 0.1, cLen),
      new THREE.MeshLambertMaterial({ map: cfTex })
    );
    frontFace.position.set(cX1 + 0.03, cH / 2, (cZ1 + cZ2) / 2);
    this.scene.add(frontFace);

    // 내부 물건들
    this._buildCoffeeMachine(cX1 + cD * 0.6, cH, cZ1 + 1.4);
    this._addCupStack(cX1 + 0.6, cH + 0.09, cZ1 + 3.2);
    this._addCounterPlant(cX1 + 0.5, cH + 0.09, cZ1 + 4.8);

    // 전시 선반 (카운터 끝쪽)
    this._buildDisplayShelf(cX1, cX2, cZ2);

    // 바 스툴
    this._addBarStools(cX1, cZ1, cLen);

    // 직원 고양이
    this._addStaffCat((cX1 + cX2) / 2 + 0.3, cH, cZ1 + 1.8);
  }

  _buildCoffeeMachine(x, baseY, z) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.44, 0.38), mat(C.coffeeMachine)
    );
    body.position.set(x, baseY + 0.22, z);
    this.scene.add(body);

    // 스팀 완드
    const wand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.32, 6), mat(0x909090)
    );
    wand.position.set(x + 0.32, baseY + 0.3, z);
    wand.rotation.z = 0.4;
    this.scene.add(wand);

    // 트레이
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.02, 0.3), mat(0x808080)
    );
    tray.position.set(x, baseY + 0.01, z);
    this.scene.add(tray);
  }

  _addCupStack(x, baseY, z) {
    [0xF0E0D0, 0xEAD8C8, 0xF2E4D4].forEach((col, i) => {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.055, 0.1, 8), mat(col)
      );
      cup.position.set(x, baseY + 0.05 + i * 0.09, z);
      this.scene.add(cup);
    });
  }

  _addCounterPlant(x, baseY, z) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.08, 0.14, 8), mat(C.pot)
    );
    pot.position.set(x, baseY + 0.07, z);
    this.scene.add(pot);

    [0, 1, 2, 3].forEach(i => {
      const ang = (i / 4) * Math.PI * 2;
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 5, 4), mat(i % 2 ? C.leaf1 : C.leaf2)
      );
      leaf.position.set(x + Math.cos(ang) * 0.08, baseY + 0.22, z + Math.sin(ang) * 0.08);
      this.scene.add(leaf);
    });
  }

  _buildDisplayShelf(cX1, cX2, cZ2) {
    const sH = 1.6, sD = cX2 - cX1, sW = 1.3;
    const shelfX = (cX1 + cX2) / 2;

    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(sD + 0.14, sH, sW),
      mat(C.shelfWood)
    );
    shelf.position.set(shelfX, sH / 2, cZ2 + sW / 2 + 0.05);
    this.scene.add(shelf);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, sH - 0.18, sW - 0.12),
      new THREE.MeshLambertMaterial({ color: C.windowGlass, transparent: true, opacity: 0.6 })
    );
    glass.position.set(cX1 - 0.04, sH / 2, cZ2 + sW / 2 + 0.05);
    this.scene.add(glass);

    // 선반 위 소품
    [0xD04040, 0x4060D0, 0x48A868, 0xE8A040, 0xC04080].forEach((col, i) => {
      const item = new THREE.Mesh(
        new THREE.BoxGeometry(0.1 + (i%2)*0.05, 0.14 + (i%3)*0.07, 0.09),
        mat(col)
      );
      item.position.set(
        cX1 + 0.3 + (i % 3) * 0.42,
        0.25 + Math.floor(i / 3) * 0.58,
        cZ2 + 0.18 + (i % 2) * 0.55
      );
      this.scene.add(item);
    });
  }

  _addBarStools(counterX, counterZ1, counterLen) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const z = counterZ1 + 0.9 + (i / (n - 1)) * (counterLen - 1.8);
      const x = counterX - 0.58;

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.03, 0.64, 6), mat(C.chairWood)
      );
      pole.position.set(x, 0.32, z);
      this.scene.add(pole);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.02, 5, 14), mat(C.chairWood)
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.26, z);
      this.scene.add(ring);

      const seat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.17, 0.06, 14), mat(C.chairPad)
      );
      seat.position.set(x, 0.67, z);
      this.scene.add(seat);
    }
  }

  _addStaffCat(x, _baseY, z) {
    const group = new THREE.Group();
    group.name = 'staff-cat';

    const sprite = createCharacterSprite(
      { bodyColor: '#F0E8D8', accessories: ['apron'] },
      '바리스타'
    );
    sprite.scale.set(0.65, 0.85, 1);
    sprite.position.y = 0.46;
    group.add(sprite);

    const nameTag = createNameTag('바리스타', false);
    nameTag.position.y = 1.08;
    group.add(nameTag);

    group.position.set(x, 0, z);
    this.scene.add(group);
    this._staffCatGroup = group;
  }

  // ── 에디슨 전구 + 장식 ─────────────────────────────────────
  _buildDecorations() {
    // 에디슨 전구 펜던트 (6개)
    [
      [-3.5, -4.0, 0.72],
      [ 0.0, -4.5, 0.65],
      [ 3.0, -2.5, 0.78],
      [-2.5,  0.5, 0.68],
      [ 0.5,  2.0, 0.74],
      [-1.5,  5.0, 0.70],
    ].forEach(([x, z, cordLen]) => this._addEdisonLamp(x, z, cordLen));

    // 바닥 화분
    this._addFloorPlant(-6.0, -5.8);
    this._addFloorPlant(-5.5,  4.5);
    this._addTallPlant(-6.0,  5.5);

    // A프레임 SALE 사인
    this._addAFrameSign(3.2, 0.8);
  }

  _addEdisonLamp(x, z, cordLen = 0.7) {
    const ceilY = WALL_H;

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, cordLen, 4),
      mat(C.lampCord)
    );
    cord.position.set(x, ceilY - cordLen / 2, z);
    this.scene.add(cord);

    const socket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.030, 0.065, 8),
      mat(C.lampSocket)
    );
    socket.position.set(x, ceilY - cordLen - 0.032, z);
    this.scene.add(socket);

    // 전구 (구체 + 목 부분)
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.082, 8, 8),
      new THREE.MeshLambertMaterial({
        color: C.lampBulb,
        emissive: 0xFFD040,
        emissiveIntensity: 0.55,
      })
    );
    bulb.position.set(x, ceilY - cordLen - 0.12, z);
    this.scene.add(bulb);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.038, 0.065, 6),
      mat(C.lampBulb)
    );
    neck.position.set(x, ceilY - cordLen - 0.185, z);
    this.scene.add(neck);

    const light = new THREE.PointLight(0xFFD870, 0.5, 4.8);
    light.position.set(x, ceilY - cordLen - 0.14, z);
    this.scene.add(light);
  }

  _addFloorPlant(x, z) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.17, 0.38, 10), mat(C.pot)
    );
    pot.position.set(x, 0.19, z);
    this.scene.add(pot);

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const r = 0.08 + (i % 3) * 0.05;
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.13 + (i % 2) * 0.05, 6, 5),
        mat(i % 2 ? C.leaf1 : C.leaf2)
      );
      leaf.position.set(x + Math.cos(ang) * r, 0.66 + (i % 3) * 0.13, z + Math.sin(ang) * r);
      this.scene.add(leaf);
    }
  }

  _addTallPlant(x, z) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.22, 0.46, 10), mat(C.pot)
    );
    pot.position.set(x, 0.23, z);
    this.scene.add(pot);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 1.2, 6), mat(C.leaf2)
    );
    stem.position.set(x, 0.86, z);
    this.scene.add(stem);

    [[0, 0], [0.22, 0.08], [-0.22, 0.08], [0, 0.22]].forEach(([lx, lz]) => {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.20, 6, 5), mat(C.leaf1)
      );
      leaf.position.set(x + lx, 1.6, z + lz);
      this.scene.add(leaf);
    });
  }

  _addAFrameSign(x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#100808';
    ctx.fillRect(0, 0, 64, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SALE', 32, 30);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#C0B090';
    ctx.fillText('today!', 32, 50);
    const tex = new THREE.CanvasTexture(canvas);

    const signH = 0.72, signW = 0.52;
    [-0.12, 0.12].forEach((dx, idx) => {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, signH, signW),
        idx === 0 ? new THREE.MeshLambertMaterial({ map: tex }) : mat(C.signDark)
      );
      panel.position.set(x + dx, signH / 2, z);
      panel.rotation.y = dx > 0 ? -0.2 : 0.2;
      this.scene.add(panel);
    });
  }

  // ── 테이블 배치 ──────────────────────────────────────────
  _buildTables(count) {
    const positions = this._generateTablePositions(count);
    positions.forEach((pos, i) => {
      this._createTable(`table_${i}`, pos.x, pos.z, SEATS_PER_TABLE);
    });
  }

  _generateTablePositions(count) {
    const positions = [
      { x: -3.5, z: -3.2 },
      { x: -0.4, z: -4.6 },
      { x: -4.6, z:  0.8 },
      { x: -1.4, z:  0.4 },
      { x: -4.2, z:  4.6 },
      { x: -1.2, z:  4.0 },
      { x:  1.6, z:  3.4 },
      { x: -2.6, z: -1.8 },
    ];
    return positions.slice(0, count);
  }

  _createTable(tableId, x, z, seatCount = SEATS_PER_TABLE) {
    const group = new THREE.Group();
    group.name = tableId;
    group.position.set(x, 0, z);

    // 중심 폴
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 0.72, 8), mat(C.tableLeg)
    );
    leg.position.y = 0.36;
    group.add(leg);

    // 받침 디스크
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), mat(C.tableLeg)
    );
    base.position.y = 0.02;
    group.add(base);

    // 상판
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.06, 24),
      mat(C.tableTop)
    );
    top.position.y = 0.74;
    top.userData.tableId = tableId;
    group.add(top);

    // 테두리 링
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_R, 0.022, 6, 24), mat(C.tableLeg)
    );
    rim.position.y = 0.74;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    // 테이블 위 컵 (확률적으로)
    if ((x + z * 1.3) % 2.2 > 1.0) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.04, 0.09, 8), mat(0xE8D4B8)
      );
      cup.position.set(0.1, 0.79, 0.08);
      group.add(cup);
    }

    // 의자
    const seats = [];
    for (let i = 0; i < seatCount; i++) {
      const angle = (i / seatCount) * Math.PI * 2 + Math.PI / 4;
      group.add(this._createChair(angle));
      seats.push({
        angle,
        worldX: x + Math.cos(angle) * SEAT_DIST,
        worldZ: z + Math.sin(angle) * SEAT_DIST,
        occupied: false,
      });
    }

    this.scene.add(group);
    this.tables.set(tableId, { group, seats, position: { x, z }, seatCount });
    return { group, seats };
  }

  _createChair(angle) {
    const group = new THREE.Group();
    group.position.set(Math.cos(angle) * SEAT_DIST, 0, Math.sin(angle) * SEAT_DIST);
    group.rotation.y = angle + Math.PI;

    // 방석
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.16, 0.05, 12), mat(C.chairPad)
    );
    seat.position.y = 0.44;
    group.add(seat);

    // 등받이 (두 기둥 + 상단 바)
    const bL = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 6), mat(C.chairWood));
    bL.position.set(-0.1, 0.67, -0.14);
    group.add(bL);
    const bR = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 6), mat(C.chairWood));
    bR.position.set(0.1, 0.67, -0.14);
    group.add(bR);
    const bTop = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.04), mat(C.chairWood));
    bTop.position.set(0, 0.88, -0.14);
    group.add(bTop);

    // 4 다리
    [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]].forEach(([lx, lz]) => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 6), mat(C.chairWood));
      l.position.set(lx, 0.21, lz);
      group.add(l);
    });

    return group;
  }

  // ── 캐릭터 관리 ──────────────────────────────────────────
  updateCharacter(userInfo) {
    const { id, username, avatar, tableId, seatIndex, isMe, heldCoffee } = userInfo;
    const pos = this._resolvePosition(tableId, seatIndex, id);
    const existing = this.characterSprites.get(id);

    if (existing) {
      const p = existing.group.position;
      const avatarKey = avatar ? `${avatar.bodyColor}_${(avatar.accessories||[]).sort().join(',')}` : '';
      if (
        Math.abs(p.x - pos.x) < 0.001 &&
        Math.abs(p.z - pos.z) < 0.001 &&
        existing.avatarKey === avatarKey
      ) return;
      this._disposeCharacterGroup(existing.group);
    }

    if (!avatar) return;

    const group = new THREE.Group();
    const sprite = createCharacterSprite(avatar, username);
    sprite.position.y = 0.45;
    group.add(sprite);

    const nameTag = createNameTag(username, isMe);
    nameTag.position.y = 1.08;
    group.add(nameTag);

    if (heldCoffee) {
      const coffeeSprite = createCoffeeSprite(heldCoffee.emoji);
      coffeeSprite.position.set(0.28, 0.58, 0);
      group.add(coffeeSprite);
    }

    if (isMe) {
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.32, 16),
        new THREE.MeshBasicMaterial({ color: 0xFFD080, transparent: true, opacity: 0.22, depthWrite: false })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.01;
      group.add(glow);
    }

    group.position.set(pos.x, 0, pos.z);
    group.userData.userId = id;
    this.scene.add(group);

    const avatarKey = `${avatar.bodyColor}_${(avatar.accessories||[]).sort().join(',')}`;
    this.characterSprites.set(id, { group, sprite, nameTag, avatarKey });
  }

  removeCharacter(userId) {
    const existing = this.characterSprites.get(userId);
    if (!existing) return;
    this._disposeCharacterGroup(existing.group);
    this.characterSprites.delete(userId);
  }

  _disposeCharacterGroup(group) {
    this.scene.remove(group);
    group.traverse(obj => {
      obj.geometry?.dispose();
      if (obj.material && !obj.isSprite) obj.material.dispose();
    });
  }

  _resolvePosition(tableId, seatIndex, userId = '') {
    if (tableId) {
      const tableData = this.tables.get(tableId);
      if (tableData) {
        const seat = tableData.seats[seatIndex ?? 0];
        if (seat) return { x: seat.worldX, z: seat.worldZ };
        return tableData.position;
      }
    }
    const hash = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const slots = [
      { x: -4.0, z: 6.2 }, { x: -2.8, z: 6.5 }, { x: -5.2, z: 6.0 },
      { x: -1.8, z: 6.2 }, { x: -5.5, z: 5.2 }, { x: -3.4, z: 5.5 },
      { x: -0.8, z: 6.5 }, { x: -4.5, z: 6.8 }, { x: -2.2, z: 6.8 },
    ];
    return slots[hash % slots.length];
  }

  getCharacterGroups() {
    return [...this.characterSprites.values()].map(c => c.group);
  }

  getRaycastTargets() {
    const targets = [];
    this.tables.forEach(data => {
      data.group.children.forEach(child => {
        if (child.userData.tableId) targets.push(child);
      });
    });
    return targets;
  }

  update(_camera, _delta) {
    const time = performance.now() * 0.001;
    const { auth } = store.getState();
    const myId = auth.user?.id;

    this.characterSprites.forEach(({ sprite }, id) => {
      if (id === myId) sprite.position.y = 0.45 + Math.sin(time * 1.6) * 0.03;
    });

    if (this._staffCatGroup) {
      const sprite = this._staffCatGroup.children[0];
      if (sprite?.isSprite) sprite.position.y = 0.46 + Math.sin(time * 1.3) * 0.025;
    }
  }

  expandTables(newCount) {
    if (newCount <= this._tableCount) return;
    const positions = this._generateTablePositions(newCount);
    for (let i = this._tableCount; i < newCount; i++) {
      if (positions[i]) this._createTable(`table_${i}`, positions[i].x, positions[i].z, SEATS_PER_TABLE);
    }
    this._tableCount = newCount;
  }

  dispose() {
    this.scene.traverse(obj => {
      obj.geometry?.dispose();
      if (obj.material && !obj.isSprite) {
        Array.isArray(obj.material)
          ? obj.material.forEach(m => m.dispose())
          : obj.material.dispose();
      }
    });
    this.tables.clear();
    this.characterSprites.clear();
    _matCache.clear();
  }
}
