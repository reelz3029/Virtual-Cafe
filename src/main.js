/**
 * main.js — 앱 진입점
 * 로딩 → (자동)로그인 → RoomAllocator 방 배정 → presence 접속 → 데모 카페 구동
 *
 * 남긴 기능: 로그인/세션(authService), 방 샤딩(roomAllocator), presence, 토스트
 * 본체: cafeWorld (해질녘 책방 카페 데모)
 */

import { store } from './store/gameStore.js';
import { tryAutoLogin, logout } from './systems/authService.js';
import { AuthModal } from './components/AuthModal.js';
import { ToastManager } from './components/Notifications.js';
import { CafeWorld } from './cafeWorld.js';
import { presenceManager } from './systems/presenceManager.js';
import { roomAllocator } from './systems/roomAllocator.js';

const app    = document.getElementById('app');
const uiRoot = document.getElementById('ui-root');
const uiEls  = [...document.querySelectorAll('.ui')];

new ToastManager();
const world = new CafeWorld(app);

let joined = false;
let authModal = null;
let currentMood = null;

function showUI(show) { uiEls.forEach(el => el.classList.toggle('hidden', !show)); }

function updateTopbar() {
  const el = document.getElementById('onlineCount');
  if (!el) return;
  const n = presenceManager.getTotalCount() || 1;
  el.textContent = currentMood
    ? `${currentMood.emoji} ${currentMood.name} · ${n}명 공부중`
    : `${n}명 공부중`;
}

// ── 로그인 성공 → 방 배정 + presence + 고양이 동기화 ──────────
async function onLogin(user) {
  if (joined) return;
  joined = true;
  authModal?.destroy(); authModal = null;
  showUI(true);
  world.setMyId(user.id);

  const { scene, mood } = await roomAllocator.allocate('cafe');
  currentMood = mood;

  const sync = () => {
    const others = presenceManager.getOthers();
    const players = [
      { id: user.id, name: user.username },
      ...others.map(o => ({ id: o.id, name: o.username })),
    ];
    world.setPlayers(players);
    updateTopbar();
    roomAllocator.reconcile(presenceManager.getTotalCount());
  };

  presenceManager.join(user, scene, sync);
  sync(); // 초기(나 혼자) 즉시 반영
}

// 스토어에서 로그인 상태 감지
store.subscribe(s => { if (s.auth.isLoggedIn && !joined) onLogin(s.auth.user); });

// ── 시점 컨트롤 (둘러보기 / 내 자리 / 노을 토글) ──────────────
document.querySelectorAll('.vbtn[data-view]').forEach(b => {
  b.onclick = () => {
    const v = b.dataset.view;
    if (v === 'sunset') {
      const sunset = world.toggleSunset();
      b.classList.toggle('active', !sunset);
      return;
    }
    document.querySelectorAll('.vbtn[data-view]').forEach(x => {
      if (x.dataset.view !== 'sunset') x.classList.remove('active');
    });
    b.classList.add('active');
    world.setView(v);

    const cap = document.getElementById('caption');
    if (v === 'iso') {
      cap.querySelector('.title').textContent = '해질녘 책방 카페';
      cap.querySelector('.desc').textContent  = '각자의 사물에 몰입한 고양이들 · 단면 인형의집 구조 · 종이질감 오버레이';
    } else {
      cap.querySelector('.title').textContent = '내 자리 — 창가 햇살';
      cap.querySelector('.desc').textContent  = '자리에 앉으면 카메라가 내 책상으로 · 창밖으로 흐릿한 다른 손님들';
    }
  };
});

// ── 로그아웃 ──────────────────────────────────────────────────
document.getElementById('btn-logout').onclick = () => {
  presenceManager.leave();
  roomAllocator.leave();
  logout();
  joined = false;
  currentMood = null;
  showUI(false);
  world.setPlayers([]);
  authModal = new AuthModal(uiRoot);
};

// ── 부팅 ──────────────────────────────────────────────────────
showUI(false);
setTimeout(() => {
  const l = document.getElementById('loading');
  if (l) { l.style.opacity = 0; setTimeout(() => l.remove(), 600); }
}, 700);

if (!tryAutoLogin()) {
  authModal = new AuthModal(uiRoot);
}
