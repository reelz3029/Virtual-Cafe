/**
 * scenes/cafeScene.js
 * 카페 씬 — Three.js 2.5D 아이소메트릭 스타일
 *
 * [최적화]
 * - 바닥: 개별 BoxGeometry 625개 → 단일 PlaneGeometry + Canvas 체크무늬 텍스처
 * - 같은 material 재사용 (materialCache)
 * - 캐릭터 업데이트: 전체 재생성 대신 diff 방식
 * - Geometry는 씬 초기화 시 1회 생성 후 재사용
 */

import * as THREE from 'three';
import {
  createCharacterSprite,
  createNameTag,
  createCoffeeSprite,
} from '../utils/characterRenderer.js';
import { store } from '../store/gameStore.js';

// ── 씬 상수 ─────────────────────────────────────────────────
const TILE_SIZE   = 1.6;
const TABLE_R     = 0.45;   // 원형 탁자 반경
const SEAT_DIST   = 0.68;   // 좌석 ↔ 탁자 중심 거리
const COUNTER_R   = 1.2;
const SEATS_PER_TABLE = 4;  // 테이블당 기본 좌석 수

// 씬 팔레트
const C = {
  floor1:      0xF5EDD8,
  floor2:      0xEDE3CC,
  wall:        0xD9CAAA,
  wallDark:    0xC4B490,
  counter:     0x8B6A3A,
  counterSide: 0x6A4E28,
  table:       0xC8A870,
  tableLeg:    0xA07840,
  chair:       0xE8D5AA,
  chairBack:   0xD4BC8A,
  plant:       0x6DA87A,
  pot:         0xC8805A,
  window:      0xD0E8F8,
  lampBase:    0x6A5040,
  lampShade:   0xF0D090,
  coffeeMachine: 0x4A3828,
};

