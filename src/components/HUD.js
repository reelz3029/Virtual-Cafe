/**
 * components/HUD.js
 * 인게임 HUD — 상단 정보바, 하단 액션바
 * 코인, 접속자 수, 씬 선택, 채팅 토글 등
 */

import {
  store,
  toggleUI,
  toggleChat,
  showNotification,
} from '../store/gameStore.js';
import { logout } from '../systems/authService.js';

export class HUD {
  constructor(container) {
    this.container = container;
    this._el = null;
    this._unsubscribe = null;

    this._render();
    this._unsubscribe = store.subscribe(() => this._syncState());
  }

  _render() {
    this._el = document.createElement('div');
    this._el.className = 'hud-root';
    this._el.innerHTML = this._getHTML();
    this.container.appendChild(this._el);
    this._bindEvents();
  }

  _getHTML() {
    const { auth, onlineUsers, scene, isChatOpen, heldCoffee } = store.getState();
    const user = auth.user;
    if (!user) return '';

    const sceneLabels = { cafe: '☕ 카페', airport: '✈️ 공항', park: '🌳 공원' };
    const onlineCount = onlineUsers.length;

    return `
<style>
.hud-root { position: fixed; inset: 0; pointer-events: none; z-index: 10; }
.hud-root > * { pointer-events: auto; }

/* 상단 바 */
.hud-top {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,248,242,0.90);
  backdrop-filter: blur(14px) saturate(1.3);
  border: 1px solid rgba(200,150,80,0.25);
  border-radius: 16px;
  padding: 7px 12px;
  box-shadow: 0 3px 18px rgba(26,12,6,0.10), 0 1px 4px rgba(160,90,20,0.08);
  min-width: 300px;
  max-width: calc(100vw - 32px);
}

/* 로고 */
.hud-logo {
  font-family: 'Gowun Batang', serif;
  font-size: 15px;
  font-weight: 700;
  color: #5A3818;
  white-space: nowrap;
  margin-right: 4px;
  letter-spacing: .01em;
}

.hud-divider {
  width: 1px;
  height: 18px;
  background: rgba(200,150,80,0.35);
  flex-shrink: 0;
}

/* 씬 선택 */
.hud-scene-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: rgba(245,224,192,0.7);
  border: 1px solid rgba(200,150,80,0.28);
  border-radius: 9px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: #5A3818;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.hud-scene-btn:hover {
  background: rgba(232,200,140,0.7);
  border-color: rgba(200,150,80,.5);
}
.hud-scene-arrow { font-size: 9px; color: #A07838; margin-top: 1px; }

/* 접속자 */
.hud-online {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #7A5228;
  white-space: nowrap;
}
.hud-online-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #6DB87A;
  box-shadow: 0 0 0 2px rgba(109,184,122,.2);
  animation: pulse 2s ease-in-out infinite;
}

/* 코인 */
.hud-coin {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(232,184,75,0.10);
  border: 1px solid rgba(232,184,75,0.28);
  border-radius: 9px;
  font-size: 12px;
  font-weight: 600;
  color: #8A6010;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s;
}
.hud-coin:hover {
  background: rgba(232,184,75,0.20);
  transform: scale(1.03);
}
.hud-coin-icon { font-size: 13px; }

/* 사용자 아바타 버튼 */
.hud-user-btn {
  width: 32px; height: 32px;
  border-radius: 9px;
  background: rgba(245,224,192,0.8);
  border: 1.5px solid rgba(200,150,80,0.35);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
  transition: all 0.15s;
  flex-shrink: 0;
  position: relative;
}
.hud-user-btn:hover {
  background: rgba(232,200,140,0.9);
  transform: scale(1.06);
  box-shadow: 0 2px 8px rgba(140,80,20,.18);
}

/* 커피 뱃지 */
.hud-coffee-badge {
  position: absolute;
  top: -6px; right: -6px;
  background: #FFF;
  border-radius: 50%;
  width: 16px; height: 16px;
  font-size: 10px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(200,150,80,0.35);
  box-shadow: 0 1px 4px rgba(26,12,6,0.12);
}

/* 하단 액션바 */
.hud-bottom {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255,248,242,0.92);
  backdrop-filter: blur(14px) saturate(1.3);
  border: 1px solid rgba(200,150,80,0.25);
  border-radius: 18px;
  padding: 6px 10px;
  box-shadow: 0 6px 24px rgba(26,12,6,0.13), 0 2px 6px rgba(160,90,20,0.08);
}

.hud-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 7px 13px;
  background: transparent;
  border: none;
  border-radius: 11px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  min-width: 54px;
  position: relative;
}
.hud-action-btn:hover {
  background: rgba(245,224,192,0.8);
  transform: translateY(-1px);
}
.hud-action-btn:active { transform: translateY(0); }
.hud-action-btn.active {
  background: rgba(168,120,56,0.12);
  box-shadow: inset 0 1px 3px rgba(90,52,18,.08);
}
.hud-action-icon { font-size: 20px; line-height: 1; }
.hud-action-label {
  font-size: 10px;
  font-weight: 500;
  color: #7A5228;
  white-space: nowrap;
}

.hud-coffee-held .hud-action-icon { animation: float 2s ease-in-out infinite; }

/* 씬 드롭다운 */
.scene-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  background: #FFF;
  border: 1px solid rgba(200,150,80,0.25);
  border-radius: 14px;
  box-shadow: 0 10px 28px rgba(26,12,6,0.13);
  overflow: hidden;
  min-width: 150px;
  animation: fadeInDown 0.2s ease both;
  z-index: 50;
}
.scene-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: #5A3818;
  cursor: pointer;
  transition: background 0.1s;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  font-family: inherit;
}
.scene-item:hover { background: #FFF5E8; }
.scene-item.current { background: #FFF5E8; font-weight: 500; }
.scene-item-badge {
  margin-left: auto;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(200,160,80,0.16);
  color: #A07838;
}

/* 유저 메뉴 드롭다운 */
.user-dropdown {
  position: fixed;
  top: 60px;
  right: 16px;
  background: #FFF;
  border: 1px solid rgba(200,150,80,0.22);
  border-radius: 16px;
  box-shadow: 0 10px 36px rgba(26,12,6,0.15);
  overflow: hidden;
  min-width: 200px;
  animation: fadeInDown 0.2s ease both;
  z-index: 50;
}
.user-menu-header {
  padding: 14px 16px;
  background: linear-gradient(135deg, #FFF8F0 0%, #FFF0DC 100%);
  border-bottom: 1px solid rgba(200,150,80,0.14);
}
.user-menu-name { font-weight: 700; font-size: 14px; color: #3A2410; }
.user-menu-email { font-size: 11.5px; color: #A07838; margin-top: 2px; }
.user-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  font-size: 13px;
  color: #5A3818;
  cursor: pointer;
  transition: background 0.1s;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  font-family: inherit;
}
.user-menu-item:hover { background: #FFF5E8; }
.user-menu-item.danger { color: #C03030; }
.user-menu-item.danger:hover { background: rgba(208,88,74,.06); }

/* 힌트 텍스트 */
.hud-hint {
  position: absolute;
  bottom: 82px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11.5px;
  color: rgba(122,82,30,0.75);
  background: rgba(255,248,242,0.82);
  backdrop-filter: blur(6px);
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid rgba(200,150,80,0.18);
  white-space: nowrap;
  pointer-events: none;
  animation: fadeIn 0.5s ease both;
}
</style>

<!-- 상단 바 -->
<div class="hud-top" id="hud-top">
  <span class="hud-logo">☕ Somewhere</span>
  <div class="hud-divider"></div>

  <!-- 씬 선택 -->
  <div style="position:relative">
    <button class="hud-scene-btn" id="hud-scene-btn">
      <span>${sceneLabels[scene]}</span>
      <span class="hud-scene-arrow">▼</span>
    </button>
    <div class="scene-dropdown" id="scene-dropdown" style="display:none">
      ${Object.entries(sceneLabels).map(([key, label]) => `
        <button class="scene-item ${key === scene ? 'current' : ''}" data-scene="${key}">
          <span>${label}</span>
          ${key !== 'cafe' ? '<span class="scene-item-badge">준비중</span>' : ''}
        </button>
      `).join('')}
    </div>
  </div>

  <div class="hud-divider"></div>

  <!-- 접속자 -->
  <div class="hud-online">
    <div class="hud-online-dot"></div>
    <span id="hud-online-room"></span><span id="hud-online-count">${onlineCount}</span>명 접속중
  </div>

  <div style="flex:1"></div>

  <!-- 코인 -->
  <div class="hud-coin" id="hud-coin-display" title="접속 시간마다 코인이 적립됩니다">
    <span class="hud-coin-icon">🪙</span>
    <span id="hud-coin-value">${user.coin || 0}</span>
  </div>

  <!-- 사용자 버튼 -->
  <div style="position:relative">
    <button class="hud-user-btn" id="hud-user-btn" title="${user.username}">
      🐱
      ${heldCoffee ? `<div class="hud-coffee-badge">${heldCoffee.emoji}</div>` : ''}
    </button>
  </div>
</div>

<!-- 하단 액션바 -->
<div class="hud-bottom">
  <button class="hud-action-btn" id="hud-coffee-btn" title="커피 주문">
    <span class="hud-action-icon">${heldCoffee ? heldCoffee.emoji : '☕'}</span>
    <span class="hud-action-label">${heldCoffee ? heldCoffee.name : '주문'}</span>
  </button>

  <button class="hud-action-btn ${isChatOpen ? 'active' : ''}" id="hud-chat-btn" title="채팅">
    <span class="hud-action-icon">💬</span>
    <span class="hud-action-label">채팅</span>
  </button>

  <button class="hud-action-btn" id="hud-chara-btn" title="캐릭터 변경">
    <span class="hud-action-icon">🐱</span>
    <span class="hud-action-label">캐릭터</span>
  </button>

  <button class="hud-action-btn" id="hud-join-btn" title="합석 요청">
    <span class="hud-action-icon">🤝</span>
    <span class="hud-action-label">합석</span>
  </button>
</div>

<!-- 조작 힌트 -->
<div class="hud-hint" id="hud-hint">드래그로 이동 · 스크롤로 줌 · 테이블 클릭으로 착석</div>
`;
  }

