/**
 * cafeWorld.js
 * 황혼 책방 카페 — 단면 인형의집 컨셉 (cafe-concept-demo.html 본체 이식)
 *
 * - 퍼스펙티브 아이소뷰, ACES 톤매핑, PCFSoft 그림자, 황혼/주간 토글
 * - 방 = 닫힌 공간(벽 2면·천장 보·창·책장·카운터·펜던트·먼지)
 * - 고양이 = 같은 방의 실제 접속자 (presence) — setPlayers()로 갱신
 * - 카메라: 둘러보기(iso) ↔ 내 자리(desk) 부드러운 보간
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const FLOOR = 16;

// 캐릭터 GLB — "cute cat in cute banana" (걷기 애니 포함, 재생 안 함)
const CAT_GLB     = '/models/cute_cat_in_cute_banana.glb';
const CAT_HEIGHT  = 1.25;   // 목표 높이(월드 유닛)
const CAT_FACE    = 0;      // 모델 정면 보정각(필요시 Math.PI로 뒤집기)

const BASE_FOV = 34;        // 둘러보기/내 자리
const FP_FOV   = 75;        // 1인칭(넓게 — 확대감 완화)

// 에스프레소 머신 GLB (파일명 오타 'Macnine' 그대로)
const COFFEE_GLB  = '/models/CoffeeMacnine_Small.glb';
const MACHINE_H   = 0.85;   // 목표 높이
const MACHINE_POS = { x: 5.3, y: 2.2, z: -4 };  // 카운터 윗면
const MACHINE_FACE = Math.PI / 2;  // 정면이 실내를 향하도록(필요시 조정)

const C = {
  floor1: 0xC9A06A, floor2: 0xB8895C, wall: 0xD9B98C, wallBack: 0xCBA877,
  beam: 0x5A3E28, shelf: 0x6B4A2E,
  book: [0xA6543E, 0x7B8B5A, 0xC98A4A, 0x4A6B7A, 0xB5705A, 0x9A8C6E, 0xC9A35C],
  tableTop: 0xD9B381, tableLeg: 0x5A3E28,
  counter: 0x6B4A2E, counterTop: 0x4A3320,
};

// 테이블 배치 (정원 16 = 4테이블 × 4좌석) — 벽/카운터 피한 중앙부
const TABLES = [
  { x: -3, z: -1 }, { x: 1, z: -1 }, { x: -3, z: 3 }, { x: 1, z: 3 },
];
const SEATS_PER = 4;
const SEAT_R = 1.6;
const SEAT_Y = 0.7;    // 의자 좌석 높이 (캐릭터가 여기 앉음)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 최단 경로 각도 보간 (래핑 처리)
function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) & 0x7fffffff;
  return h;
}

export class CafeWorld {
  constructor(app) {
    this.app = app;
    this._myId = null;
    this._myTableIdx = 0;
    this._catGroup = new THREE.Group();
    this._cats = [];           // { obj, baseY, phase }
    this._isSunset = true;
    this._sunsetMix = 1;
    this._catBase = null;      // 정규화된 GLB 원본(클론용)
    this._pendingPlayers = null; // 모델 로드 전 들어온 setPlayers 보류분

    // 시점: 'iso' | 'desk' | 'fp'(1인칭)
    this._view = 'iso';
    this._mySeat = null;       // { x, z, baseYaw } — 1인칭 기준 좌석
    this._myCatObj = null;     // 내 캐릭터(1인칭에서 시선 따라 회전)
    this._fpYaw = 0; this._fpPitch = 0;
    this._dragging = false;

    // 회전 동기화 (다른 클라이언트에 내 yaw 전송)
    this.onFacing = null;      // (yaw) => void  — main 에서 presence 로 연결
    this._lastSentYaw = null; this._lastSentT = 0;
    this._catById = new Map(); // id → 캐릭터 obj (회전만 갱신용)
    this._lastSig = null;      // 좌석 구성 시그니처

    // 내 캐릭터 클릭-드래그 회전 (1인칭 아닐 때)
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._catDragging = false;

    this._initRenderer();
    this._initCamera();
    this._initScene();
    this._buildRoom();
    this.scene.add(this._catGroup);
    this._loadCatModel();
    this._loadCoffeeMachine();
    this._bindInput();

    this._clock = new THREE.Clock();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._animate();
  }

  // ── 렌더러 ───────────────────────────────────────────────
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.app.appendChild(this.renderer.domElement);
  }

  // ── 카메라 (퍼스펙티브 아이소) ────────────────────────────
  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 100);
    this.ISO_POS = new THREE.Vector3(15, 10, 15);
    this.ISO_TGT = new THREE.Vector3(0, 1.5, 0);
    this.camera.position.copy(this.ISO_POS);
    this._camPos = this.ISO_POS.clone();
    this._camTgt = this.ISO_TGT.clone();
    this._tgtPos = this.ISO_POS.clone();
    this._tgtTgt = this.ISO_TGT.clone();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x3a2418, 22, 48);

    this.ambient = new THREE.AmbientLight(0xFFE0B0, 0.68);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xFF9D4D, 2.4);
    this.sun.position.set(-14, 9, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 60;
    this.sun.shadow.camera.left = -18; this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 18; this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);

    const warmFill = new THREE.PointLight(0xFFB860, 1.3, 30);
    warmFill.position.set(3, 6, 2);
    this.scene.add(warmFill);
    const coolFill = new THREE.DirectionalLight(0x8FA8C8, 0.3);
    coolFill.position.set(10, 6, -6);
    this.scene.add(coolFill);
    const bulb = new THREE.PointLight(0xFFCB7A, 0.9, 12);
    bulb.position.set(-1, 4.6, 0);
    this.scene.add(bulb);

    // 황혼/주간 보간용 색
    this.SUN_SUNSET = { col: new THREE.Color(0xFF9D4D), int: 2.4, amb: new THREE.Color(0xFFE0B0), ambI: 0.68, bg: new THREE.Color(0x3a2418), win: new THREE.Color(0xFFCB85) };
    this.SUN_DAY    = { col: new THREE.Color(0xFFF0D8), int: 1.7, amb: new THREE.Color(0xFFF4E2), ambI: 0.85, bg: new THREE.Color(0xBFA988), win: new THREE.Color(0xEAF2FF) };
  }

  // ── 공간 (바닥/벽/보/창/책장/카운터/펜던트/먼지) ──────────
  _buildRoom() {
    const room = new THREE.Group();
    this.scene.add(room);

    // 바닥 — 나무 타일 체커
    for (let x = 0; x < FLOOR; x++) for (let z = 0; z < FLOOR; z++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), mat((x + z) % 2 ? C.floor1 : C.floor2));
      t.position.set(x - FLOOR / 2 + 0.5, -0.15, z - FLOOR / 2 + 0.5);
      t.receiveShadow = true;
      room.add(t);
    }

    // 벽 2면
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(FLOOR, 9, 0.4), mat(C.wallBack));
    backWall.position.set(0, 4.5, -FLOOR / 2); backWall.receiveShadow = true; room.add(backWall);
    // 좌벽 — 창 개구부(hole)를 남기고 4조각으로: 진짜로 뚫어 빛이 들어오게
    //   개구부: z ∈ [-3, 5] (폭 8), y ∈ [2, 7] (높이 5)
    const LX = -FLOOR / 2;
    const wallSeg = (h, d, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, d), mat(C.wall));
      m.position.set(LX, y, z);
      m.castShadow = true;        // 개구부로 들어온 햇빛이 바닥에 빛 기둥을 만들도록
      m.receiveShadow = true;
      room.add(m);
    };
    wallSeg(2, FLOOR, 1, 0);      // 하단 띠 (y 0~2)
    wallSeg(2, FLOOR, 8, 0);      // 상단 띠 (y 7~9)
    wallSeg(5, 5, 4.5, -5.5);     // 개구부 앞쪽 (z -8~-3)
    wallSeg(5, 3, 4.5, 6.5);      // 개구부 뒤쪽 (z 5~8)

    // 천장 보
    for (let i = 0; i < 5; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(FLOOR, 0.4, 0.5), mat(C.beam));
      beam.position.set(0, 8.6, -6 + i * 3); room.add(beam);
    }

    // 개구부 바깥 — 진짜로 보이는 하늘/노을 (발광 배경, fog 제외) + 먼 실루엣
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 16),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.DoubleSide, fog: false }),
    );
    sky.rotation.y = Math.PI / 2;     // 좌벽과 평행, 실내를 향함
    sky.position.set(LX - 7, 5, 1);
    room.add(sky);
    this.windowGlow = sky;            // 황혼/주간 토글이 하늘 색을 틴트

    // 얇은 창 가장자리 프레임(개구부 테두리만 — 유리는 없음)
    const edgeMat = mat(0x4A3320);
    const edge = (h, d, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, d), edgeMat);
      m.position.set(LX, y, z); room.add(m);
    };
    edge(0.18, 8, 2.05, 1);   // 하단 테두리
    edge(0.18, 8, 6.95, 1);   // 상단 테두리
    edge(5, 0.18, 4.5, -2.95); // 앞 세로
    edge(5, 0.18, 4.5, 4.95);  // 뒤 세로

    // 책장 2개
    this._buildBookshelf(room, -4);
    this._buildBookshelf(room, 0.5);

    // 카운터 + 에스프레소 머신
    const counter = new THREE.Group();
    const cBody = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 1.6), mat(C.counter));
    cBody.position.y = 1; cBody.castShadow = true; counter.add(cBody);
    const cTop = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.2, 1.9), mat(C.counterTop));
    cTop.position.y = 2.1; counter.add(cTop);
    counter.position.set(4.5, 0, -4); room.add(counter);
    this._counterPos = new THREE.Vector3(4.5, 0, -4);
    // 에스프레소 머신은 GLB 로 카운터 위에 배치 (_loadCoffeeMachine)

    // 펜던트 조명
    this._buildPendant(room, -1, 0);
    this._buildPendant(room, 2.5, 2);

    // 테이블 (고정) — 좌석은 setPlayers 가 채움
    TABLES.forEach(t => this._buildTable(room, t.x, t.z));

    // 먼지 파티클
    const dustN = 120;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 16;
      dustPos[i * 3 + 1] = Math.random() * 8;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this._dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xFFD9A0, size: 0.06, transparent: true, opacity: 0.6,
    }));
    this.scene.add(this._dust);
  }

  _buildBookshelf(room, px) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 6, 1), mat(C.shelf));
    frame.position.y = 3; frame.castShadow = true; g.add(frame);
    for (let row = 0; row < 4; row++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 1.05), mat(0x4A3320));
      shelf.position.set(0, 1 + row * 1.4, 0); g.add(shelf);
      let bx = -1.4;
      let seed = Math.abs(Math.round(px * 31 + row * 17));
      while (bx < 1.3) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const h = 0.7 + (seed % 50) / 100, w = 0.16 + (seed % 12) / 100;
        const bk = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.7), mat(C.book[seed % C.book.length]));
        bk.position.set(bx + w / 2, 1 + row * 1.4 + 0.06 + h / 2, 0);
        bk.castShadow = true; g.add(bk); bx += w + 0.02;
      }
    }
    g.position.set(px, 0, -FLOOR / 2 + 0.9);
    room.add(g);
  }

  _buildPendant(room, px, pz) {
    const g = new THREE.Group();
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4), mat(0x2A1C12));
    wire.position.y = 7.2; g.add(wire);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 16, 1, true), mat(0xC89A6A));
    shade.position.y = 6; g.add(shade);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xFFE3A8 }));
    glow.position.y = 5.8; g.add(glow);
    g.position.set(px, 0, pz); room.add(g);
  }

  _buildTable(room, px, pz) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.16, 20), mat(C.tableTop));
    top.position.y = 1.15; top.castShadow = top.receiveShadow = true; g.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.15), mat(C.tableLeg));
    leg.position.y = 0.57; g.add(leg);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), mat(C.tableLeg));
    base.position.y = 0.05; g.add(base);
    const plant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2), mat(0xA86844));
    plant.position.set(0.5, 1.33, 0.4); g.add(plant);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18), mat(0x7A8B5A));
    leaf.position.set(0.5, 1.55, 0.4); g.add(leaf);
    g.position.set(px, 0, pz); room.add(g);

    // 좌석마다 의자 (테이블 중심을 향함)
    for (let i = 0; i < SEATS_PER; i++) {
      const ang = (i / SEATS_PER) * Math.PI * 2 + 0.5;
      const cx = px + Math.cos(ang) * SEAT_R;
      const cz = pz + Math.sin(ang) * SEAT_R;
      this._buildChair(room, cx, cz, Math.atan2(px - cx, pz - cz));
    }
  }

  // 의자 (등받이는 테이블 반대쪽) — faceAngle: 로컬 +z 가 테이블을 향함
  _buildChair(room, x, z, faceAngle) {
    const g = new THREE.Group();
    const woodM = mat(C.tableLeg);
    const padM = mat(0xB5705A);
    // 좌판
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.46), padM);
    seat.position.y = SEAT_Y; seat.castShadow = true; seat.receiveShadow = true; g.add(seat);
    // 다리 4개
    [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, SEAT_Y, 6), woodM);
      leg.position.set(lx, SEAT_Y / 2, lz); leg.castShadow = true; g.add(leg);
    });
    // 등받이 (로컬 -z = 테이블 반대편)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.07), woodM);
    back.position.set(0, SEAT_Y + 0.27, -0.2); back.castShadow = true; g.add(back);

    g.position.set(x, 0, z);
    g.rotation.y = faceAngle;
    room.add(g);
  }

  // ── GLB 캐릭터 로드 (애니메이션은 재생하지 않음) ──────────
  _loadCatModel() {
    new GLTFLoader().load(CAT_GLB, (gltf) => {
      const model = gltf.scene;

      // 정규화: 목표 높이로 스케일, x/z 중심정렬, 바닥을 y=0 에
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s = CAT_HEIGHT / (size.y || 1);
      model.scale.setScalar(s);
      const box2 = new THREE.Box3().setFromObject(model);
      const c = box2.getCenter(new THREE.Vector3());
      model.position.x -= c.x;
      model.position.z -= c.z;
      model.position.y -= box2.min.y;

      // 그림자 + 머테리얼 보정(메탈 0 → 어둡게 죽는 것 방지)
      model.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(mm => { if (mm && 'metalness' in mm) mm.metalness = 0; });
      });

      // 원본은 클론 기준이 되도록 Group 으로 감싸 둠 (애니메이션 믹서 생성 안 함)
      this._catBase = new THREE.Group();
      this._catBase.add(model);

      // 바리스타 배치 + 보류된 플레이어 반영
      this._placeBarista();
      if (this._pendingPlayers) { this.setPlayers(this._pendingPlayers); this._pendingPlayers = null; }
    }, undefined, (err) => {
      console.error('[CafeWorld] 캐릭터 GLB 로드 실패:', err);
    });
  }

  // GLB 클론 인스턴스 1개 생성 (좌석 위치/방향)
  _makeCat(x, z, faceTargetX, faceTargetZ) {
    const inst = cloneSkeleton(this._catBase);
    inst.position.set(x, 0, z);
    inst.rotation.y = Math.atan2(faceTargetX - x, faceTargetZ - z) + CAT_FACE;
    return inst;
  }

  // ── 에스프레소 머신 GLB (따뜻한 브라스/우드 머테리얼) ──────
  _loadCoffeeMachine() {
    new GLTFLoader().load(COFFEE_GLB, (gltf) => {
      const model = gltf.scene;

      // 머테리얼: 원본 밝기별로 황혼 카페에 맞는 브라스/크림/우드로 매핑
      model.traverse(o => {
        if (!o.isMesh || !o.material) return;
        o.castShadow = true; o.receiveShadow = true;
        const src = Array.isArray(o.material) ? o.material : [o.material];
        const mapped = src.map(m => {
          const hsl = { h: 0, s: 0, l: 0 };
          (m.color ?? new THREE.Color(0.5, 0.5, 0.5)).getHSL(hsl);
          let color, metalness, roughness;
          if (hsl.l > 0.62) {            // 밝은 부분 → 웜 크림 크롬
            color = 0xEAD9BE; metalness = 0.45; roughness = 0.32;
          } else if (hsl.l > 0.33) {     // 본체 → 브라스/카퍼
            color = 0xC0894A; metalness = 0.5; roughness = 0.38;
          } else {                       // 어두운 부분/베이스 → 다크 월넛
            color = 0x4A3320; metalness = 0.2; roughness = 0.6;
          }
          return new THREE.MeshStandardMaterial({
            color, metalness, roughness, map: m.map ?? null,
          });
        });
        o.material = Array.isArray(o.material) ? mapped : mapped[0];
      });

      // 정규화: 목표 높이로 스케일, x/z 중심정렬, 바닥 y=0
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(MACHINE_H / (size.y || 1));
      const box2 = new THREE.Box3().setFromObject(model);
      const c = box2.getCenter(new THREE.Vector3());
      model.position.x -= c.x;
      model.position.z -= c.z;
      model.position.y -= box2.min.y;

      const holder = new THREE.Group();
      holder.add(model);
      holder.position.set(MACHINE_POS.x, MACHINE_POS.y, MACHINE_POS.z);
      holder.rotation.y = MACHINE_FACE;
      this.scene.add(holder);
    }, undefined, (err) => {
      console.error('[CafeWorld] 커피머신 GLB 로드 실패:', err);
    });
  }

  // ── 카운터 바리스타 (상시 NPC) ───────────────────────────
  _placeBarista() {
    if (!this._catBase) return;
    const inst = this._makeCat(3.6, -4, 0, 0); // 실내(원점)를 바라봄
    inst.position.y = 2.1;                       // 카운터 위
    this.scene.add(inst);
    this._baristaCat = { obj: inst, baseY: 2.1, phase: 1.2 };
    this._cats.push(this._baristaCat);
  }

  // ── 외부: 내 id / 접속자 목록 / 시점 / 황혼 ────────────────
  setMyId(id) { this._myId = id; }

  /** @param {{id:string,name:string,yaw?:number}[]} players 같은 방 접속자(나 포함) */
  setPlayers(players) {
    // 모델 로드 전이면 보류 후 로드 완료 시 반영
    if (!this._catBase) { this._pendingPlayers = players; return; }

    // 모든 클라이언트가 동일한 좌석 배정을 갖도록 id 기준 전역 정렬
    const sorted = players
      .slice(0, TABLES.length * SEATS_PER)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const ambiance = sorted.length <= 1
      ? [{ id: '__amb1', name: '단골' }, { id: '__amb2', name: '책벌레' }]
      : [];
    const seated = [...sorted, ...ambiance];

    // 구성(누가 어느 자리)이 같으면 리빌드 없이 회전만 갱신 (성능/깜빡임 방지)
    const sig = seated.map(p => p.id).join(',');
    if (sig === this._lastSig && this._catById.size) {
      this._applyFacings(seated);
      return;
    }
    this._lastSig = sig;

    // 기존 플레이어 캐릭터/이름표 제거 (바리스타는 scene 에 별도 보존)
    while (this._catGroup.children.length) {
      const c = this._catGroup.children.pop();
      c.traverse?.(o => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose?.());
      });
      c.material?.map?.dispose?.();
      c.material?.dispose?.();
    }
    this._cats = this._baristaCat ? [this._baristaCat] : [];
    this._myCatObj = null;
    this._catById.clear();

    seated.forEach((p, gi) => {
      const tableIdx = Math.floor(gi / SEATS_PER) % TABLES.length;
      const seatIdx = gi % SEATS_PER;
      const t = TABLES[tableIdx];
      const ang = (seatIdx / SEATS_PER) * Math.PI * 2 + 0.5;
      const x = t.x + Math.cos(ang) * SEAT_R;
      const z = t.z + Math.sin(ang) * SEAT_R;

      // GLB 캐릭터 (의자 위, 테이블 중심을 바라봄)
      const inst = this._makeCat(x, z, t.x, t.z);
      inst.position.y = SEAT_Y;
      this._catGroup.add(inst);
      const phase = (hashStr(p.id) % 700) / 100;
      this._cats.push({ obj: inst, baseY: SEAT_Y, phase });
      this._catById.set(p.id, inst);

      // 이름표 (의자에 앉은 높이 기준)
      const nt = nameTag(p.name);
      nt.position.set(x, SEAT_Y + CAT_HEIGHT + 0.4, z);
      this._catGroup.add(nt);

      if (p.id === this._myId) {
        this._myTableIdx = tableIdx;
        this._mySeat = { x, z, baseYaw: Math.atan2(t.x - x, t.z - z) };
        this._myCatObj = inst;
      }
    });

    this._applyFacings(seated);
  }

  // 동기화된 yaw 를 목표각으로 저장 (animate 에서 보간) — 내 캐릭터는 로컬 담당
  _applyFacings(seated) {
    seated.forEach(p => {
      if (p.id === this._myId) return;
      const inst = this._catById.get(p.id);
      if (!inst || typeof p.yaw !== 'number') return;
      if (inst.userData.targetYaw === undefined) inst.rotation.y = p.yaw; // 첫 등장 즉시
      inst.userData.targetYaw = p.yaw;
    });
  }

  setView(mode) {
    this._view = mode;
    if (mode === 'fp') {
      // 1인칭: 내 좌석 기준 (없으면 기본 좌석)
      this._fpYaw = 0; this._fpPitch = 0;
      if (!this._mySeat) {
        const t = TABLES[0], ang = 0.5;
        const x = t.x + Math.cos(ang) * SEAT_R, z = t.z + Math.sin(ang) * SEAT_R;
        this._mySeat = { x, z, baseYaw: Math.atan2(t.x - x, t.z - z) };
      }
      this.camera.fov = FP_FOV;          // 넓게 (확대감 완화)
      this.camera.updateProjectionMatrix();
      return;
    }
    // 1인칭에서 빠져나오면 내 캐릭터를 다시 테이블 쪽으로 + FOV 복귀
    if (this._myCatObj && this._mySeat) {
      this._myCatObj.rotation.y = this._mySeat.baseYaw + CAT_FACE;
    }
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();
    if (mode === 'desk') {
      const t = TABLES[this._myTableIdx] || TABLES[0];
      this._tgtPos = new THREE.Vector3(t.x + 3.7, 6.5, t.z + 7.7);
      this._tgtTgt = new THREE.Vector3(t.x, 1.2, t.z);
    } else {
      this._tgtPos = this.ISO_POS.clone();
      this._tgtTgt = this.ISO_TGT.clone();
    }
  }

  toggleSunset() { this._isSunset = !this._isSunset; return this._isSunset; }

  // ── 1인칭 입력 (마우스 드래그 + 방향키로 좌우·상하 둘러보기) ──
  _bindInput() {
    const YAW_LIM = 3, PITCH_LIM = 0.7;
    const el = this.renderer.domElement;

    this._onDown = (e) => {
      this._dragging = true; this._lx = e.clientX; this._ly = e.clientY;
      // 1인칭이 아닐 때: 내 캐릭터를 클릭했는지 판정 → 드래그로 회전
      this._catDragging = false;
      if (this._view !== 'fp' && this._myCatObj) {
        this._ndc.set(
          (e.clientX / window.innerWidth) * 2 - 1,
          -(e.clientY / window.innerHeight) * 2 + 1,
        );
        this._ray.setFromCamera(this._ndc, this.camera);
        if (this._ray.intersectObject(this._myCatObj, true).length > 0) {
          this._catDragging = true;
          el.style.cursor = 'grabbing';
        }
      }
    };
    this._onUp = () => { this._dragging = false; this._catDragging = false; el.style.cursor = ''; };
    this._onMove = (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lx, dy = e.clientY - this._ly;
      this._lx = e.clientX; this._ly = e.clientY;
      if (this._view === 'fp') {
        this._fpYaw   = clamp(this._fpYaw   - dx * 0.004, -YAW_LIM, YAW_LIM);
        this._fpPitch = clamp(this._fpPitch - dy * 0.003, -PITCH_LIM, PITCH_LIM);
        return;
      }
      // 1인칭 아님: 내 캐릭터 클릭-드래그 회전
      if (this._catDragging && this._myCatObj) {
        this._myCatObj.rotation.y -= dx * 0.01;
      }
    };
    this._onKey = (e) => {
      if (this._view !== 'fp') return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const S = 0.07;
      if (e.key === 'ArrowLeft')  this._fpYaw   = clamp(this._fpYaw   + S, -YAW_LIM, YAW_LIM);
      if (e.key === 'ArrowRight') this._fpYaw   = clamp(this._fpYaw   - S, -YAW_LIM, YAW_LIM);
      if (e.key === 'ArrowUp')    this._fpPitch = clamp(this._fpPitch + S, -PITCH_LIM, PITCH_LIM);
      if (e.key === 'ArrowDown')  this._fpPitch = clamp(this._fpPitch - S, -PITCH_LIM, PITCH_LIM);
      if (e.key.startsWith('Arrow')) e.preventDefault();
    };

    el.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('keydown', this._onKey);
  }

  // ── 루프 ─────────────────────────────────────────────────
  _animate() {
    this._raf = requestAnimationFrame(() => this._animate());
    const t = this._clock.getElapsedTime();

    // 카메라 — 1인칭은 직접 제어, iso/desk 는 부드러운 보간
    if (this._view === 'fp' && this._mySeat) {
      const s = this._mySeat;
      const yaw = s.baseYaw + this._fpYaw, pitch = this._fpPitch;
      const cp = Math.cos(pitch);
      const dir = new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
      // 내 캐릭터 몸통을 시선(수평)으로 회전 — 자연스럽게 같이 돌게
      if (this._myCatObj) this._myCatObj.rotation.y = yaw + CAT_FACE;
      // 카메라: 머리 높이에서 시선 전방으로 살짝 빼 모델에 안 파묻히게
      const headY = SEAT_Y + CAT_HEIGHT * 0.86;     // 머리 부근
      const fwd = 0.55;                             // 얼굴 앞으로
      const eye = new THREE.Vector3(
        s.x + Math.sin(yaw) * fwd, headY, s.z + Math.cos(yaw) * fwd,
      );
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().add(dir));
      this._camPos.copy(eye);                 // 복귀 시 보간 연속성
      this._camTgt.copy(eye.clone().add(dir));
    } else {
      this._camPos.lerp(this._tgtPos, 0.045);
      this._camTgt.lerp(this._tgtTgt, 0.045);
      this.camera.position.copy(this._camPos);
      this.camera.lookAt(this._camTgt);
    }

    // 캐릭터 호흡 (바닥 안 꺼지게 위로만 살짝)
    this._cats.forEach(c => {
      c.obj.position.y = c.baseY + (Math.sin(t * 1.5 + c.phase) * 0.5 + 0.5) * 0.03;
    });

    // 다른 플레이어 캐릭터 회전 보간 (동기화된 목표각으로 부드럽게)
    this._catById.forEach((obj, id) => {
      if (id === this._myId) return;
      const tgt = obj.userData.targetYaw;
      if (typeof tgt === 'number') obj.rotation.y = lerpAngle(obj.rotation.y, tgt, 0.18);
    });

    // 내 캐릭터 방향(yaw)을 다른 클라이언트로 전송 — 변할 때만, 쓰로틀(180ms)
    if (this.onFacing && this._myCatObj) {
      const y = this._myCatObj.rotation.y;
      const now = performance.now();
      if ((this._lastSentYaw === null || Math.abs(y - this._lastSentYaw) > 0.05)
          && now - this._lastSentT > 180) {
        this._lastSentYaw = y; this._lastSentT = now;
        this.onFacing(y);
      }
    }

    // 먼지 상승
    const dp = this._dust.geometry.attributes.position.array;
    for (let i = 0; i < dp.length; i += 3) { dp[i + 1] += 0.004; if (dp[i + 1] > 8) dp[i + 1] = 0; }
    this._dust.geometry.attributes.position.needsUpdate = true;

    // 황혼 ↔ 주간 보간
    const target = this._isSunset ? 1 : 0;
    this._sunsetMix += (target - this._sunsetMix) * 0.04;
    const m = this._sunsetMix, D = this.SUN_DAY, S = this.SUN_SUNSET;
    this.sun.color.lerpColors(D.col, S.col, m);
    this.sun.intensity = D.int + (S.int - D.int) * m;
    this.ambient.color.lerpColors(D.amb, S.amb, m);
    this.ambient.intensity = D.ambI + (S.ambI - D.ambI) * m;
    this.scene.fog.color.lerpColors(D.bg, S.bg, m);
    this.renderer.setClearColor(this.scene.fog.color);
    this.windowGlow.material.color.lerpColors(D.win, S.win, m);
    const tl = document.getElementById('timeLabel');
    if (tl) tl.textContent = m > 0.5 ? '☀ 해질녘 5:47 PM ☀' : '☀ 한낮 2:14 PM ☀';

    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('mouseup', this._onUp);
    window.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('keydown', this._onKey);
    this.renderer.domElement.removeEventListener('mousedown', this._onDown);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// 창밖 하늘 그라디언트 (위 노을 → 아래 따뜻한 크림)
function makeSkyTexture() {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#E87A3E');   // 상단 진한 노을
  g.addColorStop(0.45, '#FFB066');
  g.addColorStop(0.8, '#FFD9A0');
  g.addColorStop(1.0, '#FFE9C8');   // 지평선 근처 밝게
  x.fillStyle = g; x.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function nameTag(name) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32;
  const x = cv.getContext('2d');
  x.fillStyle = 'rgba(40,26,16,.7)';
  const r = 8, w = 128, h = 32;
  x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, h, r); x.arcTo(w, h, 0, h, r); x.arcTo(0, h, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.fill();
  x.fillStyle = '#FFE6C2'; x.font = '600 13px "DM Sans", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(name).slice(0, 10), 64, 17);
  const tex = new THREE.CanvasTexture(cv);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.1, 0.28, 1);
  return s;
}
