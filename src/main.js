/**
 * main.js — 앱 진입점
 * 모든 시스템과 컴포넌트를 초기화하고 스토어 구독으로 연결
 */

import './styles/global.css';

import { store, toggleUI, tickSessionCoins, showNotification } from './store/gameStore.js';
import { tryAutoLogin, persistCoins }                          from './systems/authService.js';
import { WorldRenderer }                                       from './systems/worldRenderer.js';

import { AuthModal }        from './components/AuthModal.js';
import { CharacterSelect }  from './components/CharacterSelect.js';
import { HUD }              from './components/HUD.js';
import { ChatPanel }        from './components/ChatPanel.js';
import { CoffeeMenu }       from './components/CoffeeMenu.js';
import { ToastManager, JoinRequestPanel } from './components/Notifications.js';

// ── DOM 레퍼런스 ──────────────────────────────────────────────
const canvas    = document.getElementById('world-canvas');
const uiRoot    = document.getElementById('ui-root');
const overlayEl = document.getElementById('overlay');

if (!canvas || !uiRoot) {
  throw new Error('필수 DOM 요소(#world-canvas, #ui-root)를 찾을 수 없습니다.');
}

// ── 활성 컴포넌트 추적 ────────────────────────────────────────
let renderer       = null;
let hud            = null;
let authModal      = null;
let characterSelect = null;
let chatPanel      = null;
let coffeeMenu     = null;
let joinPanel      = null;
let toastManager   = null;
let coinTimer      = null;
let saveTimer      = null;

// ── 1. Toast 알림 시스템 (항상 유지) ─────────────────────────
function initToasts() {
  toastManager = new ToastManager();
}

// ── 2. Three.js 월드 렌더러 ───────────────────────────────────
function initWorld() {
  renderer = new WorldRenderer(canvas);
  renderer.start();
}

// ── 3. 인증 모달 ─────────────────────────────────────────────
function mountAuthModal() {
  if (authModal) return;
  authModal = new AuthModal(uiRoot);
  // 로그인 성공 시 authModal이 자체적으로 destroy됨 (store 구독 내부)
}

function destroyAuthModal() {
  authModal?.destroy();
  authModal = null;
}

// ── 4. HUD (인게임 UI) ────────────────────────────────────────
function mountHUD() {
  if (hud) return;
  hud = new HUD(uiRoot);
}

function destroyHUD() {
  hud?.destroy?.();
  hud = null;
}

// ── 5. 캐릭터 선택 ───────────────────────────────────────────
function mountCharacterSelect() {
  if (characterSelect) return;
  characterSelect = new CharacterSelect(uiRoot);
}

function destroyCharacterSelect() {
  characterSelect?.destroy();
  characterSelect = null;
}

// ── 6. 채팅 패널 ─────────────────────────────────────────────
function mountChatPanel() {
  if (chatPanel) return;
  chatPanel = new ChatPanel(uiRoot);
}

function destroyChatPanel() {
  chatPanel?.destroy();
  chatPanel = null;
}

// ── 7. 커피 주문 메뉴 ────────────────────────────────────────
function mountCoffeeMenu() {
  if (coffeeMenu) return;
  coffeeMenu = new CoffeeMenu(uiRoot);
}

function destroyCoffeeMenu() {
  coffeeMenu?.destroy();
  coffeeMenu = null;
}

// ── 8. 합석 요청 패널 ────────────────────────────────────────
function mountJoinPanel() {
  if (joinPanel) return;
  joinPanel = new JoinRequestPanel(uiRoot);
}

function destroyJoinPanel() {
  joinPanel?.destroy();
  joinPanel = null;
}

// ── 9. 씬 로드 및 멀티플레이어 시뮬 시작 ─────────────────────
function onLoginSuccess(user) {
  destroyAuthModal();
  mountHUD();

  // 씬 로드 (worldRenderer.loadScene 내부에서 multiplayerSim.start 호출)
  const { scene } = store.getState();
  renderer?.loadScene(scene);

  // 코인 적립 타이머 (1분마다)
  clearInterval(coinTimer);
  coinTimer = setInterval(() => {
    tickSessionCoins();
  }, 60_000);

  // 코인 저장 타이머 (30초마다)
  clearInterval(saveTimer);
  saveTimer = setInterval(() => {
    const { auth } = store.getState();
    if (auth.user) persistCoins(auth.user.id, auth.user.coin);
  }, 30_000);

  // 오버레이 숨기기
  if (overlayEl) overlayEl.style.display = 'none';
}

function onLogout() {
  // 타이머 정리
  clearInterval(coinTimer);
  clearInterval(saveTimer);

  // 컴포넌트 정리
  destroyHUD();
  destroyChatPanel();
  destroyCoffeeMenu();
  destroyCharacterSelect();
  destroyJoinPanel();

  // renderer.loadScene(null) 내부에서 multiplayerSim.stop() 처리
  renderer?.loadScene(null);

  // 오버레이 복원
  if (overlayEl) overlayEl.style.display = '';

  // 인증 모달 다시 표시
  store.setState(s => ({ ui: { ...s.ui, showAuth: true } }));
  mountAuthModal();
}

