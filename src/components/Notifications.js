/**
 * components/Notifications.js
 * 토스트 알림 + 합석 요청 패널
 */

import { store, toggleUI } from '../store/gameStore.js';
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

// ── 합석 요청 알림 위젯 ───────────────────────────────────
// 캐릭터에 마우스 호버 시 합석 요청 버튼이 표시되므로,
// 이 패널은 "들어온 합석 요청" 처리 전용 소형 위젯
export class JoinRequestPanel {
  constructor(container) {
    this.container   = container;
    this._el         = null;
    this._unsubscribe = null;

    this._render();
    this._unsubscribe = store.subscribe(() => this._syncState());
  }

  _render() {
    this._el = document.createElement('div');
    this._el.innerHTML = `
<style>
.join-widget {
  position: fixed;
  bottom: 80px;
  left: 16px;
  width: 270px;
  background: rgba(255,255,255,0.97);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(109,184,122,0.35);
  border-radius: 16px;
  box-shadow: 0 6px 28px rgba(26,15,8,0.14);
  padding: 14px 16px;
  z-index: 30;
  animation: slideInLeft 0.3s cubic-bezier(0.16,1,0.3,1) both;
}
.join-widget-title {
  font-size: 12px;
  font-weight: 700;
  color: #3A7A46;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.join-req-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid rgba(196,160,106,0.15);
}
.join-req-name {
  font-size: 13px;
  font-weight: 600;
  color: #3C2810;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.join-req-btns { display: flex; gap: 5px; flex-shrink: 0; }
.btn-jr-accept, .btn-jr-decline {
  padding: 5px 10px;
  border-radius: 7px;
  border: none;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.btn-jr-accept  { background: #6DB87A; color: #FFF; }
.btn-jr-accept:hover  { background: #4A9A58; }
.btn-jr-decline { background: #F0E8D4; color: #7A5A28; }
.btn-jr-decline:hover { background: #E0D0B8; }
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to   { opacity: 1; transform: translateX(0); }
}
</style>
<div class="join-widget" id="join-widget" style="display:none">
  <div class="join-widget-title">📩 합석 요청이 왔어요!</div>
  <div id="join-req-list"></div>
</div>
`;
    this.container.appendChild(this._el);
    this._syncState();
  }

  _syncState() {
    const { joinRequests } = store.getState();
    const widget = this._el.querySelector('#join-widget');
    const list   = this._el.querySelector('#join-req-list');
    if (!widget || !list) return;

    if (!joinRequests.length) {
      widget.style.display = 'none';
      toggleUI('showJoinRequest', false);
      return;
    }
    widget.style.display = '';

    list.innerHTML = joinRequests.slice(0, 5).map(r => `
      <div class="join-req-item">
        <span class="join-req-name">🐱 ${this._esc(r.fromName)}</span>
        <div class="join-req-btns">
          <button class="btn-jr-accept"  data-id="${r.fromId}" data-key="${r._key || ''}">수락</button>
          <button class="btn-jr-decline" data-id="${r.fromId}" data-key="${r._key || ''}">거절</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-jr-accept').forEach(btn => {
      btn.addEventListener('click', () => {
        multiplayerSim.acceptJoin(btn.dataset.id, btn.dataset.key);
      });
    });
    list.querySelectorAll('.btn-jr-decline').forEach(btn => {
      btn.addEventListener('click', () => {
        multiplayerSim.declineJoin(btn.dataset.id, btn.dataset.key);
      });
    });
  }

  _esc(str = '') {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  destroy() {
    this._unsubscribe?.();
    this._el?.remove();
  }
}
