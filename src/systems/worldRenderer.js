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
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { store, setSeat, showNotification } from '../store/gameStore.js';
import { CafeScene } from '../scenes/cafeScene.js';
import { multiplayerSim } from './multiplayerSim.js';

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

    this._initRenderer();
    this._initCamera();
    this._bindEvents();
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
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: window.devicePixelRatio < 2,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0xF0E8D4, 1);
    this.renderer.shadowMap.enabled = false;

    // 카툰 렌더링: 모든 메시 외곽선 자동 추가
    // defaultThickness: 월드 유닛 기준 선 두께 (아이소메트릭 zoom 6 기준 적합)
    this.outlineEffect = new OutlineEffect(this.renderer, {
      defaultThickness: 0.0022,
      defaultColor: new THREE.Color(0x1a0e04), // 따뜻한 다크 브라운 아웃라인
      defaultAlpha: 0.85,
    });
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
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    this._cam.targetZoom = Math.max(this._cam.minZoom,
      Math.min(this._cam.maxZoom, this._cam.targetZoom * factor));
  }

  _handleClick(clientX, clientY) {
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
    showNotification('자리에 앉았어요! ☕', 'success');
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this._updateCameraFrustum();
  }

  // ── 카메라 업데이트 ──────────────────────────────────────
  // 토로이달 랩핑: 한 방향으로 계속 이동하면 월드 경계를 넘어 반대편에서 나타남
  // → 카메라가 세계를 한 바퀴 돌면 시작 지점으로 돌아오는 진짜 무한 맵
  _updateCameraPosition() {
    const { target } = this._cam;

    const span = this._activeScene?.gridSpan;
    if (span) {
      const half = span / 2;
      // ((v + half) % span + span) % span - half → [-half, +half) 범위로 랩
      target.x = ((target.x + half) % span + span) % span - half;
      target.z = ((target.z + half) % span + span) % span - half;
    }

    this.camera.position.set(target.x + 9, 9, target.z + 9);
    this.camera.lookAt(target);
  }

  _updateCameraFrustum() {
    const aspect = window.innerWidth / window.innerHeight;
    const h = this._cam.zoom;
    const w = h * aspect;
    this.camera.left   = -w;
    this.camera.right  =  w;
    this.camera.top    =  h;
    this.camera.bottom = -h;
    // near/far를 zoom에 비례해 함께 갱신 — 줌 아웃 시 컬링 범위 확장
    // near 음수: 아이소메트릭 카메라 하단부 바닥이 뷰 뒤쪽에 위치하는 현상 대응
    this.camera.near = -h * 12;
    this.camera.far  =  h * 25;
    this.camera.updateProjectionMatrix();
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

      // 키보드 이동 (WASD + 방향키)
      this._applyKeyMovement(delta);

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

      // 렌더 (OutlineEffect → 카툰 외곽선 자동 적용)
      if (this._activeScene) {
        this.outlineEffect.render(this._activeScene.scene, this.camera);
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
    this._activeScene?.dispose();
    this.renderer.dispose();
    this.outlineEffect = null;
  }
}
