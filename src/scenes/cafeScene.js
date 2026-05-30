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

// ── 타일 월드 상수 ─────────────────────────────────────────
const TILE_SIZE   = 10;   // 타일 하나의 월드 크기
const GRID_DIM    = 5;    // 5×5 그리드
const HALF_G      = 2;    // (GRID_DIM-1)/2
const WRAP_LIMIT  = TILE_SIZE * (HALF_G + 0.5);  // 이 거리 넘으면 반대쪽으로 랩
const GRID_SPAN   = TILE_SIZE * GRID_DIM;         // 전체 그리드 크기 50

const SEATS_PER_TABLE = 4;
const TABLE_R         = 0.52;   // 테이블 반경 (0.42 → 0.52)
const SEAT_DIST       = 0.82;   // 의자-테이블 거리 (0.65 → 0.82)

// ── 비비드 카툰 카페 팔레트 ───────────────────────────────────
// Base  : Cream White #FFF5EE / Soft Pink #FFB7C5
// Accent: Mint #B5EAD7 / Lavender #C9B8E8 / Peach #FFCBA4
// Outline: #3D1C2E (post-process)
const C = {
  // 바닥
  grout:         0xF5C8C8,
  // 카운터
  counterTop:    0xFFFAF0,  // 크림 화이트
  counterFront:  0xFFB7C5,  // 소프트 핑크
  counterSide:   0xFFCBA4,  // 피치
  // 테이블
  tableTop:      0xFFFAF0,  // 크림 화이트
  tableLeg:      0x8B5C6A,  // 다크 로즈우드 (대비용)
  // 의자
  chairWood:     0x8B5C6A,  // 다크 로즈우드
  chairPad:      0xFFB7C5,  // 소프트 핑크 (기본, 타일별로 override)
  // 램프
  lampCord:      0xC47A8A,  // 우디 핑크 코드
  lampBulb:      0xFFFBE0,  // 따뜻한 크림
  lampSocket:    0xFFCBA4,  // 피치
  lampShade:     0xFFB7C5,  // 핑크 갓
  // 식물
  leaf1:         0xB5EAD7,  // 민트
  leaf2:         0x8FD9BF,  // 미디엄 민트
  pot:           0xFFCBA4,  // 피치 화분
  // 선반/간판
  shelfWood:     0xFFCBA4,  // 피치 선반
  signDark:      0xC9B8E8,  // 라벤더 간판
  // 기타
  coffeeMachine: 0xA8D8C8,  // 파스텔 민트 (포컬 포인트)
  pole:          0xC9B8E8,  // 라벤더 폴
  rug1:          0xFFB7C5,  // 핑크 러그
  rug2:          0xB5EAD7,  // 민트 러그
  rug3:          0xC9B8E8,  // 라벤더 러그
  // 책 소품
  bookA:         0xFFB7C5,
  bookB:         0xC9B8E8,
  bookC:         0xFFCBA4,
  bookD:         0xB5EAD7,
};

