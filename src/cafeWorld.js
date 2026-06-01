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

const FLOOR = 16;

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
const SEAT_R = 1.5;

// 고양이 외형 프리셋 (id 해시로 결정론적 배정)
const FURS = [
  { fur: '#E8B87A', patt: '#C4823E', type: 'tabby'  },
  { fur: '#F2E3CC', patt: '',        type: 'solid'  },
  { fur: '#F4ECDC', patt: '#D89248', type: 'calico' },
  { fur: '#4A423A', patt: '',        type: 'tuxedo' },
  { fur: '#D98E4E', patt: '',        type: 'solid'  },
  { fur: '#C9A06A', patt: '#7A5230', type: 'tabby'  },
];
const ITEMS = ['laptop', 'book', 'cup', 'knit', 'sketch'];

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
    this._cats = [];          // { sprite, baseY, phase }
    this._isSunset = true;
    this._sunsetMix = 1;

    this._initRenderer();
    this._initCamera();
    this._initScene();
    this._buildRoom();
    this._buildBarista();
    this.scene.add(this._catGroup);

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
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
    this.ISO_POS = new THREE.Vector3(15, 14, 15);
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

    // 먼 건물/지붕 실루엣 (창밖 풍경)
    [[-3.5, 2.4, 3.5], [0.6, 3.4, 3.0], [4.2, 1.8, 4.0]].forEach(([z, h, w]) => {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, h, w),
        new THREE.MeshBasicMaterial({ color: 0x7A5640, fog: false }),
      );
      b.position.set(LX - 3.8, h / 2 + 0.4, z);
      room.add(b);
    });
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
    const machine = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.8), mat(0x8FA89A));
    machine.position.set(-1, 2.7, 0); machine.castShadow = true; counter.add(machine);
    const mTop = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5), mat(0xC8C4BC));
    mTop.position.set(-1, 3.4, 0); counter.add(mTop);
    counter.position.set(4.5, 0, -4); room.add(counter);
    this._counterPos = new THREE.Vector3(4.5, 0, -4);

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
  }

  // ── 카운터 바리스타 (상시 NPC) ───────────────────────────
  _buildBarista() {
    const tex = catTexture('#8B6B4A', '#5A3E28', 'tabby', 'cup', 'sip');
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(1.5, 1.6, 1);
    spr.position.set(3.6, 2.85, -4);
    spr.userData = { baseY: 2.85, phase: 1.2 };
    this.scene.add(spr);
    this._baristaCat = { sprite: spr, baseY: 2.85, phase: 1.2 };
    this._cats.push(this._baristaCat);
  }

  // ── 외부: 내 id / 접속자 목록 / 시점 / 황혼 ────────────────
  setMyId(id) { this._myId = id; }

  /** @param {{id:string,name:string}[]} players 같은 방 접속자(나 포함) */
  setPlayers(players) {
    // 기존 플레이어 고양이/이름표 제거 (바리스타는 별도 보존)
    while (this._catGroup.children.length) {
      const c = this._catGroup.children.pop();
      c.material?.map?.dispose?.();
      c.material?.dispose?.();
    }
    this._cats = this._baristaCat ? [this._baristaCat] : [];

    const list = players.slice(0, TABLES.length * SEATS_PER);
    // 분위기 보강: 혼자/소수일 때 더미 고양이 약간 추가
    const ambiance = list.length <= 1
      ? [{ id: '__amb1', name: '단골', amb: true }, { id: '__amb2', name: '책벌레', amb: true }]
      : [];

    [...list, ...ambiance].forEach((p, gi) => {
      const tableIdx = Math.floor(gi / SEATS_PER) % TABLES.length;
      const seatIdx = gi % SEATS_PER;
      const t = TABLES[tableIdx];
      const ang = (seatIdx / SEATS_PER) * Math.PI * 2 + 0.5;
      const x = t.x + Math.cos(ang) * SEAT_R;
      const z = t.z + Math.sin(ang) * SEAT_R;

      const h = hashStr(p.id);
      const f = FURS[h % FURS.length];
      const item = ITEMS[h % ITEMS.length];
      const expr = (h % 3 === 0) ? 'study' : (h % 3 === 1 ? 'sip' : 'normal');

      const tex = catTexture(f.fur, f.patt, f.type, item, expr);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      spr.scale.set(1.5, 1.6, 1);
      spr.position.set(x, 1.7, z);
      spr.userData = { baseY: 1.7, phase: (h % 700) / 100 };
      this._catGroup.add(spr);
      this._cats.push({ sprite: spr, baseY: 1.7, phase: spr.userData.phase });

      // 이름표
      const nt = nameTag(p.name);
      nt.position.set(x, 2.7, z);
      this._catGroup.add(nt);

      // 내 테이블 기록 (내 자리 시점용)
      if (p.id === this._myId) this._myTableIdx = tableIdx;
    });
  }

  setView(mode) {
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

  // ── 루프 ─────────────────────────────────────────────────
  _animate() {
    this._raf = requestAnimationFrame(() => this._animate());
    const t = this._clock.getElapsedTime();

    // 카메라 부드러운 보간
    this._camPos.lerp(this._tgtPos, 0.045);
    this._camTgt.lerp(this._tgtTgt, 0.045);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camTgt);

    // 고양이 호흡
    this._cats.forEach(c => { c.sprite.position.y = c.baseY + Math.sin(t * 1.5 + c.phase) * 0.04; });

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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ── 고양이 빌보드 텍스처 (데모 동일 + 표정) ─────────────────
function catTexture(fur, patt, type, item, expr = 'normal') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d'); const cx = 64; const OUT = '#3A2418';
  x.lineJoin = x.lineCap = 'round';
  // 그림자
  x.fillStyle = 'rgba(58,36,24,.16)'; x.beginPath(); x.ellipse(cx, 118, 22, 5, 0, 0, 7); x.fill();
  // 꼬리
  x.strokeStyle = OUT; x.lineWidth = 10; x.beginPath(); x.moveTo(cx + 16, 96); x.quadraticCurveTo(cx + 40, 78, cx + 30, 52); x.stroke();
  x.strokeStyle = fur; x.lineWidth = 5.5; x.stroke();
  // 몸통
  ell(x, cx, 92, 26, 24, fur, OUT, 4);
  // 앞발
  ell(x, cx - 16, 110, 11, 8, fur, OUT, 3.5); ell(x, cx + 16, 110, 11, 8, fur, OUT, 3.5);
  // 사물
  drawItem(x, cx, item);
  // 귀
  ear(x, cx - 26, 32, -0.25, fur, OUT); ear(x, cx + 26, 32, 0.25, fur, OUT);
  // 머리
  circ(x, cx, 52, 32, fur, OUT, 4);
  // 무늬
  if (type === 'tabby') {
    x.strokeStyle = patt; x.lineWidth = 4; x.globalAlpha = .8;
    for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(cx + i * 9, 24); x.lineTo(cx + i * 9, 40); x.stroke(); }
    x.globalAlpha = 1;
  }
  if (type === 'tuxedo') { x.fillStyle = '#F2E8DC'; x.beginPath(); x.ellipse(cx, 86, 15, 18, 0, 0, 7); x.fill(); }
  if (type === 'calico') {
    x.fillStyle = patt; x.beginPath(); x.ellipse(cx - 16, 42, 13, 12, 0, 0, 7); x.fill();
    x.fillStyle = '#3E362E'; x.beginPath(); x.ellipse(cx + 14, 58, 11, 13, 0, 0, 7); x.fill();
  }
  // 얼굴 (표정)
  x.strokeStyle = OUT; x.lineWidth = 3;
  if (expr === 'sip') {
    x.beginPath(); x.arc(cx - 11, 53, 5, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
    x.beginPath(); x.arc(cx + 11, 53, 5, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
  } else {
    x.beginPath(); x.arc(cx - 11, 52, 5, Math.PI * .15, Math.PI * .85); x.stroke();
    x.beginPath(); x.arc(cx + 11, 52, 5, Math.PI * .15, Math.PI * .85); x.stroke();
    if (expr === 'study') { x.fillStyle = '#F4ECDC'; drawHeart(x, cx + 26, 34); }
  }
  // 볼
  x.fillStyle = 'rgba(220,150,110,.3)';
  x.beginPath(); x.ellipse(cx - 20, 60, 7, 4, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(cx + 20, 60, 7, 4, 0, 0, 7); x.fill();
  // 코
  x.fillStyle = '#C08070'; x.beginPath(); x.moveTo(cx, 62); x.lineTo(cx - 3, 66); x.lineTo(cx + 3, 66); x.fill();

  const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter; return tex;
}

function ell(x, cx, cy, rx, ry, f, s, lw) { x.fillStyle = f; x.strokeStyle = s; x.lineWidth = lw; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill(); x.stroke(); }
function circ(x, cx, cy, r, f, s, lw) { x.fillStyle = f; x.strokeStyle = s; x.lineWidth = lw; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.stroke(); }
function ear(x, px, py, rot, f, s) { x.save(); x.translate(px, py); x.rotate(rot); x.fillStyle = f; x.strokeStyle = s; x.lineWidth = 4; x.beginPath(); x.moveTo(-13, 12); x.quadraticCurveTo(-3, -16, 12, 9); x.closePath(); x.fill(); x.stroke(); x.fillStyle = '#E8C0A8'; x.beginPath(); x.moveTo(-7, 9); x.quadraticCurveTo(-1, -6, 7, 7); x.closePath(); x.fill(); x.restore(); }
function drawHeart(x, px, py) { x.beginPath(); x.moveTo(px, py + 3); x.bezierCurveTo(px - 4, py - 2, px - 5, py + 1, px, py + 5); x.bezierCurveTo(px + 5, py + 1, px + 4, py - 2, px, py + 3); x.fill(); }
function drawItem(x, cx, item) {
  if (item === 'laptop') {
    x.fillStyle = '#5A6B7A'; x.strokeStyle = '#3A2418'; x.lineWidth = 3;
    x.beginPath(); x.rect(cx - 12, 98, 24, 14); x.fill(); x.stroke();
    x.fillStyle = '#8FA8C8'; x.fillRect(cx - 9, 100, 18, 9);
  } else if (item === 'book') {
    x.fillStyle = '#A6543E'; x.strokeStyle = '#3A2418'; x.lineWidth = 3;
    x.beginPath(); x.rect(cx - 13, 100, 26, 11); x.fill(); x.stroke();
    x.strokeStyle = '#F2E8DC'; x.lineWidth = 1; x.beginPath(); x.moveTo(cx, 101); x.lineTo(cx, 110); x.stroke();
  } else if (item === 'cup') {
    x.fillStyle = '#C89A6A'; x.strokeStyle = '#3A2418'; x.lineWidth = 3;
    x.beginPath(); x.rect(cx - 8, 101, 16, 11); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(143,168,154,.7)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx - 2, 99); x.quadraticCurveTo(cx - 5, 93, cx - 2, 88); x.stroke();
  } else if (item === 'knit') {
    x.fillStyle = '#B5705A'; x.beginPath(); x.arc(cx, 106, 9, 0, 7); x.fill();
    x.strokeStyle = '#9A8C6E'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + 6, 104); x.lineTo(cx + 16, 98); x.stroke();
  } else if (item === 'sketch') {
    x.fillStyle = '#F2E8DC'; x.strokeStyle = '#3A2418'; x.lineWidth = 3;
    x.beginPath(); x.rect(cx - 12, 100, 24, 12); x.fill(); x.stroke();
    x.strokeStyle = '#7B8B5A'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx - 7, 107); x.lineTo(cx + 2, 102); x.lineTo(cx + 8, 108); x.stroke();
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
