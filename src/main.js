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
  // 내 캐릭터 회전을 presence 로 전송 (다른 클라이언트에 동기화)
  world.onFacing = (yaw) => presenceManager.setFacing(yaw);

  const { scene, mood } = await roomAllocator.allocate('cafe');
  currentMood = mood;

  const sync = () => {
    const others = presenceManager.getOthers();
    const players = [
      { id: user.id, name: user.username },
      ...others.map(o => ({ id: o.id, name: o.username, yaw: o.yaw })),
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
    const caps = {
      iso:  ['해질녘 책방 카페', '각자의 사물에 몰입한 고양이들 · 단면 인형의집 구조 · 종이질감 오버레이'],
      desk: ['내 자리 — 창가 햇살', '카메라가 내 책상으로 내려옵니다 · 창밖으로 흐릿한 다른 손님들'],
      fp:   ['1인칭 — 내 시선', '드래그 또는 방향키로 좌우·위아래를 둘러보세요'],
    };
    const [title, desc] = caps[v] || caps.iso;
    cap.querySelector('.title').textContent = title;
    cap.querySelector('.desc').textContent  = desc;
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