// ── 재질 캐시 (MeshLambertMaterial) ────────────────────────
const _matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}_${JSON.stringify(opts)}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
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

    // 프러스텀 컬링 비활성화
    this.scene.traverse(obj => {
      if (obj.isMesh) obj.frustumCulled = false;
    });
  }

  get tableCount() { return this._tableCount; }
  get gridSpan()   { return GRID_SPAN; }  // 카메라 토로이달 랩핑에 사용

  // ── 조명 ─────────────────────────────────────────────────
  _setupLights() {
    // ── 기존 라이트 전체 제거 (이전 이터레이션 누적 방지) ──────
    this.scene.children
      .filter(obj => obj.isLight)
      .forEach(light => this.scene.remove(light));

    this.scene.background = new THREE.Color(0xFFE8D6);
    this.scene.fog = new THREE.FogExp2(0xFFE8F0, 0.005);

    // STEP 1 — 글로벌 앰비언트 (사양서 그대로)
    const ambient = new THREE.AmbientLight(0xFFF0F5, 1.2);
    this.scene.add(ambient);

    // STEP 2 — 메인 디렉셔널 (따뜻한 황금 오후, 45° 위)
    const dirLight = new THREE.DirectionalLight(0xFFEED6, 1.4);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = false;
    this.scene.add(dirLight);

    // STEP 3 — 소프트 필 라이트 (반대편 — 그림자 면 파스텔 미드톤 유지)
    const fillLight = new THREE.DirectionalLight(0xFFD6E8, 0.6);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);

    // STEP 4 — 황금 중앙 포인트 (사양서 그대로)
    const warmPoint = new THREE.PointLight(0xFFD700, 0.8, 30);
    warmPoint.position.set(0, 6, 0);
    this.scene.add(warmPoint);
  }

  // ── 무한 바닥 (대형 평면 + 시임리스 벽돌 텍스처) ───────────
  _buildFloor() {
    const sz = 512, tw = 72;
    const canvas = document.createElement('canvas');
    canvas.width = sz; canvas.height = sz;
    const ctx = canvas.getContext('2d');

    // 사양서 색상: 크림화이트 #FFF5EE + 블러쉬핑크 #F2D9E0
    const tileA = '#FFF5EE', tileB = '#F2D9E0';
    for (let row = 0; row < Math.ceil(sz / tw) + 1; row++) {
      for (let col = 0; col < Math.ceil(sz / tw) + 1; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? tileA : tileB;
        ctx.fillRect(col * tw, row * tw, tw, tw);
      }
    }
    // 사양서 줄눈: #D4A8B0 (뮤티드 로즈), 아주 얇게
    ctx.strokeStyle = '#D4A8B0';
    ctx.lineWidth = 0.8;
    for (let i = 0; i <= sz; i += tw) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, sz); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(sz, i); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // 반복 줄임: 타일을 크게 → Sobel 엣지 검출 빈도 감소 → 격자 검게 안 됨
    tex.repeat.set(40, 40);
    tex.needsUpdate = true;

    // MeshLambertMaterial: 선형 조명, 툰 스텝 없음 → 바닥이 균일하게 밝음
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
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
    ctx.fillStyle = '#FFF5EE';
    ctx.fillRect(0, 0, 320, 80);
    ctx.strokeStyle = '#C47A8A';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 314, 74);
    ctx.font = 'bold 38px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#C47A8A';
    ctx.shadowColor = '#FFB7C5'; ctx.shadowBlur = 6;
    ctx.fillText('☕  C O F F E E', 160, 42);
    const tex = new THREE.CanvasTexture(cv);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 0.08), mat(C.shelfWood));
    frame.position.set(x, y, z);
    this.scene.add(frame);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.70, 0.10),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    sign.position.set(x, y, z + 0.02);
    this.scene.add(sign);
  }

  _addMenuPanel(x, y, z, title) {
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#FFF5EE';
    ctx.fillRect(0, 0, 192, 128);
    ctx.strokeStyle = '#C47A8A';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 188, 124);
    ctx.fillStyle = 'rgba(196,122,138,0.95)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 96, 20);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(150,100,160,0.90)';
    const items = ['Espresso   ₩4,000', 'Americano  ₩4,500', 'Latte      ₩5,000',
                   'Cappuccino ₩5,500', 'Cold Brew  ₩5,000', 'Cake       ₩6,000'];
    items.forEach((t, i) => ctx.fillText(t, 96, 38 + i * 14));
    const tex = new THREE.CanvasTexture(cv);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.05, 0.06), mat(C.shelfWood));
    frame.position.set(x, y, z);
    this.scene.add(frame);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.90, 0.08),
      new THREE.MeshLambertMaterial({ map: tex })
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
    [0xFF9EB5, 0xC4B5E8, 0xA8D8A8, 0xFFD9C2, 0xFFBDD6, 0xB8D8F0].forEach((col, i) => {
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

      // GLB 머테리얼 → MeshLambertMaterial (파스텔 민트)
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
          if (hsl.l > 0.65)       color = new THREE.Color(0xD8F0E8);
          else if (hsl.l > 0.35)  color = new THREE.Color(0xA8D8C8);
          else                    color = new THREE.Color(0x7DBFAA);
          return new THREE.MeshLambertMaterial({ color });
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
    const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.30, 6), mat(0xD8D0E8));
    wand.position.set(x + 0.30, baseY + 0.30, z);
    wand.rotation.z = 0.4;
    this.scene.add(wand);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.28), mat(0xF0E8F8));
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

    // 타일 좌표 기반 쿠션 색상 순환 — 인접 타일과 다른 색
    const padPalette = [0xFFB7C5, 0xB5EAD7, 0xC9B8E8];  // pink / mint / lavender
    const padCol = padPalette[Math.abs(tx * 3 + tz * 7 + 100) % 3];

    if (isCenter) {
      const periphery = [
        { x: -4.5, z: -4.5 }, { x:  4.5, z: -4.5 },
        { x: -4.5, z:  4.5 }, { x:  4.5, z:  4.5 },
      ];
      periphery.forEach((pos, i) => {
        const id = `table_${startIdx + i}`;
        this._createTable(id, wx + pos.x, wz + pos.z, SEATS_PER_TABLE, 0xFFB7C5);
        tableIds.push(id);
      });
    } else {
      TILE_LAYOUTS[layoutIdx].forEach((pos, i) => {
        const id = `table_${startIdx + i}`;
        this._createTable(id, wx + pos.x, wz + pos.z, SEATS_PER_TABLE, padCol);
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

    // 러그 (더 자주 추가, 3색 순환)
    if (seed % 3 === 0 && !isCenter) {
      const rugW = 2.0 + (seed % 3) * 0.4;
      const rugD = 1.4 + (seed % 4) * 0.3;
      const rugPalette = [C.rug1, C.rug2, C.rug3];
      const rug = new THREE.Mesh(
        new THREE.BoxGeometry(rugW, 0.018, rugD),
        mat(rugPalette[seed % 3])
      );
      rug.position.set(TILE_LAYOUTS[layoutIdx][0].x, 0.007, TILE_LAYOUTS[layoutIdx][0].z);
      group.add(rug);
    }

    // 페어리 라이트 — 모든 타일에 추가 (분위기 핵심)
    const flZ = (seed % 2 === 0) ? -2.8 : 2.8;
    this._addFairyLightsToGroup(group, flZ, 10);

    // 2번째 페어리 라이트 줄 (일부 타일)
    if (seed % 3 === 1) {
      this._addFairyLightsToGroup(group, (seed % 2 === 0) ? 2.8 : -2.8, 8);
    }

    // 바닥 책 스택 (소품 밀도 높이기)
    if (seed % 4 === 1 && !isCenter) {
      const bx = ((seed % 5) - 2) * 1.4;
      const bz = ((seed % 7) - 3) * 0.9;
      this._addBookStackToGroup(group, bx, 0.0, bz);
    }

    return { group, wx, wz, tableIds };
  }

  // ── 귀여운 돔 갓 램프 (그룹 로컬 좌표) ──────────────────────
  _addEdisonLampToGroup(group, localX, localZ, cordLen, addPointLight) {
    const ceilY = 3.4;
    const baseY = ceilY - cordLen;

    // 가는 라벤더 코드
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, cordLen, 4), mat(C.lampCord)
    );
    cord.position.set(localX, ceilY - cordLen / 2, localZ);
    group.add(cord);

    // 파스텔 돔 갓 (타일별로 색상 다양화)
    const shadeColors = [C.lampShade, 0xE8D8FF, 0xFFD9C2, 0xD8F0E8, 0xFFE8D0];
    const shadeCol = shadeColors[Math.abs(Math.round(localX * 7 + localZ * 13)) % shadeColors.length];
    const shade = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.52),
      mat(shadeCol)
    );
    shade.position.set(localX, baseY - 0.02, localZ);
    group.add(shade);

    // 갓 아랫단 링
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.009, 5, 20), mat(C.lampSocket)
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(localX, baseY - 0.02, localZ);
    group.add(rim);

    // 전구 (갓 안쪽 따뜻한 글로우)
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 7, 6),
      new THREE.MeshBasicMaterial({ color: 0xFFF8C0 })
    );
    bulb.position.set(localX, baseY - 0.01, localZ);
    group.add(bulb);

    if (addPointLight) {
      const light = new THREE.PointLight(0xFFE890, 1.5, 7.5);
      light.position.set(localX, baseY - 0.18, localZ);
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

  // ── 책 스택 (그룹 로컬 좌표) ─────────────────────────────
  _addBookStackToGroup(group, lx, ly, lz) {
    const bookColors = [C.bookA, C.bookB, C.bookC, C.bookD];
    const h = Math.abs(Math.round(lx * 17 + lz * 31)) % 100;
    const count = 2 + h % 3;
    let y = ly;
    for (let i = 0; i < count; i++) {
      const idx = (h + i * 7) % 4;
      const bw = 0.13 + (idx % 3) * 0.04;
      const bh = 0.08 + (idx % 4) * 0.025;
      const bd = 0.19 + (idx % 2) * 0.05;
      const tilt = ((h + i * 13) % 9 - 4) * 0.045;
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, bd), mat(bookColors[idx])
      );
      book.position.set(lx + (i % 2 ? 0.015 : -0.015), y + bh / 2, lz);
      book.rotation.y = tilt;
      group.add(book);
      y += bh;
    }
  }

  // ── 열린 노트북 (그룹 로컬 좌표) ────────────────────────
  _addLaptopToGroup(group, lx, ly, lz) {
    // 본체 (키보드)
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.016, 0.19), mat(C.counterTop)
    );
    base.position.set(lx, ly + 0.008, lz + 0.015);
    group.add(base);

    // 화면 패널 (약 120° 열림)
    const scrAngle = -Math.PI * 0.30;
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.18, 0.010), mat(0xE8ECFF)
    );
    screen.position.set(lx, ly + 0.106, lz - 0.058);
    screen.rotation.x = scrAngle;
    group.add(screen);

    // 발광 화면
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xDCE8FF, side: THREE.DoubleSide })
    );
    glow.position.set(lx, ly + 0.106, lz - 0.057);
    glow.rotation.x = scrAngle;
    group.add(glow);
  }

  // ── 페어리 라이트 (그룹 로컬 좌표) ─────────────────────
  _addFairyLightsToGroup(group, zOffset, count = 10) {
    const Y = 3.22;
    const spanX = 7.8;
    const bulbColors = [C.lampShade, 0xE8D8FF, 0xFFD9C2, 0xC8F0D8, 0xFFE8C0, 0xFFBDD6];

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = (t - 0.5) * spanX;
      const sag = Math.sin(t * Math.PI) * 0.38;
      const col = bulbColors[i % bulbColors.length];
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.040, 6, 4),
        new THREE.MeshBasicMaterial({ color: col })
      );
      bulb.position.set(x, Y - sag, zOffset);
      group.add(bulb);
    }
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
  _createTable(tableId, x, z, seatCount = SEATS_PER_TABLE, padColor = C.chairPad) {
    const group = new THREE.Group();
    group.name = tableId;

    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.74, 8), mat(C.tableLeg)
    );
    leg.position.y = 0.37;
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
    group.add(top);

    // 카툰 평면 그림자 — 실제 그림자맵 대신 따뜻한 원형 틴트
    const dropShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 18),
      new THREE.MeshBasicMaterial({
        color: 0xD4A0B0, transparent: true, opacity: 0.20, depthWrite: false,
      })
    );
    dropShadow.rotation.x = -Math.PI / 2;
    dropShadow.position.set(0, 0.004, 0);
    group.add(dropShadow);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_R, 0.026, 6, 24), mat(C.tableLeg)
    );
    rim.position.y = 0.76;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    // ── 테이블 소품 (모든 테이블: 머그 + 손잡이 + 꽃병) ──────
    const tHash = Math.abs(Math.round(x * 17 + z * 31)) % 6;
    const mugColors = [0xFFB7C5, 0xB5EAD7, 0xC9B8E8, 0xFFCBA4, 0xFFFAF0, 0xFFB7C5];
    const mugCol = mugColors[tHash];
    // 머그 몸체
    const mugBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.050, 0.042, 0.095, 10), mat(mugCol)
    );
    mugBody.position.set(0.17, 0.815, 0.07);
    group.add(mugBody);
    // 머그 손잡이 (반원 토러스)
    const mugHandle = new THREE.Mesh(
      new THREE.TorusGeometry(0.028, 0.008, 5, 10, Math.PI), mat(mugCol)
    );
    mugHandle.position.set(0.17 + 0.048, 0.815, 0.07);
    mugHandle.rotation.x = Math.PI / 2;
    group.add(mugHandle);
    // 작은 꽃병
    const vaseColors = [0xFFCBA4, 0xC9B8E8, 0xB5EAD7];
    const vase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.014, 0.105, 8), mat(vaseColors[tHash % 3])
    );
    vase.position.set(-0.16, 0.815, -0.07);
    group.add(vase);
    // 꽃병 위 꽃 (작은 구)
    const flowerCol = [0xFFB7C5, 0xFFCBA4, 0xB5EAD7][tHash % 3];
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 6, 4), mat(flowerCol)
    );
    flower.position.set(-0.16, 0.878, -0.07);
    group.add(flower);
    // 선택적 추가 소품 (노트북 or 책)
    if (tHash === 1 || tHash === 4) {
      this._addLaptopToGroup(group, -0.05, 0.77, 0.02);
    } else if (tHash === 2) {
      this._addBookStackToGroup(group, -0.12, 0.77, 0.03);
    }

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
    seat.position.y = 0.45;
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