// ── Material 캐시 (재사용으로 draw call 절감) ───────────────
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
    this.tables = new Map();                 // tableId → { group, seats, position, seatCount }
    this.characterSprites = new Map();       // userId → { group, sprite, nameTag }
    this._tableCount = 0;
    this._raycaster = new THREE.Raycaster(); // 재사용

    this._setupLights();
    this._buildInitialScene(8);
  }

  // ── 라이트 설정 ────────────────────────────────────────────
  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xFFF5E8, 0.75));

    const sun = new THREE.DirectionalLight(0xFFE8C0, 1.1);
    sun.position.set(3, 8, 4);
    sun.castShadow = false;
    this.scene.add(sun);

    // 카운터 포인트 라이트
    const cl = new THREE.PointLight(0xFFD080, 1.2, 8);
    cl.position.set(0, 2, 0);
    this.scene.add(cl);

    const fill = new THREE.DirectionalLight(0xC8D8F0, 0.25);
    fill.position.set(-3, 4, -2);
    this.scene.add(fill);
  }

  // ── 씬 초기 빌드 ──────────────────────────────────────────
  _buildInitialScene(tableCount) {
    this._buildFloor();
    this._buildWalls();
    this._buildCounter();
    this._buildDecorations();
    this._buildTables(tableCount);
    this._tableCount = tableCount;
  }

  // ── 바닥 [최적화: 단일 mesh + Canvas 텍스처] ───────────────
  _buildFloor() {
    const size = 22;                  // 총 타일 수 (size × size)
    const tileCount = size;           // 한 방향 타일 수
    const totalPx   = tileCount * 32; // 텍스처 해상도 (32px/타일)

    // Canvas로 체크무늬 텍스처 1장 생성
    const canvas = document.createElement('canvas');
    canvas.width  = totalPx;
    canvas.height = totalPx;
    const ctx = canvas.getContext('2d');

    const c1 = '#F5EDD8';
    const c2 = '#EDE3CC';
    for (let x = 0; x < tileCount; x++) {
      for (let z = 0; z < tileCount; z++) {
        ctx.fillStyle = (x + z) % 2 === 0 ? c1 : c2;
        ctx.fillRect(x * 32, z * 32, 32, 32);
      }
    }
    // 타일 경계선
    ctx.strokeStyle = 'rgba(180,160,120,0.18)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= tileCount; i++) {
      ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, totalPx); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 32); ctx.lineTo(totalPx, i * 32); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

    const geo = new THREE.PlaneGeometry(tileCount * TILE_SIZE, tileCount * TILE_SIZE);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    mesh.name = 'floor';
    this.scene.add(mesh);
  }

  // ── 벽 ───────────────────────────────────────────────────
  _buildWalls() {
    const wallH = 2.5, wallW = 22;

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(wallW, wallH, 0.15),
      mat(C.wall)
    );
    back.position.set(0, wallH / 2, -9);
    this.scene.add(back);

    const left = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, wallH, wallW),
      mat(C.wallDark)
    );
    left.position.set(-9, wallH / 2, 0);
    this.scene.add(left);

    // 천장 몰딩
    const molding = new THREE.Mesh(
      new THREE.BoxGeometry(wallW, 0.1, 0.2),
      mat(0xC8B880)
    );
    molding.position.set(0, wallH - 0.05, -8.9);
    this.scene.add(molding);

    this._addWindows();
  }

  _addWindows() {
    const glassMat = new THREE.MeshLambertMaterial({
      color: C.window, transparent: true, opacity: 0.6,
    });
    [-4, 0, 4].forEach(x => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.0, 0.08), mat(0x8A7850));
      frame.position.set(x, 1.4, -8.92);
      this.scene.add(frame);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.06), glassMat);
      glass.position.set(x, 1.4, -8.89);
      this.scene.add(glass);

      const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.1), mat(0x8A7850));
      hBar.position.set(x, 1.4, -8.88);
      this.scene.add(hBar);
    });
  }

  // ── 카운터 ───────────────────────────────────────────────
  _buildCounter() {
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(COUNTER_R + 0.15, COUNTER_R + 0.15, 0.12, 32),
      mat(C.counter)
    );
    top.position.set(0, 0.98, 0);
    this.scene.add(top);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(COUNTER_R, COUNTER_R, 0.9, 32),
      mat(C.counterSide)
    );
    body.position.set(0, 0.5, 0);
    this.scene.add(body);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(COUNTER_R + 0.05, COUNTER_R + 0.05, 0.06, 32),
      mat(C.counter)
    );
    base.position.set(0, 0.04, 0);
    this.scene.add(base);

    this._buildCoffeeMachine();
    this._buildMenuBoard();
  }

  _buildCoffeeMachine() {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.28), mat(C.coffeeMachine));
    body.position.set(-0.2, 1.23, 0);
    this.scene.add(body);

    const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), mat(0x888888));
    wand.position.set(0.05, 1.28, 0);
    wand.rotation.z = 0.3;
    this.scene.add(wand);

    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.2), mat(0x888888));
    tray.position.set(-0.2, 1.06, 0);
    this.scene.add(tray);
  }

  _buildMenuBoard() {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.06), mat(0x2A1A0A));
    board.position.set(0, 1.8, -0.4);
    board.rotation.x = 0.15;
    this.scene.add(board);
  }

  // ── 장식 요소들 ──────────────────────────────────────────
  _buildDecorations() {
    [[-7, -7], [7, -7], [-7, 7], [7, 7]].forEach(([x, z]) => this._addPlant(x, z));
    [[-5, -5], [5, -5]].forEach(([x, z]) => this._addLamp(x, z));
    this._addBookshelf(-7, -8);
  }

  _addPlant(x, z) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.15, 0.35, 12), mat(C.pot)
    );
    pot.position.set(x, 0.18, z);
    this.scene.add(pot);

    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.04, 12), mat(0x5A3A20)
    );
    soil.position.set(x, 0.37, z);
    this.scene.add(soil);

    // 화분 식물을 단일 merged mesh로 처리 (SphereGeometry 5개 → 1개 그룹)
    const plantGroup = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const r = 0.1 + (i % 3) * 0.04;
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.11 + (i % 2) * 0.04, 6, 5), mat(C.plant)
      );
      leaf.position.set(Math.cos(angle) * r, 0.6 + (i % 2) * 0.12, Math.sin(angle) * r);
      plantGroup.add(leaf);
    }
    plantGroup.position.set(x, 0, z);
    this.scene.add(plantGroup);
  }

  _addLamp(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), mat(C.lampBase)
    );
    pole.position.set(x, 0.8, z);
    this.scene.add(pole);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12), mat(C.lampBase)
    );
    base.position.set(x, 0.03, z);
    this.scene.add(base);

    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.35, 12, 1, true), mat(C.lampShade)
    );
    shade.position.set(x, 1.75, z);
    this.scene.add(shade);

    // 조명 수를 줄여 성능 개선 (PointLight는 비용이 큼)
    const light = new THREE.PointLight(0xFFD080, 0.6, 3.0);
    light.position.set(x, 1.55, z);
    this.scene.add(light);
  }

  _addBookshelf(x, z) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 0.3), mat(0x6A4A28));
    shelf.position.set(x, 0.75, z);
    this.scene.add(shelf);

    const bookColors = [0xC84848, 0x4878C8, 0x48A870, 0xE8B048, 0xA848C8];
    let bx = x - 0.7;
    for (let i = 0; i < 7; i++) {
      const w = 0.1 + (i % 3) * 0.03;
      const h = 0.28 + (i % 4) * 0.05;
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.24),
        mat(bookColors[i % bookColors.length])
      );
      book.position.set(bx + w / 2, 0.5 + h / 2, z);
      this.scene.add(book);
      bx += w + 0.02;
    }
  }

  // ── 테이블 배치 ──────────────────────────────────────────
  _buildTables(count) {
    const positions = this._generateTablePositions(count);
    positions.forEach((pos, i) => {
      this._createTable(`table_${i}`, pos.x, pos.z, SEATS_PER_TABLE);
    });
  }

  _generateTablePositions(count) {
    const positions = [];
    const ring1 = Math.min(6, count);
    for (let i = 0; i < ring1; i++) {
      const angle = (i / ring1) * Math.PI * 2 + Math.PI / ring1;
      const r = 2.5 + (i % 2) * 0.3;
      positions.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
    }
    if (count > 6) {
      const ring2 = count - 6;
      for (let i = 0; i < ring2; i++) {
        const angle = (i / ring2) * Math.PI * 2;
        const r = 4.6 + (i % 2) * 0.4;
        positions.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
      }
    }
    return positions.slice(0, count);
  }

  /** 원형 탁자 + 의자 생성 (seatCount만큼 의자 배치) */
  _createTable(tableId, x, z, seatCount = SEATS_PER_TABLE) {
    const group = new THREE.Group();
    group.name = tableId;
    group.position.set(x, 0, z);

    // 탁자 다리
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.7, 8), mat(C.tableLeg)
    );
    leg.position.y = 0.35;
    group.add(leg);

    // 다리 받침 (X자)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.06), mat(C.tableLeg));
      foot.position.set(Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12);
      foot.rotation.y = a;
      group.add(foot);
    }

    // 탁자 상판 — userData에 tableId 저장 (레이캐스트 대상)
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.06, 24),
      mat(C.table)
    );
    top.position.y = 0.72;
    top.userData.tableId = tableId; // 레이캐스트 클릭 감지용
    group.add(top);

    // 상판 테두리
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_R, 0.025, 8, 24), mat(C.tableLeg)
    );
    rim.position.y = 0.72;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    // 의자 & 좌석 정보 생성
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

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.36), mat(C.chair));
    seat.position.y = 0.42;
    group.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.04), mat(C.chairBack));
    back.position.set(0, 0.65, -0.16);
    group.add(back);

    [[-0.16, -0.15], [0.16, -0.15], [-0.16, 0.15], [0.16, 0.15]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), mat(C.tableLeg));
      leg.position.set(lx, 0.2, lz);
      group.add(leg);
    });

    return group;
  }

  // ── 캐릭터 관리 ──────────────────────────────────────────

  /**
   * 캐릭터 추가 또는 업데이트 (diff 방식 — 위치/외형 변경 시만 재생성)
   * @param {{ id, username, avatar, tableId, seatIndex, isMe, heldCoffee }} userInfo
   */
  updateCharacter(userInfo) {
    const { id, username, avatar, tableId, seatIndex, isMe, heldCoffee } = userInfo;

    // 위치 계산 — tableId가 없으면 기본 위치(입구 쪽)에 배치
    const pos = this._resolvePosition(tableId, seatIndex, id);

    // 외형 변화가 없고 위치도 같으면 업데이트 스킵
    const existing = this.characterSprites.get(id);
    if (existing) {
      const p = existing.group.position;
      const avatarKey = avatar ? `${avatar.bodyColor}_${(avatar.accessories||[]).sort().join(',')}` : '';
      if (
        Math.abs(p.x - pos.x) < 0.001 &&
        Math.abs(p.z - pos.z) < 0.001 &&
        existing.avatarKey === avatarKey
      ) {
        // 위치·외형 동일 → float 애니메이션만 적용 (update()에서 처리)
        return;
      }
      // 기존 캐릭터 제거
      this._disposeCharacterGroup(existing.group);
    }

    if (!avatar) return;

    const group = new THREE.Group();

    // 캐릭터 스프라이트
    const sprite = createCharacterSprite(avatar, username);
    sprite.position.y = 0.45;
    group.add(sprite);

    // 이름표
    const nameTag = createNameTag(username, isMe);
    nameTag.position.y = 1.08;
    group.add(nameTag);

    // 커피 들고 있을 때
    if (heldCoffee) {
      const coffeeSprite = createCoffeeSprite(heldCoffee.emoji);
      coffeeSprite.position.set(0.28, 0.58, 0);
      group.add(coffeeSprite);
    }

    // 내 캐릭터 — 바닥 글로우 링
    if (isMe) {
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.32, 16),
        new THREE.MeshBasicMaterial({
          color: 0xFFD080, transparent: true, opacity: 0.22, depthWrite: false,
        })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.01;
      group.add(glow);
    }

    group.position.set(pos.x, 0, pos.z);
    this.scene.add(group);

    const avatarKey = `${avatar.bodyColor}_${(avatar.accessories||[]).sort().join(',')}`;
    this.characterSprites.set(id, { group, sprite, nameTag, avatarKey });
  }

  /** 캐릭터 제거 */
  removeCharacter(userId) {
    const existing = this.characterSprites.get(userId);
    if (!existing) return;
    this._disposeCharacterGroup(existing.group);
    this.characterSprites.delete(userId);
  }

  /** 캐릭터 Group 씬 제거 + 메모리 해제 */
  _disposeCharacterGroup(group) {
    this.scene.remove(group);
    group.traverse(obj => {
      obj.geometry?.dispose();
      if (obj.material) {
        // 스프라이트 텍스처는 캐시에서 관리하므로 dispose 하지 않음
        if (!obj.isSprite) obj.material.dispose();
      }
    });
  }

  /**
   * 캐릭터 월드 위치 결정
   * - tableId가 있으면 해당 좌석 위치
   * - tableId가 없으면 userId 기반 기본 배치 위치 (입구 근처 여러 자리)
   */
  _resolvePosition(tableId, seatIndex, userId = '') {
    if (tableId) {
      const tableData = this.tables.get(tableId);
      if (tableData) {
        const seat = tableData.seats[seatIndex ?? 0];
        if (seat) return { x: seat.worldX, z: seat.worldZ };
        return tableData.position; // 좌석 인덱스 초과 시 테이블 위치
      }
    }

    // 테이블에 앉지 않은 경우 — 카페 입구 근처에 분산 배치
    // userId의 해시로 고유 위치 생성 (매번 다른 위치를 유지)
    const hash = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const slots = [
      { x: 6.5, z: 6.0 }, { x: 5.5, z: 6.8 }, { x: 7.5, z: 6.8 },
      { x: 6.0, z: 7.5 }, { x: 7.0, z: 7.0 }, { x: 5.0, z: 7.5 },
      { x: 8.0, z: 6.5 }, { x: 6.5, z: 5.0 }, { x: 8.0, z: 7.5 },
    ];
    return slots[hash % slots.length];
  }

  // ── 레이캐스트 대상 목록 ──────────────────────────────────
  getRaycastTargets() {
    const targets = [];
    this.tables.forEach((data) => {
      // 탁자 상판 (index 2: leg, foot×4, top)
      data.group.children.forEach(child => {
        if (child.userData.tableId) targets.push(child);
      });
    });
    return targets;
  }

  // ── 애니메이션 업데이트 (매 프레임) ─────────────────────
  update(_camera, _delta) {
    const time = performance.now() * 0.001;
    const { auth } = store.getState();
    const myId = auth.user?.id;

    this.characterSprites.forEach(({ group, sprite }, id) => {
      if (id === myId) {
        // 내 캐릭터만 살짝 떠있는 효과
        sprite.position.y = 0.45 + Math.sin(time * 1.6) * 0.03;
      }
    });
  }

  // ── 테이블 수 동적 확장 ──────────────────────────────────
  expandTables(newCount) {
    if (newCount <= this._tableCount) return;
    const positions = this._generateTablePositions(newCount);
    for (let i = this._tableCount; i < newCount; i++) {
      if (positions[i]) this._createTable(`table_${i}`, positions[i].x, positions[i].z, SEATS_PER_TABLE);
    }
    this._tableCount = newCount;
  }

  /** 씬 전체 메모리 해제 */
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
