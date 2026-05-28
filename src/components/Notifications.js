/**
 * components/Notifications.js
 * 토스트 알림 + 합석 요청 패널
 */

import { store, resolveJoinRequest, toggleUI } from '../store/gameStore.js';
import { multiplayerSim } from '../systems/multiplayerSim.js';

// ── 토스트 알림 ───────────────────────────────────────────
export class ToastManager {
  constructor() {
    this._container = document.createElement('div');
    this._container.id = 'toast-container';
    this._container.style.cssText = `
      position: fixed;
      top: 70px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 9999;
      pointer-events: none;
      width: max-content;
      max-width: calc(100vw - 32px);
    `;

    const style = document.createElement('style');
    style.textContent = `
      .toast-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: rgba(255,255,255,0.95);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(196,160,106,0.3);
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(26,15,8,0.12);
        font-size: 13px;
        font-weight: 500;
        color: #3C2810;
        white-space: nowrap;
        animation: toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
        pointer-events: none;
        max-width: calc(100vw - 32px);
      }
      .toast-item.success { border-color: rgba(109,184,122,0.4); }
      .toast-item.error   { border-color: rgba(212,96,90,0.4); color: #C03030; }
      .toast-item.info    { border-color: rgba(90,140,212,0.35); }
      .toast-item.out     { animation: toast-out 0.25s ease both; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this._container);

    this._lastNotifId = null;
    this._unsubscribe = store.subscribe(state => {
      // notification.id가 바뀐 경우에만 표시 — 동일 알림이 다른 상태 변화로 중복 출력되는 것 방지
      if (state.notification && state.notification.id !== this._lastNotifId) {
        this._lastNotifId = state.notification.id;
        this._show(state.notification);
      }
    });
  }

  _show({ id, message, type = 'info' }) {
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    toast.dataset.id = id;

    const icons = { success: '✓', error: '✕', info: '·' };
    toast.textContent = message;

    this._container.appendChild(toast);

    // 자동 제거
    setTimeout(() => {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  destroy() {
    this._unsubscribe?.();
    this._container.remove();
  }
}

// ── 합석 요청 패널 ────────────────────────────────────────
export class JoinRequestPanel {
  constructor(container) {
    this.container = container;
    this._el = null;
    this._unsubscribe = null;

    this._render();
    this._unsubscribe = store.subscribe(() => this._syncState());
  }

  _render() {
    this._el = document.createElement('div');
    this._el.innerHTML = this._getHTML();
    this.container.appendChild(this._el);
    this._bindEvents();
  }

  _getHTML() {
    const { onlineUsers, auth, myTableId } = store.getState();
    const myId = auth.user?.id;

    // 다른 테이블에 있는 사람들 (합석 요청 가능)
    const others = onlineUsers.filter(u =>
      u.id !== myId && !u.isMe && u.tableId && u.tableId !== myTableId
    );

    return `
<style>
.join-overlay {
  position: fixed;
  inset: 0;
  background: rgba(26,15,8,0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  padding: 16px;
  animation: fadeIn 0.2s ease both;
}
.join-card {
  background: #FFFFFF;
  border: 1px solid rgba(196,160,106,0.25);
  border-radius: 20px;
  box-shadow: 0 8px 40px rgba(26,15,8,0.18);
  width: 100%;
  max-width: 380px;
  padding: 24px;
  animation: scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.join-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.join-title {
  font-family: 'Gowun Batang', serif;
  font-size: 18px;
  font-weight: 700;
  color: #3C2810;
}
.join-subtitle {
  font-size: 12px;
  color: #A07840;
  margin-top: 3px;
}
.btn-close-join {
  width: 28px; height: 28px;
  border-radius: 7px;
  border: none;
  background: #F7F0E0;
  color: #7A5A28;
  cursor: pointer;
  font-size: 13px;
  display: flex; align-items: center; justify-content: center;
}
.btn-close-join:hover { background: #EDE3CC; }

.join-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.join-user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #FDFAF4;
  border: 1px solid rgba(196,160,106,0.2);
  border-radius: 12px;
  transition: all 0.15s;
}
.join-user-item:hover { background: #F7F0E0; }
.join-avatar-circle {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: #F7F0E0;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  overflow: hidden;
}
.join-user-info { flex: 1; min-width: 0; }
.join-user-name {
  font-size: 13px;
  font-weight: 600;
  color: #3C2810;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.join-user-table {
  font-size: 11px;
  color: #A07840;
  margin-top: 1px;
}
.btn-join-request {
  padding: 6px 12px;
  background: #7A5A28;
  color: #F7F0E0;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  white-space: nowrap;
}
.btn-join-request:hover { background: #5A3E18; }
.btn-join-request.sent {
  background: #F7F0E0;
  color: #A07840;
  cursor: default;
}

.join-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  color: #C4A06A;
  font-size: 13px;
  text-align: center;
}
.join-empty-icon { font-size: 32px; }

/* 들어온 합석 요청 */
.join-incoming {
  background: rgba(109,184,122,0.06);
  border: 1px solid rgba(109,184,122,0.3);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}
.join-incoming-title {
  font-size: 12px;
  font-weight: 600;
  color: #3A7A46;
  margin-bottom: 8px;
}
.join-incoming-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.join-incoming-name { font-size: 13px; color: #3C2810; font-weight: 500; }
.join-accept-btns { display: flex; gap: 6px; }
.btn-accept, .btn-decline {
  padding: 5px 10px;
  border-radius: 7px;
  border: none;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.btn-accept { background: #6DB87A; color: #FFF; }
.btn-accept:hover { background: #4A9A58; }
.btn-decline { background: #F7F0E0; color: #7A5A28; }
.btn-decline:hover { background: #EDE3CC; }
</style>

<div class="join-overlay" id="join-overlay">
  <div class="join-card">
    <div class="join-header">
      <div>
        <h2 class="join-title">🤝 합석 요청</h2>
        <p class="join-subtitle">같은 테이블에서 함께 작업해요</p>
      </div>
      <button class="btn-close-join" id="btn-close-join">✕</button>
    </div>

    <div id="join-incoming-section"></div>

    <div class="join-list" id="join-list">
      ${others.length === 0 ? `
        <div class="join-empty">
          <div class="join-empty-icon">👥</div>
          <div>합석할 수 있는 사람이 없어요</div>
          <div style="font-size:11px">테이블에 먼저 앉아주세요!</div>
        </div>
      ` : others.slice(0, 10).map((user, i) => `
        <div class="join-user-item">
          <div class="join-avatar-circle">🐱</div>
          <div class="join-user-info">
            <div class="join-user-name">${user.username}</div>
            <div class="join-user-table">테이블 ${i + 1}</div>
          </div>
          <button class="btn-join-request" data-userid="${user.id}" data-username="${user.username}">
            합석 요청
          </button>
        </div>
      `).join('')}
    </div>
  </div>
</div>
`;
  }

  _bindEvents() {
    this._el.querySelector('#join-overlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) this._close();
    });

    this._el.querySelector('#btn-close-join')?.addEventListener('click', () => this._close());

    this._el.querySelectorAll('.btn-join-request').forEach(btn => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.userid;
        const username = btn.dataset.username;
        multiplayerSim.requestJoin(userId);
        btn.textContent = '요청 중...';
        btn.classList.add('sent');
        import('../store/gameStore.js').then(({ showNotification }) => {
          showNotification(`${username}님에게 합석 요청을 보냈어요.`, 'info');
        });
      });
    });
  }

  _syncState() {
    const { joinRequests } = store.getState();

    const section = this._el.querySelector('#join-incoming-section');
    if (!section) return;

    if (joinRequests.length > 0) {
      const req = joinRequests[0];
      section.innerHTML = `
        <div class="join-incoming">
          <div class="join-incoming-title">📩 합석 요청이 왔어요!</div>
          ${joinRequests.slice(0, 3).map(r => `
            <div class="join-incoming-item">
              <span class="join-incoming-name">🐱 ${r.fromName}</span>
              <div class="join-accept-btns">
                <button class="btn-accept" data-id="${r.fromId}">수락</button>
                <button class="btn-decline" data-id="${r.fromId}">거절</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      section.querySelectorAll('.btn-accept').forEach(btn => {
        btn.addEventListener('click', () => {
          resolveJoinRequest(btn.dataset.id, true);
          import('../store/gameStore.js').then(({ showNotification }) => {
            showNotification('합석을 수락했어요! 같은 테이블이 됐어요 🎉', 'success');
          });
        });
      });

      section.querySelectorAll('.btn-decline').forEach(btn => {
        btn.addEventListener('click', () => {
          resolveJoinRequest(btn.dataset.id, false);
        });
      });
    } else {
      section.innerHTML = '';
    }
  }

  _close() {
    toggleUI('showJoinRequest', false);
    this._el.querySelector('.join-overlay').style.animation = 'fadeIn 0.2s ease reverse both';
    setTimeout(() => this._el.remove(), 200);
  }

  destroy() {
    this._unsubscribe?.();
    this._el?.remove();
  }
}
