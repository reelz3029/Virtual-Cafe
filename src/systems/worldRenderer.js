/**
 * systems/worldRenderer.js
 * Three.js 월드 렌더러 & 카메라 컨트롤러
 *
 * [최적화]
 * - Raycaster 재사용 (매 클릭마다 new 생성 제거)
 * - 캐릭터 업데이트: 변경된 사용자만 갱신 (전체 재생성 제거)
 * - 드래그/클릭 구분: mousedown ~ mouseup 이동 거리 기준
 */

import * as THREE from 'three';
import { store, setSeat, setViewMode, showNotification } from '../store/gameStore.js';
import { CafeScene }       from '../scenes/cafeScene.js';
import { multiplayerSim }  from './multiplayerSim.js';

// 활성 렌더러 인스턴스 — ChatPanel 등 외부에서 exitToIso() 호출용
let _instance = null;
export function getWorldRenderer() { return _instance; }

// ease-in-out (smoothstep)
const easeInOut = t => t * t * (3 - 2 * t);

// fp 둘러보기 시야 제한 (rad) — 마우스/키보드 공유
const FP_YAW_LIMIT   = 1.2;   // 좌우 ≈ ±69°
const FP_PITCH_LIMIT = 0.5;   // 상하 ≈ ±29°

export class WorldRenderer {
  constructor(canvas) {
    this.canvas  = canvas;
    this._activeScene = null;
    this._clock  = new THREE.Clock();
    this._animId = null;
    this._raycaster = new THREE.Raycaster(); // 재사용
    this._mouse  = new THREE.Vector2();

    // 카메라 상태
    this._cam = {
      target:    new THREE.Vector3(0, 0, 0),
      zoom:      6,
      targetZoom: 6,  // smooth lerp 목표값
      minZoom:   3,
      maxZoom:   10,
      isDragging: false,
      dragStart: { x: 0, y: 0 },   // 드래그 시작점 (클릭 구분용)
      lastMouse: { x: 0, y: 0 },
      velocity:  { x: 0, z: 0 },
      // 중간 버튼 드래그 줌
      isZoomDrag:    false,
      zoomDragStartY: 0,
      zoomDragBase:   6,
    };

    // 키보드 입력 상태 (WASD + 방향키)
    this._keys = {};

    // 캐릭터 diff용 이전 상태 스냅샷
    this._prevUsers = new Map(); // userId → snapshot string

    // 테이블 hover 툴팁
    this._hoveredTableId  = null;
    this._tableTooltipEl  = this._createTableTooltip();

    this._initCamera();    // 활성 카메라(this.camera) = 아이소 로비 뷰
    this._initRenderer();

    // ── 듀얼 카메라 시스템 ──────────────────────────────────
    this.isoCamera = this.camera;   // 기존 직교 = 로비 뷰
    this.fpCamera  = new THREE.PerspectiveCamera(
      55, window.innerWidth / window.innerHeight, 0.1, 100);
    // 전환용 퍼스펙티브 카메라 (iso↔fp 보간 중 렌더)
    this._transitionCam = new THREE.PerspectiveCamera(
      50, window.innerWidth / window.innerHeight, 0.1, 200);
    this.viewMode  = 'iso';         // 'iso' | 'fp' | 'transition'
    this._camTween = null;          // 진행 중 전환 상태
    // 1인칭 둘러보기(look-around) 상태
    this._fp = { eye: new THREE.Vector3(), baseYaw: 0, basePitch: 0, yaw: 0, pitch: 0 };

    this._createViewToggleButton();

    this._bindEvents();
    _instance = this;

    // 로그인 상태에 따라 시점 버튼 표시/숨김 (로그인 화면에선 숨김)
    this._syncToggleVisibility(store.getState());
    this._unsubAuth = store.subscribe(s => this._syncToggleVisibility(s));
  }

  _syncToggleVisibility(state) {
    if (!this._viewToggleEl) return;
    this._viewToggleEl.style.display = state.auth?.isLoggedIn ? 'block' : 'none';
  }

