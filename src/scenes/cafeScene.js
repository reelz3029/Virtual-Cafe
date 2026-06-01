/**
 * scenes/cafeScene.js
 * 닫힌 아늑한 스터디 카페 — 2층 창가 컨셉 (단면 인형의 집 구조)
 *
 * 컨셉 변경: 무한 타일 → 정원이 정해진 한 "룸 인스턴스"
 *   · 8 테이블 × 4 좌석 = 32명 정원 (룸 샤딩은 multiplayerSim/roomAllocator 담당)
 *   · 닫힌 공간(벽·천장·창)으로 아늑함 확보
 *   · 황혼 햇살 + 펜던트 조명 + 떠다니는 먼지 + 분위기용 NPC 고양이
 *
 * 카메라: (target+9,9,target+9) 직교 코너뷰 — gridSpan=null 이라 무한랩 비활성
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createCharacterSprite,
  createNameTag,
  createCoffeeSprite,
} from '../utils/characterRenderer.js';
import { store } from '../store/gameStore.js';
import { NpcBuffer } from '../systems/npcBuffer.js';
import { tableCountForRoom } from '../systems/roomAllocator.js';

// ── 룸 치수 ────────────────────────────────────────────────
const ROOM_HALF   = 8;     // 바닥 반폭 (x,z ∈ [-8, 8])
const WALL_H      = 9;     // 벽 높이
const SEATS_PER_TABLE = 4;
const TABLE_R     = 0.52;
const SEAT_DIST   = 0.82;

// 카메라 팬 범위 — 룸 안에서만 (worldRenderer가 사용)
const PAN_LIMIT   = 4.5;

// 테이블 후보 위치 — 앞쪽 N개만 사용(정원=ROOM_CONFIG.capacity 기준).
// 앞 4개가 2×2를 이루도록 정렬 (정원이 작아도 균형 있게 보이게)
const TABLE_SPOTS = [
  { x: -3.5, z: 0.0 }, { x: 1.0, z: 0.0 },
  { x: -3.5, z: 4.0 }, { x: 1.0, z: 4.0 },
  { x: 4.5, z: 0.0 }, { x: 4.5, z: 4.0 },
  { x: -1.5, z: -2.4 }, { x: 2.5, z: -2.4 },
];

// ── 따뜻한 클래식 우디 카페 팔레트 (황혼) ────────────────────
const C = {
  floor1:     0xC9A06A,  // 밝은 마룻널
  floor2:     0xB8895C,  // 어두운 마룻널
  seam:       0x8A6038,  // 널 이음새
  wall:       0xD9B98C,  // 좌벽 (창측)
  wallBack:   0xCBA877,  // 뒷벽
  ceiling:    0x8B6B4A,
  beam:       0x5A3E28,  // 천장 보
  windowGlow: 0xFFCB85,  // 창으로 드는 황혼빛
  windowFrame:0x4A3320,
  shelf:      0x6B4A2E,  // 책장
  shelfBoard: 0x4A3320,
  book:       [0xA6543E, 0x7B8B5A, 0xC98A4A, 0x4A6B7A, 0xB5705A, 0x9A8C6E, 0xC9A35C],
  counter:    0x6B4A2E,
  counterTop: 0x4A3320,
  tableTop:   0xD9B381,
  tableLeg:   0x5A3E28,
  chairWood:  0x6B4A2E,
  chairPad:   0xC4885A,
  pot:        0xA86844,
  leaf:       0x7A8B5A,
  pendantShade: 0xC89A6A,
  pendantBulb:  0xFFE3A8,
  rugA:       0xA6543E,
  rugB:       0xC4885A,
};

// 좌석 쿠션 — 어시 톤 순환
const PAD_PALETTE = [0xB5705A, 0x9A8C6E, 0xC9A678, 0xA6543E];

// ── 재질 캐시 (MeshLambertMaterial) ────────────────────────
const _matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}_${JSON.stringify(opts)}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  }
  return _matCache.get(key);
}

// ── CafeScene 클래스 ───────────────────────────────────────
export class CafeScene {
  constructor() {
    this.scene            = new THREE.Scene();
    this.tables           = new Map();
    this.characterSprites = new Map();
    this._tableCount      = 0;
    this._dust            = null;
    this._pendantLights   = [];

    this._setupLights();
    this._buildRoom();
    this._buildCounter();
    this._buildTables();

    // 빈 방 완충용 NPC 고양이 (npcBuffer) — 실제 인원 적을 때만 표시
    this._npc = new NpcBuffer(this.scene);
    this._npc.spawn();

    // 컬링 비활성 + 그림자 캐스트/리시브 일괄 설정 (작은 룸이라 비용 적음)
    this.scene.traverse(obj => {
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      obj.castShadow = true;
      obj.receiveShadow = true;
    });
  }

  get tableCount() { return this._tableCount; }
  get gridSpan()   { return null; }              // 무한랩 비활성 (닫힌 룸)
  get panLimit()   { return PAN_LIMIT; }         // 카메라 팬 클램프 범위

  // ── 조명: 황혼 햇살 인테리어 ──────────────────────────────
  _setupLights() {
    this.scene.children
      .filter(o => o.isLight)
      .forEach(l => this.scene.remove(l));

    // 황혼 배경 + 따뜻한 안개
    this.scene.background = new THREE.Color(0x3A2418);
    this.scene.fog = new THREE.Fog(0x3A2418, 24, 56);

    // 앰비언트 (황혼) — 사양서값
    this.scene.add(new THREE.AmbientLight(0xFFE0B0, 0.55));

    // 메인: 창으로 낮게 드는 황혼빛 — 그림자 ON
    const sun = new THREE.DirectionalLight(0xFF9D4D, 2.4);
    sun.position.set(-14, 9, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far  = 60;
    sun.shadow.camera.left   = -ROOM_HALF - 3;
    sun.shadow.camera.right  =  ROOM_HALF + 3;
    sun.shadow.camera.top    =  ROOM_HALF + 3;
    sun.shadow.camera.bottom = -ROOM_HALF - 3;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    // 실내 따뜻한 보조 포인트
    const warmFill = new THREE.PointLight(0xFFB860, 1.3, 30);
    warmFill.position.set(3, 6, 2);
    this.scene.add(warmFill);
  }

  // ── 룸 구조: 바닥 + 벽 2면 + 천장 보 + 창 + 책장 + 먼지 ─────
  _buildRoom() {
    // 바닥 — 우드 널 체커 (유한)
    const floorTex = this._makeFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2),
      new THREE.MeshLambertMaterial({ map: floorTex })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // 러그 두 장 (아늑함)
    [[-3, 0.5, C.rugA], [1.5, 4, C.rugB]].forEach(([rx, rz, col]) => {
      const rug = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 0.02, 2.2), mat(col)
      );
      rug.position.set(rx, 0.012, rz);
      this.scene.add(rug);
    });

    // 뒷벽 (z = -ROOM_HALF, x축)
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_HALF * 2, WALL_H, 0.4), mat(C.wallBack)
    );
    backWall.position.set(0, WALL_H / 2, -ROOM_HALF);
    this.scene.add(backWall);

    // 좌벽 (x = -ROOM_HALF, z축)
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, WALL_H, ROOM_HALF * 2), mat(C.wall)
    );
    leftWall.position.set(-ROOM_HALF, WALL_H / 2, 0);
    this.scene.add(leftWall);

    // 천장 보 — 다락 느낌
    for (let i = 0; i < 5; i++) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(ROOM_HALF * 2, 0.4, 0.45), mat(C.beam)
      );
      beam.position.set(0, WALL_H - 0.5, -ROOM_HALF + 1.8 + i * 3.2);
      this.scene.add(beam);
    }

    // 큰 창 (좌벽) — 황혼빛 발광면 + 창틀
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 5),
      new THREE.MeshBasicMaterial({ color: C.windowGlow })
    );
    glow.rotation.y = Math.PI / 2;
    glow.position.set(-ROOM_HALF + 0.25, 4.4, 1.5);
    this.scene.add(glow);
    // 창틀 격자
    const fm = mat(C.windowFrame);
    const frameSpecs = [
      [0.30, 5.4, 0.30, 4.4, -1.0], [0.30, 5.4, 0.30, 4.4, 4.0],   // 세로
      [0.30, 0.30, 8.4, 6.6, 1.5], [0.30, 0.30, 8.4, 2.2, 1.5],     // 가로
      [0.30, 5.4, 0.30, 4.4, 1.5],                                  // 중앙 세로
    ];
    frameSpecs.forEach(([w, h, d, y, z]) => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fm);
      f.position.set(-ROOM_HALF + 0.32, y, z);
      this.scene.add(f);
    });

    // 책장 2개 (뒷벽)
    this._buildBookshelf(-4.5);
    this._buildBookshelf(0.0);

    // 떠다니는 먼지 — 황혼빛 속 파티클
    this._buildDust();
  }

  _makeFloorTexture() {
    const sz = 512, plankH = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = sz;
    const ctx = cv.getContext('2d');
    const shades = ['#C9A06A', '#B8895C', '#C2986040', '#BD9264'];
    const rows = Math.ceil(sz / plankH);
    for (let r = 0; r < rows; r++) {
      const y = r * plankH;
      const off = (r % 2) * (sz / 4);
      const segW = sz / 2;
      for (let s = -1; s <= 2; s++) {
        const x = s * segW + off;
        ctx.fillStyle = (r + s) % 2 ? '#B8895C' : '#C9A06A';
        ctx.fillRect(x, y, segW, plankH);
        ctx.strokeStyle = 'rgba(90,60,35,0.07)';
        ctx.lineWidth = 1;
        for (let g = 8; g < plankH; g += 12) {
          ctx.beginPath(); ctx.moveTo(x, y + g); ctx.lineTo(x + segW, y + g); ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = '#8A6038';
    ctx.lineWidth = 1.5;
    for (let r = 0; r <= rows; r++) {
      const y = r * plankH;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(sz, y); ctx.stroke();
      const off = (r % 2) * (sz / 4), segW = sz / 2;
      for (let s = 0; s <= 2; s++) {
        const x = s * segW + off;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + plankH); ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    return tex;
  }

  _buildBookshelf(px) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 6, 0.9), mat(C.shelf));
    frame.position.y = 3;
    g.add(frame);
    for (let row = 0; row < 4; row++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.95), mat(C.shelfBoard));
      board.position.set(0, 1 + row * 1.4, 0);
      g.add(board);
      let bx = -1.45;
      let seed = Math.abs(Math.round(px * 31 + row * 17));
      while (bx < 1.3) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const h = 0.7 + (seed % 50) / 100;
        const w = 0.15 + (seed % 12) / 100;
        const bk = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, 0.6),
          mat(C.book[seed % C.book.length])
        );
        bk.position.set(bx + w / 2, 1 + row * 1.4 + 0.06 + h / 2, 0);
        g.add(bk);
        bx += w + 0.02;
      }
    }
    g.position.set(px, 0, -ROOM_HALF + 0.7);
    this.scene.add(g);
  }

  _buildDust() {
    const N = 110;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * ROOM_HALF * 2;
      pos[i * 3 + 1] = Math.random() * WALL_H;
      pos[i * 3 + 2] = (Math.random() - 0.5) * ROOM_HALF * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xFFD9A0, size: 0.06, transparent: true, opacity: 0.55,
      depthWrite: false,
    }));
    this._dust.frustumCulled = false;
    this.scene.add(this._dust);
  }

  // ── 카운터 + 에스프레소 머신 + 펜던트 ─────────────────────
  _buildCounter() {
    const counter = new THREE.Group();
    const cH = 1.0;
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, cH, 1.5), mat(C.counter));
    body.position.y = cH / 2;
    counter.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.18, 1.8), mat(C.counterTop));
    top.position.y = cH + 0.09;
    counter.add(top);
    counter.position.set(4.0, 0, -6.0);
    this.scene.add(counter);
    this._counterPos = { x: 4.0, y: cH, z: -6.0 };

    // GLB 에스프레소 머신 (카운터 위)
    this._buildCoffeeMachine(3.2, cH + 0.1, -6.0, '/models/CoffeeMachine_Ragular.glb', 0.5);
    this._buildCoffeeMachine(4.6, cH + 0.1, -6.0, '/models/CoffeeMacnine_Small.glb', 0.4);

    // 펜던트 조명 3개 — 실제 PointLight 연결
    this._buildPendant(-3, 0.5);
    this._buildPendant(1.5, 2);
    this._buildPendant(4.0, -5.5);
  }

  _buildPendant(px, pz) {
    const g = new THREE.Group();
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 2.2, 5), mat(0x2A1C12)
    );
    wire.position.y = WALL_H - 1.3;
    g.add(wire);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.65, 14, 1, true), mat(C.pendantShade)
    );
    shade.position.y = WALL_H - 2.5;
    g.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: C.pendantBulb })
    );
    bulb.position.y = WALL_H - 2.65;
    g.add(bulb);
    const light = new THREE.PointLight(0xFFCB7A, 0.9, 12);
    light.position.y = WALL_H - 2.8;
    g.add(light);
    this._pendantLights.push(light);
    g.position.set(px, 0, pz);
    this.scene.add(g);
  }

  // ── GLB 에스프레소 머신 (세이지-스틸) ─────────────────────
  _buildCoffeeMachine(x, baseY, z, modelPath, targetHeight = 0.42) {
    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
      const model = gltf.scene;
      model.traverse(child => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const newMats = mats.map(m => {
          if (m.name && /grid/i.test(m.name)) {
            return new THREE.MeshLambertMaterial({
              color: new THREE.Color(0xA8C8B8),
              map: this._getDrainGridTexture(),
            });
          }
          const hsl = { h: 0, s: 0, l: 0 };
          (m.color ?? new THREE.Color(0.5, 0.5, 0.5)).getHSL(hsl);
          let color;
          if (hsl.l > 0.65)       color = new THREE.Color(0xC8C4BC);
          else if (hsl.l > 0.35)  color = new THREE.Color(0x8FA89A);
          else                    color = new THREE.Color(0x5E7366);
          return new THREE.MeshLambertMaterial({ color });
        });
        child.material = Array.isArray(child.material) ? newMats : newMats[0];
      });
      const box = new THREE.Box3().setFromObject(model);
      const modelH = box.getSize(new THREE.Vector3()).y;
      if (modelH > 0) model.scale.setScalar(targetHeight / modelH);
      const box2 = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      box2.getCenter(center);
      model.position.set(x - center.x, baseY - box2.min.y, z - center.z);
      model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      this.scene.add(model);
    }, undefined, () => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.36), mat(0x8FA89A));
      body.position.set(x, baseY + 0.22, z);
      this.scene.add(body);
    });
  }

  _getDrainGridTexture() {
    if (this._drainGridTex) return this._drainGridTex;
    const SIZE = 256, CELL = 20, BAR = 4;
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#1A2420';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y += CELL) {
      const grad = ctx.createLinearGradient(0, y, 0, y + BAR);
      grad.addColorStop(0, '#C8C4BC'); grad.addColorStop(0.4, '#8FA89A'); grad.addColorStop(1, '#3A4A42');
      ctx.fillStyle = grad; ctx.fillRect(0, y, SIZE, BAR);
    }
    for (let x = 0; x < SIZE; x += CELL) {
      const grad = ctx.createLinearGradient(x, 0, x + BAR, 0);
      grad.addColorStop(0, '#C8C4BC'); grad.addColorStop(0.4, '#8FA89A'); grad.addColorStop(1, '#3A4A42');
      ctx.fillStyle = grad; ctx.fillRect(x, 0, BAR, SIZE);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this._drainGridTex = tex;
    return tex;
  }

  // ── 테이블 8개 고정 배치 ──────────────────────────────────
  _buildTables() {
    // 정원(ROOM_CONFIG.capacity)에서 산출한 테이블 수만큼만 배치
    const count = Math.min(tableCountForRoom(), TABLE_SPOTS.length);
    for (let i = 0; i < count; i++) {
      const spot = TABLE_SPOTS[i];
      const padCol = PAD_PALETTE[i % PAD_PALETTE.length];
      this._createTable(`table_${i}`, spot.x, spot.z, SEATS_PER_TABLE, padCol);
    }
    this._tableCount = count;
  }

  _createTable(tableId, x, z, seatCount = SEATS_PER_TABLE, padColor = C.chairPad) {
    const group = new THREE.Group();
    group.name = tableId;

    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.74, 8), mat(C.tableLeg)
    );
    leg.position.y = 0.37; group.add(leg);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.04, 12), mat(C.tableLeg)
    );
    base.position.y = 0.02; group.add(base);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.07, 24), mat(C.tableTop)
    );
    top.position.y = 0.76;
    top.userData.tableId = tableId;
    group.add(top);

    // 카툰 평면 그림자
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 18),
      new THREE.MeshBasicMaterial({ color: 0x6A4A30, transparent: true, opacity: 0.16, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    group.add(shadow);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_R, 0.026, 6, 24), mat(C.tableLeg)
    );
    rim.position.y = 0.76; rim.rotation.x = Math.PI / 2;
    group.add(rim);

    // 테이블 위 소품 — 머그 + 작은 화분
    const h = Math.abs(Math.round(x * 17 + z * 31)) % 4;
    const mugCol = [0xC89A6A, 0xB5705A, 0xA6794E, 0xC9A678][h];
    const mug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.042, 0.095, 10), mat(mugCol)
    );
    mug.position.set(0.17, 0.815, 0.07); group.add(mug);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.028, 0.008, 5, 10, Math.PI), mat(mugCol)
    );
    handle.position.set(0.218, 0.815, 0.07); handle.rotation.x = Math.PI / 2;
    group.add(handle);
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.04, 0.09, 8), mat(C.pot)
    );
    pot.position.set(-0.16, 0.81, -0.07); group.add(pot);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(C.leaf));
    leaf.position.set(-0.16, 0.91, -0.07); group.add(leaf);

    const seats = [];
    for (let i = 0; i < seatCount; i++) {
      const angle = (i / seatCount) * Math.PI * 2 + Math.PI / 4;
      group.add(this._createChair(angle, padColor));
      seats.push({
        angle,
        worldX: x + Math.cos(angle) * SEAT_DIST,
        worldZ: z + Math.sin(angle) * SEAT_DIST,
        occupied: false,
      });
    }

    group.position.set(x, 0, z);
    this.scene.add(group);
    this.tables.set(tableId, { group, seats, position: { x, z }, seatCount });
    return { group, seats };
  }

  _createChair(angle, padColor = C.chairPad) {
    const group = new THREE.Group();
    group.position.set(Math.cos(angle) * SEAT_DIST, 0, Math.sin(angle) * SEAT_DIST);
    group.rotation.y = angle + Math.PI;

    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.20, 0.06, 12), mat(padColor)
    );
    seat.position.y = 0.45; group.add(seat);

    const bL = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6), mat(C.chairWood));
    bL.position.set(-0.11, 0.69, -0.16); group.add(bL);
    const bR = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6), mat(C.chairWood));
    bR.position.set(0.11, 0.69, -0.16); group.add(bR);
    const bTop = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.05), mat(C.chairWood));
    bTop.position.set(0, 0.91, -0.16); group.add(bTop);

    [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]].forEach(([lx, lz]) => {
      const l = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.44, 6), mat(C.chairWood)
      );
      l.position.set(lx, 0.22, lz);
      group.add(l);
    });
    return group;
  }

  // ── 무한랩 비활성 (닫힌 룸) — 호출돼도 아무것도 안 함 ───────
  updateTiles() { /* 닫힌 룸: 타일 랩핑 없음 */ }

  // ── 캐릭터 관리 (멀티플레이어 — 기존 그대로) ───────────────
  updateCharacter(userInfo) {
    const { id, username, avatar, tableId, seatIndex, isMe, heldCoffee } = userInfo;
    const pos      = this._resolvePosition(tableId, seatIndex, id);
    const existing = this.characterSprites.get(id);

    if (existing) {
      const p = existing.group.position;
      const avatarKey = avatar ? `${avatar.bodyColor}_${(avatar.accessories || []).sort().join(',')}` : '';
      if (
        Math.abs(p.x - pos.x) < 0.001 &&
        Math.abs(p.z - pos.z) < 0.001 &&
        existing.avatarKey === avatarKey
      ) return;
      this._disposeCharacterGroup(existing.group);
    }

    if (!avatar) return;

    const group  = new THREE.Group();
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

    group.traverse(obj => { if (obj.isSprite) obj.frustumCulled = false; });

    group.position.set(pos.x, 0, pos.z);
    group.userData.userId = id;
    this.scene.add(group);

    const avatarKey = `${avatar.bodyColor}_${(avatar.accessories || []).sort().join(',')}`;
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
    // 테이블 없으면 카운터 앞 대기열
    const hash = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const slots = [
      { x: 1.5, z: -4.5 }, { x: 2.5, z: -4.2 }, { x: 0.5, z: -4.2 },
      { x: -0.5, z: -4.5 }, { x: 3.0, z: -3.8 },
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

    // 내 캐릭터 부유
    this.characterSprites.forEach(({ sprite }, id) => {
      if (id === myId) sprite.position.y = 0.45 + Math.sin(time * 1.6) * 0.03;
    });

    // 빈 방 완충 NPC — 실제 인원수에 따라 표시 개수 조절 + 애니메이션
    if (this._npc) {
      this._npc.updateByOccupancy(store.getState().onlineUsers.length);
      this._npc.update(time);
    }

    // 먼지 천천히 상승
    if (this._dust) {
      const arr = this._dust.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += 0.004;
        if (arr[i + 1] > WALL_H) arr[i + 1] = 0;
      }
      this._dust.geometry.attributes.position.needsUpdate = true;
    }
  }

  // 룸은 정원 고정 — 동적 확장 없음 (룸 샤딩이 담당)
  expandTables() { /* no-op: 룸 정원 고정 */ }

  dispose() {
    this.scene.traverse(obj => {
      obj.geometry?.dispose();
      if (obj.material && !obj.isSprite) {
        Array.isArray(obj.material)
          ? obj.material.forEach(m => m.dispose())
          : obj.material.dispose();
      }
    });
    this._npc?.dispose();
    this._dust?.geometry?.dispose();
    this.tables.clear();
    this.characterSprites.clear();
    _matCache.clear();
  }
}
