/**
 * scenes/cafeScene.js
 * 무한 타일 카페 월드 — 5×5 그리드, 중앙 아일랜드 카운터
 * 카메라: (9,9,9) 대각선 코너뷰 / 타일 랩핑으로 무한 스크롤 착시
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createCharacterSprite,
  createNameTag,
  createCoffeeSprite,
} from '../utils/characterRenderer.js';
import { store } from '../store/gameStore.js';

// ── 툰 그라디언트 맵 (전역 공유) ─────────────────────────────
// 3-step 고대비: shadow(25)→mid(140)→highlight(255)
// 레퍼런스 스타일: 어두운 그림자 영역 / 밝은 하이라이트 영역 명확히 구분
// 실제 색감은 CelEdge 듀오톤 셰이더가 네이비/크림으로 매핑
let _toonGradientMap = null;
function getToonGradientMap() {
  if (_toonGradientMap) return _toonGradientMap;
  const colors = new Uint8Array([25, 140, 255]);
  const tex = new THREE.DataTexture(colors, 3, 1);
  tex.format = THREE.RedFormat;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  _toonGradientMap = tex;
  return tex;
}

// ── 타일 월드 상수 ─────────────────────────────────────────
const TILE_SIZE   = 10;   // 타일 하나의 월드 크기
const GRID_DIM    = 5;    // 5×5 그리드
const HALF_G      = 2;    // (GRID_DIM-1)/2
const WRAP_LIMIT  = TILE_SIZE * (HALF_G + 0.5);  // 이 거리 넘으면 반대쪽으로 랩
const GRID_SPAN   = TILE_SIZE * GRID_DIM;         // 전체 그리드 크기 50

const SEATS_PER_TABLE = 4;
const TABLE_R         = 0.52;   // 테이블 반경 (0.42 → 0.52)
const SEAT_DIST       = 0.82;   // 의자-테이블 거리 (0.65 → 0.82)

// ── 탈색 크림/스톤 팔레트 ────────────────────────────────────
// 듀오톤 셰이더가 밝기에 따라 네이비↔크림으로 매핑하므로
// 모든 소재를 비슷한 밝기의 중성 색상으로 통일
const C = {
  grout:         0xD0CCC4,
  wall:          0xE4E0D8,
  wallBase:      0xD4D0C8,
  counterTop:    0xDEDAD2,
  counterFront:  0xD0CCC4,
  counterSide:   0xC8C4BC,
  tableTop:      0xDEDAD2,
  tableLeg:      0xC4C0B8,
  chairWood:     0xC4C0B8,
  chairPad:      0xE0DCD4,
  windowGlass:   0xCCD4DC,
  lampCord:      0x303030,
  lampBulb:      0xFFF8E0,   // 전구: 따뜻한 emissive 유지
  lampSocket:    0x787068,
  leaf1:         0xC0C4B8,   // 약간 녹색빛 회색
  leaf2:         0xB0B4A8,
  pot:           0xC8C4BC,
  shelfWood:     0xBEBAB2,
  signDark:      0x181818,
  coffeeMachine: 0x9898A0,
  pole:          0x3A3830,
  rug1:          0xBCB8B0,
  rug2:          0xCCCCC4,
};

// ── 재질 캐시 (MeshToonMaterial) ───────────────────────────
const _matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}_${JSON.stringify(opts)}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshToonMaterial({
      color,
      gradientMap: getToonGradientMap(),
      ...opts,
    }));
  }
  return _matCache.get(key);
}

// ── 타일별 테이블 레이아웃 (타일 중심 기준 오프셋) ───────────
// 2패턴 체커보드 — tx+tz 홀짝으로 결정적 배치, 랜덤 없음
const TILE_LAYOUTS = [
  // 짝수 타일 (|tx|+|tz| 짝): 정사각형 — 인접 타일과 5유닛 등간격
  [{ x:-2.5, z:-2.5 }, { x: 2.5, z:-2.5 }, { x:-2.5, z: 2.5 }, { x: 2.5, z: 2.5 }],
  // 홀수 타일 (|tx|+|tz| 홀): 다이아몬드 — 정사각 사이를 메워 전체 밀도 균일
  [{ x: 0.0, z:-3.0 }, { x: 3.0, z: 0.0 }, { x: 0.0, z: 3.0 }, { x:-3.0, z: 0.0 }],
];

// 타일별 램프 오프셋 (타일 중심 기준, ±2.5 이내)
const TILE_LAMPS = [
  [[-2.0, -1.2], [2.0, 2.0]],
  [[-2.8,  1.2], [1.5, -2.4]],
  [[-1.2, -2.8], [2.4,  1.2]],
  [[ 2.0, -2.0], [-2.4, 2.8]],
  [[-2.4, -2.0], [2.0,  1.5]],
  [[-1.5,  2.4], [2.4, -2.0]],
  [[ 0.4, -2.8], [-2.8, 0.4]],
  [[ 2.8,  1.0], [-0.6,-2.8]],
];

// ── CafeScene 클래스 ───────────────────────────────────────
export class CafeScene {
  constructor() {
    this.scene           = new THREE.Scene();
    this.tables          = new Map();
    this.characterSprites = new Map();
    this._tableCount     = 0;
    this._tiles          = [];
    this._staffCatGroup  = null;

    this._setupLights();
    this._buildFloor();
    this._buildIslandCounter();
    this._buildTileGrid();

    // 타일 시스템이 거리 기반 재배치를 담당하므로 Three.js 프러스텀 컬링 불필요
    // — Mesh 전체 비활성화: 팝인/팝아웃 없이 부드러운 스크롤 보장
    this.scene.traverse(obj => {
      if (obj.isMesh) obj.frustumCulled = false;
    });
  }

  get tableCount() { return this._tableCount; }
  get gridSpan()   { return GRID_SPAN; }  // 카메라 토로이달 랩핑에 사용

  // ── 조명 ─────────────────────────────────────────────────
  // 레퍼런스 스타일: 단방향 강한 주광 + 극히 낮은 앰비언트 → 선명한 그림자
  _setupLights() {
    // 배경색: 짙은 네이비 (씬 전체 분위기 설정)
    this.scene.background = new THREE.Color(0x0d1620);

    // 앰비언트: 매우 낮은 쿨 블루 → 그림자 영역이 진한 네이비로 보임
    this.scene.add(new THREE.AmbientLight(0x0a1828, 0.35));

    // 메인 태양광 — 좌상단에서 강하게, 그림자 활성화
    this.sunLight = new THREE.DirectionalLight(0xfff0e0, 2.2);
    this.sunLight.position.set(9, 14, 9);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near   = 0.5;
    this.sunLight.shadow.camera.far    = 80;
    this.sunLight.shadow.camera.left   = -22;
    this.sunLight.shadow.camera.right  =  22;
    this.sunLight.shadow.camera.top    =  22;
    this.sunLight.shadow.camera.bottom = -22;
    this.sunLight.shadow.bias          = -0.001;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 약한 보조광 (완전 암흑 방지, 매우 낮게)
    const fill = new THREE.DirectionalLight(0x102040, 0.15);
    fill.position.set(-5, 8, -5);
    this.scene.add(fill);
  }

  // ── 무한 바닥 (대형 평면 + 시임리스 벽돌 텍스처) ───────────
  _buildFloor() {
    const sz = 512, bw = 64, bh = 32;
    const canvas = document.createElement('canvas');
    canvas.width = sz; canvas.height = sz;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#9A5C32';
    ctx.fillRect(0, 0, sz, sz);

    const brickColors = ['#D4906A', '#C87A52', '#CC8460', '#C07050', '#D09068', '#CA8A62'];
    const rows = sz / bh;
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) * (bw / 2);
      for (let col = -1; col <= sz / bw + 1; col++) {
        const x = col * bw + off, y = row * bh;
        if (x + bw <= 0 || x >= sz) continue;
        const ci = Math.abs(row * 3 + col * 7 + row * col) % brickColors.length;
        ctx.fillStyle = brickColors[ci];
        ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // 0.6 세계 유닛 = 벽돌 1개 너비 → 500 유닛 바닥에서 833개 반복
    tex.repeat.set(120, 120);
    tex.needsUpdate = true;

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshToonMaterial({ map: tex, gradientMap: getToonGradientMap() })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);
  }

  // ── 중앙 아일랜드 카운터 ─────────────────────────────────
  _buildIslandCounter() {
    const CW = 5.0, CD = 3.2, cH = 0.94, cT = 0.44;
    const x1 = -CW / 2, x2 = CW / 2;
    const z1 = -CD / 2, z2 = CD / 2;

    // 4면 패널 (속이 빈 직사각형)
    const panels = [
      { w: CW,           d: cT,           px: 0,          pz: z1 + cT / 2, color: C.counterFront },
      { w: CW,           d: cT,           px: 0,          pz: z2 - cT / 2, color: C.counterFront },
      { w: cT,           d: CD - cT * 2,  px: x1 + cT / 2, pz: 0,          color: C.counterSide  },
      { w: cT,           d: CD - cT * 2,  px: x2 - cT / 2, pz: 0,          color: C.counterSide  },
    ];
    panels.forEach(({ w, d, px, pz, color }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, cH, d), mat(color));
      m.position.set(px, cH / 2, pz);
      m.castShadow    = true;
      m.receiveShadow = true;
      this.scene.add(m);
    });

    // 상판 슬래브 (4면 + 내부 작업대)
    const ovh = 0.07;
    [
      { w: CW + ovh,       d: cT + ovh,       px: 0,             pz: z1 + cT / 2 },
      { w: CW + ovh,       d: cT + ovh,       px: 0,             pz: z2 - cT / 2 },
      { w: cT + ovh,       d: CD - cT * 2 + ovh, px: x1 + cT / 2, pz: 0           },
      { w: cT + ovh,       d: CD - cT * 2 + ovh, px: x2 - cT / 2, pz: 0           },
    ].forEach(({ w, d, px, pz }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), mat(C.counterTop));
      m.position.set(px, cH + 0.045, pz);
      this.scene.add(m);
    });

    // 카운터 위 장비
    this._buildCoffeeMachine(-0.9, cH+0.1, -1.4, '/models/CoffeeMachine_Ragular.glb', 0.44);
    this._buildCoffeeMachine( 0, cH+0.1, -1.4, '/models/CoffeeMacnine_Small.glb',   0.36);
    this._addCupStack(1.5, cH, 1.4);
    this._addCounterPlant(-2.0, cH+0.2, 0.7);

    // 메뉴 보드 폴 + 패널 (카운터 뒤 -z 방향)
    const poleH = 2.5;
    [[-1.5, z1 - 0.1], [1.5, z1 - 0.1]].forEach(([px, pz]) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, poleH, 6),
        mat(C.pole)
      );
      pole.position.set(px, cH + poleH / 2, pz);
      this.scene.add(pole);
    });

    // 수평 크로스바
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.06), mat(C.pole));
    bar.position.set(0, cH + poleH - 0.1, z1 - 0.1);
    this.scene.add(bar);

    // 메뉴 보드 2장 (폴에 걸림)
    this._addMenuPanel(-0.9, cH + poleH - 0.6, z1 - 0.16, 'BREAKFAST · LUNCH');
    this._addMenuPanel( 0.9, cH + poleH - 0.6, z1 - 0.16, 'COFFEE · DESSERT');

    // COFFEE 사인보드 (카운터 정면 상단)
    this._addCoffeeSign(0, cH + poleH + 0.1, z2 + 0.08);

    // 선반 (카운터 뒤 -z 벽쪽)
    this._addWallShelf(0, 2.2, z1 - 0.6);

    // 바 스툴 — 정면(z2), 좌측(x1), 우측(x2) 3면
    const stoolZ = z2 + 0.72;
    for (let i = 0; i < 5; i++) {
      this._addBarStool(x1 + CW * (i + 0.5) / 5, stoolZ);
    }
    [-0.6, 0.6].forEach(dz => this._addBarStool(x1 - 0.72, dz));
    [-0.6, 0.6].forEach(dz => this._addBarStool(x2 + 0.72, dz));

    // 직원 고양이 카운터 안
    this._addStaffCat(0.2, cH, -0.1);
  }

  _addCoffeeSign(x, y, z) {
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 80;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#1A0A02';
    ctx.fillRect(0, 0, 320, 80);
    ctx.font = 'bold 48px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFE090';
    ctx.shadowColor = '#FFA020'; ctx.shadowBlur = 12;
    ctx.fillText('☕ COFFEE', 160, 42);
    const tex = new THREE.CanvasTexture(cv);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 0.08), mat(C.shelfWood));
    frame.position.set(x, y, z);
    this.scene.add(frame);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.70, 0.10),
      new THREE.MeshToonMaterial({ map: tex, gradientMap: getToonGradientMap() })
    );
    sign.position.set(x, y, z + 0.02);
    this.scene.add(sign);
  }

  _addMenuPanel(x, y, z, title) {
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0C0608';
    ctx.fillRect(0, 0, 192, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 96, 20);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(210,190,145,0.9)';
    const items = ['Espresso   ₩4,000', 'Americano  ₩4,500', 'Latte      ₩5,000',
                   'Cappuccino ₩5,500', 'Cold Brew  ₩5,000', 'Cake       ₩6,000'];
    items.forEach((t, i) => ctx.fillText(t, 96, 38 + i * 14));
    const tex = new THREE.CanvasTexture(cv);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.05, 0.06), mat(C.shelfWood));
    frame.position.set(x, y, z);
    this.scene.add(frame);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.90, 0.08),
      new THREE.MeshToonMaterial({ map: tex, gradientMap: getToonGradientMap() })
    );
    board.position.set(x, y, z + 0.02);
    this.scene.add(board);
  }

  _addWallShelf(x, y, z) {
    // 벽 선반 + 진열 아이템
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 0.4), mat(C.shelfWood));
    shelf.position.set(x, y, z);
    this.scene.add(shelf);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.38), mat(C.shelfWood));
    [-1.5, 0, 1.5].forEach(dx => {
      const b = bracket.clone();
      b.position.set(x + dx, y - 0.15, z);
      this.scene.add(b);
    });
    [0xD04040, 0x4060D0, 0x48A868, 0xE8A040, 0xC04080, 0x90C0D0].forEach((col, i) => {
      const item = new THREE.Mesh(
        new THREE.BoxGeometry(0.10 + (i % 2) * 0.05, 0.14 + (i % 3) * 0.07, 0.09),
        mat(col)
      );
      item.position.set(x + (i - 2.5) * 0.58, y + 0.12 + (i % 2) * 0.04, z + (i % 2) * 0.06);
      this.scene.add(item);
    });
  }

  _addBarStool(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.030, 0.64, 6), mat(C.chairWood)
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

  _buildCoffeeMachine(x, baseY, z, modelPath, targetHeight = 0.42) {
    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
      const model = gltf.scene;

      // GLB 머테리얼 → MeshToonMaterial로 교체 (카툰 렌더링 통일)
      model.traverse(child => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const newMats = mats.map(m => {
          // GRID 머테리얼 → 커피머신 배수 그레이팅 텍스처
          if (m.name && /grid/i.test(m.name)) {
            return new THREE.MeshToonMaterial({
              color: new THREE.Color(0xA87830),
              map: this._getDrainGridTexture(),
              gradientMap: getToonGradientMap(),
            });
          }

          const hsl = { h: 0, s: 0, l: 0 };
          (m.color ?? new THREE.Color(0.5, 0.5, 0.5)).getHSL(hsl);

          let color;
          if (hsl.l > 0.65)       color = new THREE.Color(0xE8D4A8);
          else if (hsl.l > 0.35)  color = new THREE.Color(0x7A5020);
          else                    color = new THREE.Color(0x1E1008);

          return new THREE.MeshToonMaterial({ color, gradientMap: getToonGradientMap() });
        });
        child.material = Array.isArray(child.material) ? newMats : newMats[0];
      });

      // 타겟 높이에 맞춰 스케일 자동 조정
      const box = new THREE.Box3().setFromObject(model);
      const modelH = box.getSize(new THREE.Vector3()).y;
      if (modelH > 0) model.scale.setScalar(targetHeight / modelH);

      // 중심 X/Z 정렬 + 바닥을 baseY에 맞춤
      const box2 = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      box2.getCenter(center);
      model.position.set(x - center.x, baseY - box2.min.y, z - center.z);

      this.scene.add(model);
    }, undefined, (err) => {
      console.warn('[CoffeeMachine] GLB 로드 실패, 폴백 렌더링:', err);
      this._buildCoffeeMachineFallback(x, baseY, z);
    });
  }

  _getDrainGridTexture() {
    if (this._drainGridTex) return this._drainGridTex;

    const SIZE = 256, CELL = 20, BAR = 4;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    // 바닥 — 물 고이는 깊은 홈 (매우 어두운 브라운)
    ctx.fillStyle = '#080402';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 가로 바: 위쪽 하이라이트 → 본체 브론즈 → 아래쪽 그림자
    for (let y = 0; y < SIZE; y += CELL) {
      const grad = ctx.createLinearGradient(0, y, 0, y + BAR);
      grad.addColorStop(0.0, '#D4A040');   // 하이라이트 (황금 반사)
      grad.addColorStop(0.35, '#9A6C24');  // 본체 브론즈
      grad.addColorStop(1.0, '#3A1E08');   // 그림자
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, SIZE, BAR);
    }

    // 세로 바: 왼쪽 하이라이트 → 본체 → 오른쪽 그림자
    for (let x = 0; x < SIZE; x += CELL) {
      const grad = ctx.createLinearGradient(x, 0, x + BAR, 0);
      grad.addColorStop(0.0, '#C89830');
      grad.addColorStop(0.35, '#9A6C24');
      grad.addColorStop(1.0, '#3A1E08');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, BAR, SIZE);
    }

    // 교차점 — 약간 더 밝게 (리벳 느낌)
    ctx.fillStyle = '#DDB040';
    for (let y = 0; y < SIZE; y += CELL) {
      for (let x = 0; x < SIZE; x += CELL) {
        ctx.fillRect(x, y, BAR, BAR);
      }
    }

    // 홀 내부에 미세한 반사 스팟 (물기 광택)
    ctx.fillStyle = 'rgba(255,200,100,0.07)';
    for (let y = 0; y < SIZE; y += CELL) {
      for (let x = 0; x < SIZE; x += CELL) {
        const hx = x + BAR + 3, hy = y + BAR + 3;
        if (hx < x + CELL && hy < y + CELL) ctx.fillRect(hx, hy, 3, 3);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this._drainGridTex = tex;
    return tex;
  }

  _buildCoffeeMachineFallback(x, baseY, z) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.44, 0.36), mat(C.coffeeMachine));
    body.position.set(x, baseY + 0.22, z);
    this.scene.add(body);
    const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.30, 6), mat(0x909090));
    wand.position.set(x + 0.30, baseY + 0.30, z);
    wand.rotation.z = 0.4;
    this.scene.add(wand);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.28), mat(0x808080));
    tray.position.set(x, baseY + 0.01, z);
    this.scene.add(tray);
  }

  _addCupStack(x, baseY, z) {
    [0xF0E0D0, 0xEAD8C8, 0xF2E4D4].forEach((col, i) => {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.055, 0.10, 8), mat(col)
      );
      cup.position.set(x, baseY + 0.05 + i * 0.09, z);
      this.scene.add(cup);
    });
  }

  _addCounterPlant(x, baseY, z) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.08, 0.14, 8), mat(C.pot)
    );
    pot.position.set(x, baseY + 0.07, z);
    this.scene.add(pot);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 5, 4),
        mat(i % 2 ? C.leaf1 : C.leaf2)
      );
      leaf.position.set(x + Math.cos(ang) * 0.08, baseY + 0.22, z + Math.sin(ang) * 0.08);
      this.scene.add(leaf);
    }
  }

  _addStaffCat(x, _baseY, z) {
    const group = new THREE.Group();
    const sprite = createCharacterSprite(
      { bodyColor: '#F0E8D8', accessories: ['apron'] }, '바리스타'
    );
    sprite.scale.set(0.72, 0.92, 1);
    sprite.position.y = 0.62;  // 카운터(cH=0.94) 위로 상반신 노출
    group.add(sprite);

    const nameTag = createNameTag('☕ 바리스타', false);
    nameTag.position.y = 1.32;
    group.add(nameTag);

    group.traverse(obj => { if (obj.isSprite) obj.frustumCulled = false; });

    group.position.set(x, 0, z);
    this.scene.add(group);
    this._staffCatGroup = group;
  }

  // ── 타일 그리드 생성 ──────────────────────────────────────
  _buildTileGrid() {
    let tableIdx = 0;
    for (let tx = -HALF_G; tx <= HALF_G; tx++) {
      for (let tz = -HALF_G; tz <= HALF_G; tz++) {
        const isCenter = (tx === 0 && tz === 0);
        const addLight  = (Math.abs(tx) <= 1 && Math.abs(tz) <= 1);
        const tileData  = this._createTile(tx, tz, tableIdx, isCenter, addLight);
        this._tiles.push(tileData);
        tableIdx += tileData.tableIds.length;
      }
    }
    this._tableCount = tableIdx;
  }

  _createTile(tx, tz, startIdx, isCenter, addLight) {
    const wx = tx * TILE_SIZE;
    const wz = tz * TILE_SIZE;

    // 타일 장식 그룹 (램프, 화분 — 랩핑 시 같이 이동)
    const group = new THREE.Group();
    group.position.set(wx, 0, wz);
    this.scene.add(group);

    const seed = Math.abs(tx * 17 + tz * 31 + Math.abs(tx * tz) * 7) % 1000;
    const tableIds = [];

    // 체커보드 배치: tx+tz 홀짝으로 패턴 결정 (seed 랜덤 없음)
    const layoutIdx = isCenter ? 0 : (Math.abs(tx) + Math.abs(tz)) % TILE_LAYOUTS.length;

    if (isCenter) {
      // 중앙 타일: 카운터로부터 최대한 멀리 — 4개 코너(±4.5, ±4.5)
      // 카운터 코너(2.5,1.6)까지의 거리 ≈ 3.5유닛, 의자 뺀 여유 ≈ 2.2유닛
      const periphery = [
        { x: -4.5, z: -4.5 },
        { x:  4.5, z: -4.5 },
        { x: -4.5, z:  4.5 },
        { x:  4.5, z:  4.5 },
      ];
      periphery.forEach((pos, i) => {
        const id = `table_${startIdx + i}`;
        this._createTable(id, wx + pos.x, wz + pos.z, SEATS_PER_TABLE);
        tableIds.push(id);
      });
    } else {
      TILE_LAYOUTS[layoutIdx].forEach((pos, i) => {
        const id = `table_${startIdx + i}`;
        this._createTable(id, wx + pos.x, wz + pos.z, SEATS_PER_TABLE);
        tableIds.push(id);
      });
    }

    // 에디슨 램프 (타일 그룹 자식으로 추가 → 랩핑 시 같이 이동)
    const lampIdx = seed % TILE_LAMPS.length;
    TILE_LAMPS[lampIdx].forEach(([lx, lz]) => {
      const cordLen = 0.55 + (seed % 5) * 0.06;
      this._addEdisonLampToGroup(group, lx, lz, cordLen, addLight);
    });

    // 화분 (간헐적, TILE_SIZE=10 기준 ±2 이내)
    if (seed % 4 === 0) {
      const px = ((seed % 5) - 2) * 1.0;
      const pz = ((seed % 7) - 3) * 0.9;
      this._addFloorPlantToGroup(group, px, pz);
    } else if (seed % 6 === 2) {
      const px = ((seed % 4) - 1.5) * 1.2;
      const pz = ((seed % 5) - 2) * 1.0;
      this._addTallPlantToGroup(group, px, pz);
    }

    // 가끔 러그 (장식용 바닥 매트)
    if (seed % 5 === 0 && !isCenter) {
      const rug = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.02, 1.6),
        mat(seed % 2 ? C.rug1 : C.rug2)
      );
      rug.position.set(TILE_LAYOUTS[layoutIdx][0].x, 0.008, TILE_LAYOUTS[layoutIdx][0].z);
      group.add(rug);
    }

    return { group, wx, wz, tableIds };
  }

  // ── 에디슨 램프 (그룹 로컬 좌표) ─────────────────────────
  _addEdisonLampToGroup(group, localX, localZ, cordLen, addPointLight) {
    const ceilY = 3.4;

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, cordLen, 4), mat(C.lampCord)
    );
    cord.position.set(localX, ceilY - cordLen / 2, localZ);
    group.add(cord);

    const socket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.030, 0.065, 8), mat(C.lampSocket)
    );
    socket.position.set(localX, ceilY - cordLen - 0.032, localZ);
    group.add(socket);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.082, 8, 8),
      new THREE.MeshToonMaterial({
        color: C.lampBulb, emissive: 0xFFD040, emissiveIntensity: 0.8,
        gradientMap: getToonGradientMap(),
      })
    );
    bulb.position.set(localX, ceilY - cordLen - 0.12, localZ);
    group.add(bulb);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.038, 0.065, 6), mat(C.lampBulb)
    );
    neck.position.set(localX, ceilY - cordLen - 0.185, localZ);
    group.add(neck);

    if (addPointLight) {
      const light = new THREE.PointLight(0xFFD870, 0.55, 5.5);
      light.position.set(localX, ceilY - cordLen - 0.14, localZ);
      group.add(light);
    }
  }

  // ── 화분 (그룹 로컬 좌표) ─────────────────────────────────
  _addFloorPlantToGroup(group, localX, localZ) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.17, 0.38, 10), mat(C.pot)
    );
    pot.position.set(localX, 0.19, localZ);
    group.add(pot);

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const r = 0.08 + (i % 3) * 0.05;
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.13 + (i % 2) * 0.05, 6, 5),
        mat(i % 2 ? C.leaf1 : C.leaf2)
      );
      leaf.position.set(localX + Math.cos(ang) * r, 0.66 + (i % 3) * 0.13, localZ + Math.sin(ang) * r);
      group.add(leaf);
    }
  }

  _addTallPlantToGroup(group, localX, localZ) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.22, 0.46, 10), mat(C.pot)
    );
    pot.position.set(localX, 0.23, localZ);
    group.add(pot);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 1.2, 6), mat(C.leaf2)
    );
    stem.position.set(localX, 0.86, localZ);
    group.add(stem);

    [[0, 0], [0.22, 0.08], [-0.22, 0.08], [0, 0.22]].forEach(([lx, lz]) => {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.20, 6, 5), mat(C.leaf1)
      );
      leaf.position.set(localX + lx, 1.60, localZ + lz);
      group.add(leaf);
    });
  }

  // ── 무한 타일 랩핑 ─────────────────────────────────────────
  /**
   * 카메라 타겟 주변으로 타일을 랩핑해서 무한 맵 착시 생성.
   * worldRenderer의 animate 루프에서 매 프레임 호출.
   */
  updateTiles(cameraTarget) {
    this._tiles.forEach(tile => {
      const dx = tile.wx - cameraTarget.x;
      const dz = tile.wz - cameraTarget.z;
      let shiftX = 0, shiftZ = 0;

      if (dx >  WRAP_LIMIT) shiftX = -GRID_SPAN;
      if (dx < -WRAP_LIMIT) shiftX =  GRID_SPAN;
      if (dz >  WRAP_LIMIT) shiftZ = -GRID_SPAN;
      if (dz < -WRAP_LIMIT) shiftZ =  GRID_SPAN;

      if (shiftX || shiftZ) {
        tile.wx += shiftX;
        tile.wz += shiftZ;
        tile.group.position.x += shiftX;
        tile.group.position.z += shiftZ;

        // 테이블 그룹 및 맵 내 위치 데이터 동기화
        tile.tableIds.forEach(id => {
          const td = this.tables.get(id);
          if (!td) return;
          td.position.x += shiftX;
          td.position.z += shiftZ;
          td.group.position.x += shiftX;
          td.group.position.z += shiftZ;
          td.seats.forEach(s => {
            s.worldX += shiftX;
            s.worldZ += shiftZ;
          });
        });
      }
    });
  }

  // ── 테이블 생성 ──────────────────────────────────────────
  _createTable(tableId, x, z, seatCount = SEATS_PER_TABLE) {
    const group = new THREE.Group();
    group.name = tableId;

    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.74, 8), mat(C.tableLeg)
    );
    leg.position.y = 0.37;
    leg.castShadow = true;
    group.add(leg);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.04, 12), mat(C.tableLeg)
    );
    base.position.y = 0.02;
    group.add(base);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.07, 24),
      mat(C.tableTop)
    );
    top.position.y = 0.76;
    top.userData.tableId = tableId;
    top.castShadow    = true;
    top.receiveShadow = true;
    group.add(top);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_R, 0.026, 6, 24), mat(C.tableLeg)
    );
    rim.position.y = 0.76;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    if (((x * 1.7 + z * 1.3) % 2.2 + 2.2) % 2.2 > 1.0) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.056, 0.046, 0.10, 8), mat(0xE8D4B8)
      );
      cup.position.set(0.14, 0.82, 0.10);
      group.add(cup);
    }

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

    group.position.set(x, 0, z);
    this.scene.add(group);
    this.tables.set(tableId, { group, seats, position: { x, z }, seatCount });
    return { group, seats };
  }

  _createChair(angle) {
    const group = new THREE.Group();
    group.position.set(Math.cos(angle) * SEAT_DIST, 0, Math.sin(angle) * SEAT_DIST);
    group.rotation.y = angle + Math.PI;

    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.20, 0.06, 12), mat(C.chairPad)
    );
    seat.position.y = 0.45;
    seat.castShadow = true;
    group.add(seat);

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

  // ── 캐릭터 관리 ──────────────────────────────────────────
  updateCharacter(userInfo) {
    const { id, username, avatar, tableId, seatIndex, isMe, heldCoffee } = userInfo;
    const pos     = this._resolvePosition(tableId, seatIndex, id);
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
        new THREE.MeshBasicMaterial({
          color: 0xFFD080, transparent: true, opacity: 0.22, depthWrite: false,
        })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.01;
      // OutlineEffect: 반투명 글로우에 아웃라인 그리지 않음
      glow.userData.outlineParameters = { visible: false };
      group.add(glow);
    }

    // Sprite는 중심점만으로 컬링 → 테이블보다 일찍 사라지는 문제 방지
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
    // 테이블 없으면 카운터 근처 대기 위치
    const hash = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const slots = [
      { x: -4.5, z: 5.5 }, { x: -3.2, z: 6.5 }, { x: -6.0, z: 5.0 },
      { x: -2.0, z: 5.8 }, { x: -5.0, z: 6.0 }, { x: -1.0, z: 6.2 },
      { x: 3.0,  z: 5.5 }, { x: 5.0,  z: 5.0 }, { x: 4.0,  z: 6.0 },
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
      if (sprite?.isSprite) sprite.position.y = 0.62 + Math.sin(time * 1.3) * 0.025;
    }
  }

  // ── 동적 테이블 확장 ─────────────────────────────────────
  expandTables(newCount) {
    if (newCount <= this._tableCount) return;
    // 외곽 링에 추가 테이블 배치
    for (let i = this._tableCount; i < newCount; i++) {
      const angle  = (i * Math.PI * 2) / 8;
      const radius = TILE_SIZE * 1.8 + Math.floor(i / 8) * TILE_SIZE;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this._createTable(`table_${i}`, x, z, SEATS_PER_TABLE);
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
