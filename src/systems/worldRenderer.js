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
      minZoom:   3,
      maxZoom:   14,
      isDragging: false,
      dragStart: { x: 0, y: 0 },   // 드래그 시작점 (클릭 구분용)
      lastMouse: { x: 0, y: 0 },
      velocity:  { x: 0, z: 0 },
    };

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
      antialias: window.devicePixelRatio < 2, // 고해상도에선 antialias 끄기
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0xF0E8D4, 1);
    this.renderer.shadowMap.enabled = false;
  }

  _initCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const h = this._cam.zoom;
    this.camera = new THREE.OrthographicCamera(
      -h * aspect, h * aspect, h, -h, 0.1, 100
    );
    this.camera.position.set(9, 9, 9);
    this.camera.lookAt(0, 0, 0);
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────
  _bindEvents() {
    this.canvas.addEventListener('mousedown',  e => this._onMouseDown(e));
    window.addEventListener('mousemove',       e => this._onWindowMouseMove(e));
    window.addEventListener('mouseup',         e => this._onMouseUp(e));
    this.canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: true });
    window.addEventListener('touchmove',       e => this._onTouchMove(e),  { passive: true });
    window.addEventListener('touchend',        e => this._onMouseUp(e));
    this.canvas.addEventListener('wheel',      e => this._onWheel(e), { passive: true });
    window.addEventListener('resize',          () => this._onResize());
    document.addEventListener('mouseleave',    () => this._hideTableTooltip());
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    this._cam.isDragging = true;
    this._cam.dragStart  = { x: e.clientX, y: e.clientY };
    this._cam.lastMouse  = { x: e.clientX, y: e.clientY };
    this._cam.velocity   = { x: 0, z: 0 };
  }

  // window 전체 mousemove — drag + hover 통합
  _onWindowMouseMove(e) {
    if (this._cam.isDragging) {
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
    const delta = e.deltaY > 0 ? 1.08 : 0.93;
    this._cam.zoom = Math.max(this._cam.minZoom,
      Math.min(this._cam.maxZoom, this._cam.zoom * delta));
    this._updateCameraFrustum();
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
  _updateCameraPosition() {
    const { target } = this._cam;
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

    switch (sceneName) {
      case 'cafe':
      default:
        this._activeScene = new CafeScene();
        break;
    }

    this._hideTableTooltip();
    // 멀티플레이어 시작 — 씬 이름 전달로 Firebase 경로 분리
    multiplayerSim.stop();
    multiplayerSim.start(8, sceneName);
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

      // 캐릭터 diff 업데이트 (600ms마다) — 변경 없으면 즉시 리턴
      if (now - lastCharUpdate > 600) {
        this._diffUpdateCharacters();
        lastCharUpdate = now;
      }

      // 씬 update (스프라이트 float 등)
      this._activeScene?.update(this.camera, delta);

      // 렌더
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
    this._activeScene?.dispose();
    this.renderer.dispose();
  }
}