  // ── 시점 전환 버튼 (항상 표시, iso↔fp 토글) ────────────────
  _createViewToggleButton() {
    const el = document.createElement('button');
    el.id = 'btn-view-toggle';
    el.style.cssText = `
      position: fixed; left: 24px; bottom: 24px; z-index: 60; display: none;
      padding: 11px 18px; border: none; border-radius: 999px;
      background: rgba(90,62,40,0.92); color: #F7ECD9;
      font-size: 13px; font-weight: 600; font-family: inherit;
      cursor: pointer; backdrop-filter: blur(10px);
      box-shadow: 0 6px 20px rgba(60,40,20,0.30);
      transition: background 0.15s;
    `;
    el.addEventListener('mouseenter', () => { el.style.background = 'rgba(70,48,30,0.96)'; });
    el.addEventListener('mouseleave', () => { el.style.background = 'rgba(90,62,40,0.92)'; });
    el.addEventListener('click', () => this.toggleView());
    document.body.appendChild(el);
    this._viewToggleEl = el;
    this._updateViewToggleLabel();
    return el;
  }

  _updateViewToggleLabel() {
    if (!this._viewToggleEl) return;
    const mode = store.getState().viewMode;
    this._viewToggleEl.textContent =
      mode === 'fp' ? '🗺️ 로비로 나가기' : '🪑 1인칭으로 앉기';
  }

  // ── 시점 토글 (버튼 클릭) ──────────────────────────────────
  toggleView() {
    if (this.viewMode === 'transition') return;  // 전환 중 무시
    if (this.viewMode === 'fp') { this.exitToIso(); return; }

    // iso → fp: 내 캐릭터가 앉은 좌석으로 진입
    const { myTableId, mySeatIndex } = store.getState();
    if (myTableId && this._activeScene?.tables?.has(myTableId)) {
      this.enterFirstPerson(myTableId, mySeatIndex ?? 0);
      return;
    }
    // 아직 안 앉았으면 가장 가까운 테이블에 앉힌 뒤 그 좌석 1인칭
    const tableId = this._nearestTableId();
    if (!tableId) { showNotification('주변에 테이블이 없어요 😅', 'info'); return; }
    setSeat(tableId, 0);
    multiplayerSim.refreshMyPosition();
    this.enterFirstPerson(tableId, 0);
  }