// ── 10. 스토어 구독 ───────────────────────────────────────────
function wireStore() {
  let prev = store.getState();

  store.subscribe((next) => {
    // prev를 먼저 갱신해야 재진입(re-entrant) setState 호출 시
    // 동일 조건이 반복 트리거되는 무한 루프를 방지할 수 있음
    const prevAuth = prev.auth;
    const prevUI   = prev.ui;
    const prevScene = prev.scene;
    const prevChatOpen = prev.isChatOpen;
    prev = next;

    const nextAuth = next.auth;
    const nextUI   = next.ui;

    // ── 로그인 상태 변화 ──
    if (!prevAuth.isLoggedIn && nextAuth.isLoggedIn && nextAuth.user) {
      onLoginSuccess(nextAuth.user);
    }
    if (prevAuth.isLoggedIn && !nextAuth.isLoggedIn) {
      onLogout();
    }

    // ── 씬 변경 ──
    if (prevScene !== next.scene && nextAuth.isLoggedIn) {
      renderer?.loadScene(next.scene);
      showNotification(
        next.scene === 'cafe'    ? '☕ 카페로 이동했어요.' :
        next.scene === 'airport' ? '✈️ 공항으로 이동했어요.' :
                                   '🌿 공원으로 이동했어요.',
        'info'
      );
    }

    // ── 채팅 패널 (isChatOpen은 최상위 상태) ──
    if (!prevChatOpen && next.isChatOpen) mountChatPanel();
    if (prevChatOpen  && !next.isChatOpen) destroyChatPanel();

    // ── 캐릭터 선택 ──
    if (!prevUI.showCharacterSelect && nextUI.showCharacterSelect) mountCharacterSelect();
    if (prevUI.showCharacterSelect  && !nextUI.showCharacterSelect) destroyCharacterSelect();

    // ── 커피 메뉴 ──
    if (!prevUI.showCoffeeMenu && nextUI.showCoffeeMenu) mountCoffeeMenu();
    if (prevUI.showCoffeeMenu  && !nextUI.showCoffeeMenu) destroyCoffeeMenu();

    // ── 합석 요청 패널 ──
    if (!prevUI.showJoinRequest && nextUI.showJoinRequest) mountJoinPanel();
    if (prevUI.showJoinRequest  && !nextUI.showJoinRequest) destroyJoinPanel();
  });
}

// ── 11. 키보드 단축키 ────────────────────────────────────────
function bindGlobalKeys() {
  document.addEventListener('keydown', (e) => {
    const { auth, ui } = store.getState();
    if (!auth.isLoggedIn) return;

    // ESC: 열린 패널 순차 닫기
    if (e.key === 'Escape') {
      if (ui.showCoffeeMenu)     { toggleUI('showCoffeeMenu', false);     return; }
      if (ui.showCharacterSelect){ toggleUI('showCharacterSelect', false); return; }
      if (ui.showJoinRequest)    { toggleUI('showJoinRequest', false);    return; }
      const { isChatOpen } = store.getState();
      if (isChatOpen) {
        store.setState({ isChatOpen: false });
        return;
      }
    }

    // Enter: 채팅 빠른 열기 (채팅창이 포커스되지 않은 경우)
    if (e.key === 'Enter' && !ui.showCoffeeMenu && !ui.showCharacterSelect) {
      const activeTag = document.activeElement?.tagName;
      if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
        store.setState(s => ({ isChatOpen: !s.isChatOpen }));
      }
    }
  });
}

// ── 12. 창 크기 변화 대응 ────────────────────────────────────
function bindResize() {
  // WorldRenderer가 내부적으로 이미 resize 이벤트를 바인딩하므로
  // 여기서는 추가 UI 레이아웃 조정만 처리
  window.addEventListener('resize', () => {
    // 채팅 패널 등 DOM 기반 컴포넌트 재조정 (필요 시 확장)
  });
}

// ── 13. 페이지 언로드 시 코인 저장 ───────────────────────────
function bindUnload() {
  window.addEventListener('beforeunload', () => {
    const { auth } = store.getState();
    if (auth.user) persistCoins(auth.user.id, auth.user.coin);
  });
}

// ── 14. 로딩 스크린 숨기기 ───────────────────────────────────
function hideLoader() {
  const loader = document.getElementById('loading-screen');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.transition = 'opacity 0.5s ease';
    setTimeout(() => loader.remove(), 500);
  }
}

// ── BOOT ─────────────────────────────────────────────────────
async function boot() {
  try {
    initToasts();
    initWorld();
    wireStore();
    bindGlobalKeys();
    bindResize();
    bindUnload();

    // 자동 로그인 시도 (저장된 세션 복원)
    const resumed = tryAutoLogin();

    if (!resumed) {
      // 저장된 세션 없음 → 인증 모달 표시
      mountAuthModal();
    }
    // resumed === true 이면 store.setState로 auth.isLoggedIn이 true가 되어
    // wireStore 구독의 onLoginSuccess가 자동 호출됨

    hideLoader();

  } catch (err) {
    console.error('[Somewhere] 부팅 오류:', err);
    // 최소한의 에러 메시지 표시
    uiRoot.innerHTML = `
      <div style="
        position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
        background:#fdf6ec; font-family:sans-serif; text-align:center; padding:2rem;
      ">
        <div>
          <div style="font-size:3rem; margin-bottom:1rem;">☕</div>
          <h2 style="color:#5c3d2e; margin-bottom:.5rem;">잠시 자리를 비웠어요</h2>
          <p style="color:#8b6343; margin-bottom:1.5rem;">페이지를 새로고침 해주세요.</p>
          <button onclick="location.reload()"
            style="
              background:#c47d4a; color:#fff; border:none; border-radius:12px;
              padding:.75rem 2rem; font-size:1rem; cursor:pointer;
            ">
            새로고침
          </button>
          <details style="margin-top:1rem; color:#aaa; font-size:.8rem;">
            <summary>오류 상세</summary>
            <pre style="text-align:left; margin-top:.5rem;">${err.message}</pre>
          </details>
        </div>
      </div>
    `;
  }
}

// DOM 준비 후 부팅
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