  _bindEvents() {
    // 씬 드롭다운 토글
    const sceneBtn = this._el.querySelector('#hud-scene-btn');
    const sceneDropdown = this._el.querySelector('#scene-dropdown');
    sceneBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sceneDropdown.style.display !== 'none';
      sceneDropdown.style.display = isOpen ? 'none' : 'block';
    });

    // 씬 선택
    this._el.querySelectorAll('.scene-item').forEach(item => {
      item.addEventListener('click', () => {
        const sceneName = item.dataset.scene;
        if (sceneName !== 'cafe') {
          showNotification('아직 준비 중인 공간이에요. 곧 만나요! 🌱', 'info');
        } else {
          import('../store/gameStore.js').then(({ setScene }) => setScene(sceneName));
        }
        sceneDropdown.style.display = 'none';
      });
    });

    // 사용자 드롭다운
    const userBtn = this._el.querySelector('#hud-user-btn');
    userBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleUserMenu();
    });

    // 커피 주문
    const coffeeBtn = this._el.querySelector('#hud-coffee-btn');
    coffeeBtn?.addEventListener('click', () => {
      toggleUI('showCoffeeMenu', true);
    });

    // 채팅 토글
    const chatBtn = this._el.querySelector('#hud-chat-btn');
    chatBtn?.addEventListener('click', () => {
      toggleChat();
    });

    // 캐릭터 선택
    const charaBtn = this._el.querySelector('#hud-chara-btn');
    charaBtn?.addEventListener('click', () => {
      toggleUI('showCharacterSelect', true);
    });

    // 합석 패널
    const joinBtn = this._el.querySelector('#hud-join-btn');
    joinBtn?.addEventListener('click', () => {
      toggleUI('showJoinRequest', true);
    });

    // 바깥 클릭으로 드롭다운 닫기
    document.addEventListener('click', () => {
      if (sceneDropdown) sceneDropdown.style.display = 'none';
      this._removeUserMenu();
    });

    // 5초 후 힌트 숨기기
    setTimeout(() => {
      const hint = this._el.querySelector('#hud-hint');
      if (hint) {
        hint.style.transition = 'opacity 0.5s';
        hint.style.opacity = '0';
        setTimeout(() => hint.remove(), 500);
      }
    }, 5000);
  }

  _toggleUserMenu() {
    this._removeUserMenu();

    const { auth } = store.getState();
    const user = auth.user;
    if (!user) return;

    const menu = document.createElement('div');
    menu.className = 'user-dropdown';
    menu.id = 'user-dropdown';
    menu.innerHTML = `
      <div class="user-menu-header">
        <div class="user-menu-name">🐱 ${user.username}</div>
        ${user.email ? `<div class="user-menu-email">${user.email}</div>` : ''}
        ${user.isGuest ? '<div class="user-menu-email">게스트 모드</div>' : ''}
      </div>
      <button class="user-menu-item" id="umenu-chara">🎨 캐릭터 변경</button>
      <button class="user-menu-item" id="umenu-stats">📊 나의 기록</button>
      ${!user.isGuest ? '<button class="user-menu-item" id="umenu-settings">⚙️ 설정</button>' : ''}
      <div style="height:1px;background:rgba(196,160,106,0.15);margin:4px 0"></div>
      <button class="user-menu-item danger" id="umenu-logout">← 로그아웃</button>
    `;

    document.body.appendChild(menu);

    menu.querySelector('#umenu-chara')?.addEventListener('click', () => {
      toggleUI('showCharacterSelect', true);
      this._removeUserMenu();
    });

    menu.querySelector('#umenu-logout')?.addEventListener('click', () => {
      logout();
      this._removeUserMenu();
    });

    menu.querySelector('#umenu-stats')?.addEventListener('click', () => {
      const { auth, scene } = store.getState();
      const u = auth.user;
      showNotification(`총 코인: ${u.coin}🪙 · 현재 씬: ${scene}`, 'info', 4000);
      this._removeUserMenu();
    });
  }

  _removeUserMenu() {
    document.getElementById('user-dropdown')?.remove();
  }

  _syncState() {
    const { auth, onlineUsers, isChatOpen, heldCoffee } = store.getState();
    if (!auth.isLoggedIn) return;

    // 코인 업데이트
    const coinEl = this._el.querySelector('#hud-coin-value');
    if (coinEl) coinEl.textContent = auth.user?.coin || 0;

    // 접속자 수 + 룸 라벨
    const countEl = this._el.querySelector('#hud-online-count');
    if (countEl) countEl.textContent = onlineUsers.length;
    const roomEl = this._el.querySelector('#hud-online-room');
    if (roomEl) {
      const rm = store.getState().roomMood;
      roomEl.textContent = rm?.name ? `${rm.emoji ?? ''} ${rm.name} · ` : '';
    }

    // 채팅 버튼 활성화
    const chatBtn = this._el.querySelector('#hud-chat-btn');
    chatBtn?.classList.toggle('active', isChatOpen);

    // 커피 버튼
    const coffeeBtn = this._el.querySelector('#hud-coffee-btn');
    if (coffeeBtn) {
      const icon = coffeeBtn.querySelector('.hud-action-icon');
      const label = coffeeBtn.querySelector('.hud-action-label');
      if (icon) icon.textContent = heldCoffee ? heldCoffee.emoji : '☕';
      if (label) label.textContent = heldCoffee ? heldCoffee.name : '주문';
    }
  }

  destroy() {
    this._unsubscribe?.();
    this._removeUserMenu();
    this._el?.remove();
  }
}
