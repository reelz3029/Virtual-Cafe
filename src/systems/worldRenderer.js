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

    this._initRenderer();
    this._initCamera();
    this._bindEvents();
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
    this.camera.position.set(0, 8, 8);
    this.camera.lookAt(0, 0, 0);
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────
  _bindEvents() {
    this.canvas.addEventListener('mousedown',  e => this._onMouseDown(e));
    window.addEventListener('mousemove',       e => this._onMouseMove(e));
    window.addEventListener('mouseup',         e => this._onMouseUp(e));
    this.canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: true });
    window.addEventListener('touchmove',       e => this._onTouchMove(e),  { passive: true });
    window.addEventListener('touchend',        e => this._onMouseUp(e));
    this.canvas.addEventListener('wheel',      e => this._onWheel(e), { passive: true });
    window.addEventListener('resize',          () => this._onResize());
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    this._cam.isDragging = true;
    this._cam.dragStart  = { x: e.clientX, y: e.clientY };
    this._cam.lastMouse  = { x: e.clientX, y: e.clientY };
    this._cam.velocity   = { x: 0, z: 0 };
  }

  _onMouseMove(e) {
    if (!this._cam.isDragging) return;
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
    this.camera.position.set(target.x, 8, target.z + 8);
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