  // 카메라 타겟에 가장 가까운 테이블 id
  _nearestTableId() {
    if (!this._activeScene) return null;
    const t = this._cam.target;
    let best = null, bestD = Infinity;
    this._activeScene.tables.forEach((data, id) => {
      const dx = data.position.x - t.x, dz = data.position.z - t.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = id; }
    });
    return best;
  }

  // ── 테이블 hover 툴팁 생성 ──────────────────────────────
  _createTableTooltip() {
    const el = document.createElement('div');
    el.id = 'table-tooltip';
    el.style.cssText = `
      position: fixed; display: none; z-index: 50;
      transform: translate(-50%, -100%);
      pointer-events: auto;
    `;
    el.innerHTML = `
      <style>
      #table-tooltip {
        background: rgba(255,255,255,0.97);
        backdrop-filter: blur(14px);
        border: 1px solid rgba(196,160,106,0.3);
        border-radius: 14px;
        box-shadow: 0 6px 24px rgba(26,15,8,0.15);
        padding: 12px 14px;
        min-width: 150px;
        text-align: center;
      }
      .table-tooltip-info {
        font-size: 12px; color: #7A6040; margin-bottom: 6px;
      }
      .table-tooltip-users {
        font-size: 12.5px; font-weight: 600; color: #3C2810;
        margin-bottom: 8px;
        display: flex; flex-direction: column; gap: 2px;
      }
      .btn-table-join {
        width: 100%; padding: 7px 0;
        background: #7A5A28; color: #F7F0E0;
        border: none; border-radius: 9px;
        font-size: 12px; font-weight: 600;
        cursor: pointer; font-family: inherit;
        transition: background 0.15s;
      }
      .btn-table-join:hover { background: #5A3E18; }
      .btn-table-join.sent  { background: #F0E8D4; color: #A07840; cursor: default; }
      .table-tooltip-mine   { font-size: 11px; color: #6DB87A; font-weight: 600; }
      </style>
      <div class="table-tooltip-info"></div>
      <div class="table-tooltip-users"></div>
      <button class="btn-table-join" style="display:none"></button>
      <div class="table-tooltip-mine" style="display:none">✓ 내 자리</div>
    `;
    document.body.appendChild(el);

    el.querySelector('.btn-table-join').addEventListener('click', () => {
      const tableId = this._hoveredTableId;
      if (!tableId) return;
      const btn = el.querySelector('.btn-table-join');
      if (btn.classList.contains('sent')) return;
      multiplayerSim.requestJoin(tableId);
      btn.textContent = '요청 중...';
      btn.classList.add('sent');
      setTimeout(() => this._hideTableTooltip(), 2500);
    });

    return el;
  }

  // ── Three.js 초기화 ──────────────────────────────────────
  _initRenderer() {
    const W = window.innerWidth, H = window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(W, H);
    this.renderer.setClearColor(0x5A4330, 1);   // 따뜻한 중간톤 황혼 배경
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
  }

  _initCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const h = this._cam.zoom;
    // near를 음수로 설정 — OrthographicCamera는 카메라 뒤쪽도 렌더 가능
    this.camera = new THREE.OrthographicCamera(
      -h * aspect, h * aspect, h, -h, -80, 200
    );
    this.camera.position.set(9, 9, 9);
    this.camera.lookAt(0, 0, 0);
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────
  _bindEvents() {
    this.canvas.addEventListener('mousedown',  e => this._onMouseDown(e));
    this.canvas.addEventListener('mousedown',  e => { if (e.button === 1) e.preventDefault(); });
    window.addEventListener('mousemove',       e => this._onWindowMouseMove(e));
    window.addEventListener('mouseup',         e => this._onMouseUp(e));
    this.canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: true });
    window.addEventListener('touchmove',       e => this._onTouchMove(e),  { passive: true });
    window.addEventListener('touchend',        e => this._onMouseUp(e));
    window.addEventListener('wheel',           e => this._onWheel(e), { passive: true });
    window.addEventListener('resize',          () => this._onResize());
    document.addEventListener('mouseleave',    () => this._hideTableTooltip());

    // WASD + 방향키 패닝 (input/textarea 포커스 중에는 무시)
    window.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      this._keys[e.key] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => { this._keys[e.key] = false; });
  }

  // ── 키보드 카메라 이동 ─────────────────────────────────────
  // 아이소메트릭 45° 다이아몬드 이동
  // W/↑: 화면 위 = 월드 (-x, -z) 방향
  // S/↓: 화면 아래 = 월드 (+x, +z)
  // A/←: 화면 왼쪽 = 월드 (-x, +z)
  // D/→: 화면 오른쪽 = 월드 (+x, -z)
  _applyKeyMovement(delta) {
    if (this.viewMode !== 'iso') return;   // fp 모드: 패닝 비활성
    const tag = document.activeElement?.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    const k = this._keys;
    const speed = this._cam.zoom * 2.8 * delta;
    const diag  = speed * 0.707; // 1/√2

    let mx = 0, mz = 0;
    if (k['w'] || k['W'] || k['ArrowUp'])    { mx -= diag; mz -= diag; }
    if (k['s'] || k['S'] || k['ArrowDown'])  { mx += diag; mz += diag; }
    if (k['a'] || k['A'] || k['ArrowLeft'])  { mx -= diag; mz += diag; }
    if (k['d'] || k['D'] || k['ArrowRight']) { mx += diag; mz -= diag; }

    if (mx || mz) {
      this._cam.target.x += mx;
      this._cam.target.z += mz;
      this._cam.velocity = { x: 0, z: 0 };
      this._updateCameraPosition();
    }
  }

  _onMouseDown(e) {
    if (e.button === 1) {
      // 휠 클릭 드래그 → 줌 조작
      this._cam.isZoomDrag    = true;
      this._cam.zoomDragStartY = e.clientY;
      this._cam.zoomDragBase   = this._cam.targetZoom;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    this._cam.isDragging = true;
    this._cam.dragStart  = { x: e.clientX, y: e.clientY };
    this._cam.lastMouse  = { x: e.clientX, y: e.clientY };
    this._cam.velocity   = { x: 0, z: 0 };
  }

  // window 전체 mousemove — drag + zoom-drag + hover 통합
  _onWindowMouseMove(e) {
    if (this._cam.isZoomDrag) {
      // 위로 드래그 → 줌인 / 아래 → 줌아웃
      const dy = e.clientY - this._cam.zoomDragStartY;
      const newZoom = this._cam.zoomDragBase * (1 + dy * 0.006);
      this._cam.targetZoom = Math.max(this._cam.minZoom,
        Math.min(this._cam.maxZoom, newZoom));
    } else if (this._cam.isDragging) {
      this._onMouseMove(e);
    } else {
      this._checkTableHover(e.clientX, e.clientY);
    }
  }

  _onMouseMove(e) {
    const dx = e.clientX - this._cam.lastMouse.x;
    const dy = e.clientY - this._cam.lastMouse.y;

    // fp 모드: 좌클릭 드래그로 둘러보기 (yaw/pitch)
    if (this.viewMode === 'fp') {
      this._fp.yaw   = THREE.MathUtils.clamp(this._fp.yaw   - dx * 0.004, -FP_YAW_LIMIT, FP_YAW_LIMIT);
      this._fp.pitch = THREE.MathUtils.clamp(this._fp.pitch - dy * 0.003, -FP_PITCH_LIMIT, FP_PITCH_LIMIT);
      this._cam.lastMouse = { x: e.clientX, y: e.clientY };
      this._applyFpCamera();
      return;
    }
    if (this.viewMode !== 'iso') return;   // 전환 중 입력 무시

    const speed = this._cam.zoom * 0.008;

    this._cam.target.x -= dx * speed;
    this._cam.target.z -= dy * speed * 0.6;
    this._cam.velocity.x = -dx * speed * 0.5;
    this._cam.velocity.z = -dy * speed * 0.3;
    this._cam.lastMouse  = { x: e.clientX, y: e.clientY };
    this._updateCameraPosition();
  }

  _onMouseUp(e) {
    if (this._cam.isZoomDrag) {
      this._cam.isZoomDrag = false;
      return;
    }
    if (!this._cam.isDragging) return;
    this._cam.isDragging = false;

    // 드래그 거리가 5px 미만이면 클릭으로 처리
    const dx = (e.clientX ?? 0) - this._cam.dragStart.x;
    const dy = (e.clientY ?? 0) - this._cam.dragStart.y;
    if (Math.sqrt(dx * dx + dy * dy) < 5) {
      this._handleClick(e.clientX ?? this._cam.dragStart.x, e.clientY ?? this._cam.dragStart.y);
    }
  }

  _onTouchStart(e) {
    if (e.touches.length !== 1) return;
    this._cam.isDragging = true;
    this._cam.dragStart  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    this._cam.lastMouse  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    this._cam.velocity   = { x: 0, z: 0 };
  }

  _onTouchMove(e) {
    if (!this._cam.isDragging || e.touches.length !== 1) return;
    this._onMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
  }

  _onWheel(e) {
    if (this.viewMode === 'fp') {
      // 살짝의 FOV 조정만 (줌 인/아웃 없음)
      this.fpCamera.fov = THREE.MathUtils.clamp(
        this.fpCamera.fov + (e.deltaY > 0 ? 1.5 : -1.5), 45, 65);
      this.fpCamera.updateProjectionMatrix();
      return;
    }
    if (this.viewMode !== 'iso') return;
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    this._cam.targetZoom = Math.max(this._cam.minZoom,
      Math.min(this._cam.maxZoom, this._cam.targetZoom * factor));
  }

  _handleClick(clientX, clientY) {
    if (this.viewMode !== 'iso') return;   // fp/전환 중에는 테이블 선택 비활성
    this._mouse.set(
      (clientX / window.innerWidth)  *  2 - 1,
      (clientY / window.innerHeight) * -2 + 1
    );
    this._raycaster.setFromCamera(this._mouse, this.camera);

    const targets = this._activeScene?.getRaycastTargets() ?? [];
    const hits = this._raycaster.intersectObjects(targets, false);

    if (hits.length > 0) {
      const tableId = hits[0].object.userData.tableId;
      if (tableId) this._onTableClick(tableId);
    }
  }

  // ── 테이블 hover 감지 (2D 근접 판정) ────────────────────
  // 레이캐스팅 대신: 각 테이블의 3D 위치를 스크린 2D로 투영한 뒤
  // 마우스 거리가 HOVER_R px 이내인 가장 가까운 테이블을 선택
  _checkTableHover(clientX, clientY) {
    const { auth } = store.getState();
    if (this.viewMode !== 'iso') { this._hideTableTooltip(); return; }
    if (!auth.isLoggedIn || !this._activeScene) { this._hideTableTooltip(); return; }

    const HOVER_R = 72; // 픽셀 반경
    const v = new THREE.Vector3();
    let closestId   = null;
    let closestDist = Infinity;

    this._activeScene.tables.forEach((tableData, tableId) => {
      v.set(tableData.position.x, 0.72, tableData.position.z).project(this.camera);
      const sx = (v.x *  0.5 + 0.5) * window.innerWidth;
      const sy = (v.y * -0.5 + 0.5) * window.innerHeight;
      const d  = Math.hypot(clientX - sx, clientY - sy);
      if (d < HOVER_R && d < closestDist) {
        closestDist = d;
        closestId   = tableId;
      }
    });

    if (closestId) this._showTableTooltip(closestId);
    else           this._hideTableTooltip();
  }

  _showTableTooltip(tableId) {
    const { auth, myTableId, onlineUsers } = store.getState();

    const tableData = this._activeScene?.tables?.get(tableId);
    if (!tableData) { this._hideTableTooltip(); return; }

    this._hoveredTableId = tableId;

    // 3D 위치 → 2D 화면 좌표 투영 (테이블 상판 높이)
    const pos3 = new THREE.Vector3(tableData.position.x, 1.4, tableData.position.z);
    pos3.project(this.camera);
    const screenX = (pos3.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-pos3.y * 0.5 + 0.5) * window.innerHeight;

    const usersAtTable = onlineUsers.filter(u => u.tableId === tableId);
    const isMyTable    = myTableId === tableId;
    const others       = usersAtTable.filter(u => u.id !== auth.user?.id);

    const infoEl  = this._tableTooltipEl.querySelector('.table-tooltip-info');
    const usersEl = this._tableTooltipEl.querySelector('.table-tooltip-users');
    const btnEl   = this._tableTooltipEl.querySelector('.btn-table-join');
    const mineEl  = this._tableTooltipEl.querySelector('.table-tooltip-mine');

    infoEl.textContent = `🪑 ${usersAtTable.length} / 4`;

    if (usersAtTable.length === 0) {
      usersEl.innerHTML = '<span style="color:#A09070;font-size:12px">빈 테이블</span>';
    } else {
      usersEl.innerHTML = usersAtTable.slice(0, 4)
        .map(u => `<span>${u.id === auth.user?.id ? '😺' : '🐱'} ${u.username}</span>`)
        .join('');
    }

    if (isMyTable) {
      mineEl.style.display = '';
      btnEl.style.display  = 'none';
    } else if (others.length > 0 && !btnEl.classList.contains('sent')) {
      mineEl.style.display = 'none';
      btnEl.style.display  = '';
      btnEl.textContent    = '합석 요청 🤝';
    } else {
      mineEl.style.display = 'none';
      btnEl.style.display  = 'none';
    }

    this._tableTooltipEl.style.left    = `${screenX}px`;
    this._tableTooltipEl.style.top     = `${screenY - 8}px`;
    this._tableTooltipEl.style.display = 'block';
  }

  _hideTableTooltip() {
    this._tableTooltipEl.style.display = 'none';
    this._hoveredTableId = null;
    const btn = this._tableTooltipEl.querySelector('.btn-table-join');
    btn.classList.remove('sent');
    btn.textContent = '합석 요청 🤝';
  }

  _onTableClick(tableId) {
    const { auth, myTableId } = store.getState();
    if (!auth.isLoggedIn) {
      showNotification('로그인 후 이용하세요.', 'info');
      return;
    }
    if (myTableId === tableId) {
      showNotification('이미 앉아있는 자리예요 😊', 'info');
      return;
    }
    setSeat(tableId, 0);
    multiplayerSim.refreshMyPosition();
    showNotification('자리에 앉았어요! ☕ (좌하단 버튼으로 1인칭 전환)', 'success');
  }

  // ── 듀얼 카메라: 1인칭 착석 뷰로 다이브 ────────────────────
  enterFirstPerson(tableId, seatIndex = 0) {
    const tableData = this._activeScene?.tables?.get(tableId);
    if (!tableData) return;
    const seat = tableData.seats[seatIndex] ?? tableData.seats[0];
    if (!seat) return;

    // 착석 눈높이 — 테이블 건너편을 거의 수평으로 바라봄
    const center = tableData.position;
    const eye    = new THREE.Vector3(seat.worldX, 1.25, seat.worldZ);
    // 시선 타겟: 테이블 중심 너머(건너편 좌석 방향)로 연장 → 맞은편 동석자/배경이 보임
    const lookAt = new THREE.Vector3(
      center.x + (center.x - seat.worldX) * 0.6,
      1.12,   // 눈높이보다 살짝만 낮음 → 완만한 시선 (이전 0.85는 너무 아래)
      center.z + (center.z - seat.worldZ) * 0.6,
    );

    // look-around 기준 yaw/pitch 저장 (테이블 정면)
    const L = lookAt.clone().sub(eye);
    this._fp.eye.copy(eye);
    this._fp.baseYaw   = Math.atan2(L.x, L.z);
    this._fp.basePitch = Math.atan2(L.y, Math.hypot(L.x, L.z));
    this._fp.yaw = 0; this._fp.pitch = 0;

    // 현재 iso 카메라 포즈에서 출발 → 착석 포즈로 보간
    const fromPos    = this.isoCamera.position.clone();
    const fromTarget = this._cam.target.clone();   // iso는 지면(target)을 바라봄
    this._hideTableTooltip();
    this.viewMode = 'transition';
    setViewMode('fp');   // HUD가 즉시 fp로 반응 (힌트/툴팁 숨김)
    this._updateViewToggleLabel();
    this._camTween = {
      t: 0, dur: 0.9, mode: 'enter',
      fromPos, fromTarget, toPos: eye.clone(), toTarget: lookAt.clone(),
      // 시작 FOV를 iso 직교 화각과 일치시켜 t=0 팝(pop) 제거
      fovFrom: this._isoMatchFov(fromPos, fromTarget),
      fovTo:   this.fpCamera.fov,
    };
  }

  // ── 듀얼 카메라: 아이소 로비 뷰로 복귀 ─────────────────────
  exitToIso() {
    if (this.viewMode === 'iso') return;
    // 현재 fp 포즈에서 출발 → iso 포즈로 보간
    const fromPos    = this.camera.position.clone();
    const fwd        = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const fromTarget = fromPos.clone().add(fwd.multiplyScalar(3));

    const isoPose = this._isoPoseFor(this._cam.target);
    this.viewMode = 'transition';
    setViewMode('iso');
    this._updateViewToggleLabel();
    this._camTween = {
      t: 0, dur: 0.9, mode: 'exit',
      fromPos, fromTarget, toPos: isoPose.pos, toTarget: isoPose.target,
      // 도착 FOV를 iso 직교 화각과 일치 → t=1 팝 제거
      fovFrom: this.fpCamera.fov,
      fovTo:   this._isoMatchFov(isoPose.pos, isoPose.target),
    };
  }

  // iso 카메라의 (위치, 바라보는 지점) 계산 — 지면 target 기준
  _isoPoseFor(target) {
    return {
      pos:    new THREE.Vector3(target.x + 9, 9, target.z + 9),
      target: new THREE.Vector3(target.x, 0, target.z),
    };
  }

  // 직교(iso) 화각을 근사하는 퍼스펙티브 수직 FOV(deg)
  // 거리 D에서 화면 절반높이 = zoom 이 되는 FOV → 전환 시작/끝 프레이밍 일치
  _isoMatchFov(pos, target) {
    const D = Math.max(0.001, pos.distanceTo(target));
    return THREE.MathUtils.radToDeg(2 * Math.atan(this._cam.zoom / D));
  }

  // fp 카메라에 현재 look-around yaw/pitch 적용
  _applyFpCamera() {
    const yaw   = this._fp.baseYaw   + this._fp.yaw;
    const pitch = this._fp.basePitch + this._fp.pitch;
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    this.fpCamera.position.copy(this._fp.eye);
    this.fpCamera.lookAt(this._fp.eye.clone().add(dir));
  }

  // fp 모드: 방향키/WASD로 시선 회전 (이동 없음 — 착석 상태)
  _applyFpLook(delta) {
    if (this.viewMode !== 'fp') return;
    const tag = document.activeElement?.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    const k = this._keys;
    const sp = 1.5 * delta;   // rad/sec
    let dy = 0, dp = 0;
    if (k['a'] || k['A'] || k['ArrowLeft'])  dy += sp;
    if (k['d'] || k['D'] || k['ArrowRight']) dy -= sp;
    if (k['w'] || k['W'] || k['ArrowUp'])    dp += sp;
    if (k['s'] || k['S'] || k['ArrowDown'])  dp -= sp;

    if (dy || dp) {
      this._fp.yaw   = THREE.MathUtils.clamp(this._fp.yaw   + dy, -FP_YAW_LIMIT, FP_YAW_LIMIT);
      this._fp.pitch = THREE.MathUtils.clamp(this._fp.pitch + dp, -FP_PITCH_LIMIT, FP_PITCH_LIMIT);
      this._applyFpCamera();
    }
  }

  _onResize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer.setSize(W, H);
    this._updateCameraFrustum();
    const aspect = W / H;
    this.fpCamera.aspect = aspect;
    this.fpCamera.updateProjectionMatrix();
    this._transitionCam.aspect = aspect;
    this._transitionCam.updateProjectionMatrix();
  }

  // ── 카메라 업데이트 ──────────────────────────────────────
  // 토로이달 랩핑: 한 방향으로 계속 이동하면 월드 경계를 넘어 반대편에서 나타남
  // → 카메라가 세계를 한 바퀴 돌면 시작 지점으로 돌아오는 진짜 무한 맵
  _updateCameraPosition() {
    if (this.viewMode !== 'iso') return;   // fp/전환 중에는 iso 카메라 고정
    const { target } = this._cam;

    const span = this._activeScene?.gridSpan;
    if (span) {
      // (구) 무한 타일 월드: 토로이달 랩핑
      const half = span / 2;
      target.x = ((target.x + half) % span + span) % span - half;
      target.z = ((target.z + half) % span + span) % span - half;
    } else {
      // 닫힌 룸: 룸 밖으로 못 나가게 팬 범위 클램프
      const lim = this._activeScene?.panLimit ?? 4.5;
      target.x = THREE.MathUtils.clamp(target.x, -lim, lim);
      target.z = THREE.MathUtils.clamp(target.z, -lim, lim);
    }

    this.camera.position.set(target.x + 9, 9, target.z + 9);
    this.camera.lookAt(target);
  }

  _updateCameraFrustum() {
    const aspect = window.innerWidth / window.innerHeight;
    const h = this._cam.zoom;
    const w = h * aspect;
    const cam = this.isoCamera;   // 항상 직교 로비 카메라 대상
    cam.left   = -w;
    cam.right  =  w;
    cam.top    =  h;
    cam.bottom = -h;
    // near/far를 zoom에 비례해 함께 갱신 — 줌 아웃 시 컬링 범위 확장
    // near 음수: 아이소메트릭 카메라 하단부 바닥이 뷰 뒤쪽에 위치하는 현상 대응
    cam.near = -h * 12;
    cam.far  =  h * 25;
    cam.updateProjectionMatrix();
  }

  // ── 카메라 전환 보간 (animate 루프에서 매 프레임) ──────────
  _updateCamTween(delta) {
    const tw = this._camTween;
    if (!tw) return;
    tw.t = Math.min(1, tw.t + delta / tw.dur);
    const k = easeInOut(tw.t);
    this._transitionCam.position.copy(tw.fromPos.clone().lerp(tw.toPos, k));
    this._transitionCam.lookAt(tw.fromTarget.clone().lerp(tw.toTarget, k));
    // FOV도 함께 보간 → 직교↔퍼스펙티브 화각 변화가 매끄럽게 연결됨
    this._transitionCam.fov = tw.fovFrom + (tw.fovTo - tw.fovFrom) * k;
    this._transitionCam.updateProjectionMatrix();
    this.camera = this._transitionCam;

    if (tw.t >= 1) {
      this._camTween = null;
      if (tw.mode === 'enter') {
        this.viewMode = 'fp';
        this._applyFpCamera();
        this.camera = this.fpCamera;
      } else {
        this.viewMode = 'iso';
        this.camera = this.isoCamera;
        this._updateCameraFrustum();
        this._updateCameraPosition();
      }
    }
  }

  // ── 씬 로드 ─────────────────────────────────────────────
  loadScene(sceneName) {
    if (this._activeScene) {
      this._activeScene.dispose();
      this._activeScene = null;
    }
    this._prevUsers.clear();

    if (!sceneName) return;

    try {
      switch (sceneName) {
        case 'cafe':
        default:
          this._activeScene = new CafeScene();
          break;
      }
    } catch (err) {
      console.error('[WorldRenderer] 씬 생성 오류:', err);
      // 씬 생성 실패 시 멀티플레이어만 최소 시작 (빈 화면 대신 오류 방지)
      multiplayerSim.stop();
      multiplayerSim.start(8, sceneName);
      return;
    }

    this._hideTableTooltip();
    // 멀티플레이어 시작 — 씬에서 생성된 테이블 수 그대로 전달
    multiplayerSim.stop();
    multiplayerSim.start(this._activeScene.tableCount, sceneName);
  }

  // ── 캐릭터 diff 업데이트 ─────────────────────────────────
  /**
   * onlineUsers 목록과 이전 스냅샷을 비교해 변경된 것만 재렌더링
   * 변경 기준: tableId, seatIndex, bodyColor, accessories, heldCoffee
   */
  _diffUpdateCharacters() {
    if (!this._activeScene) return;

    const { onlineUsers, auth, heldCoffee } = store.getState();
    const myId = auth.user?.id;

    const currentIds = new Set();

    onlineUsers.forEach(user => {
      currentIds.add(user.id);

      // 스냅샷 문자열 생성
      const snap = [
        user.tableId,
        user.seatIndex,
        user.avatar?.bodyColor,
        (user.avatar?.accessories || []).sort().join(','),
        user.id === myId && heldCoffee ? heldCoffee.id : '',
      ].join('|');

      const prev = this._prevUsers.get(user.id);
      if (prev === snap) return; // 변경 없음 → 스킵

      this._prevUsers.set(user.id, snap);
      this._activeScene.updateCharacter({
        ...user,
        isMe: user.id === myId,
        heldCoffee: user.id === myId ? heldCoffee : null,
      });
    });

    // 퇴장한 사용자 제거
    this._prevUsers.forEach((_, id) => {
      if (!currentIds.has(id)) {
        this._activeScene.removeCharacter(id);
        this._prevUsers.delete(id);
      }
    });
  }

  // ── 렌더 루프 ────────────────────────────────────────────
  start() {
    let lastCharUpdate = 0;

    const animate = () => {
      this._animId = requestAnimationFrame(animate);
      const delta = this._clock.getDelta();
      const now   = performance.now();

      // 카메라 전환(iso↔fp) 보간 진행
      this._updateCamTween(delta);

      // 키보드 이동 (WASD + 방향키) — fp/전환 중 내부에서 무시됨
      this._applyKeyMovement(delta);
      // fp 모드: 방향키/WASD 시선 회전
      this._applyFpLook(delta);

      // 줌 스무딩 (targetZoom → zoom 보간)
      if (Math.abs(this._cam.zoom - this._cam.targetZoom) > 0.001) {
        this._cam.zoom += (this._cam.targetZoom - this._cam.zoom) * 0.14;
        this._updateCameraFrustum();
      }

      // 관성 (팬 후 천천히 멈춤)
      if (!this._cam.isDragging) {
        const friction = 0.87;
        this._cam.velocity.x *= friction;
        this._cam.velocity.z *= friction;
        if (Math.abs(this._cam.velocity.x) > 0.0005 || Math.abs(this._cam.velocity.z) > 0.0005) {
          this._cam.target.x += this._cam.velocity.x;
          this._cam.target.z += this._cam.velocity.z;
          this._updateCameraPosition();
        }
      }

      // 무한 타일 랩핑 — 카메라 위치 기준으로 타일 재배치
      this._activeScene?.updateTiles(this._cam.target);

      // 캐릭터 diff 업데이트 (600ms마다) — 변경 없으면 즉시 리턴
      if (now - lastCharUpdate > 600) {
        this._diffUpdateCharacters();
        lastCharUpdate = now;
      }

      // 씬 update (스프라이트 float 등)
      this._activeScene?.update(this.camera, delta);

      if (this._activeScene) {
        this.renderer.render(this._activeScene.scene, this.camera);
      }
    };

    animate();
  }

  stop() {
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  }

  dispose() {
    this.stop();
    this._unsubAuth?.();
    this._activeScene?.dispose();
    this._viewToggleEl?.remove();
    this.renderer.dispose();
    if (_instance === this) _instance = null;
  }
}
