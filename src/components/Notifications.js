/**
 * components/Notifications.js
 * 토스트 알림 (showNotification → 화면 표시)
 */

import { store } from '../store/gameStore.js';

export class ToastManager {
  constructor() {
    this._container = document.createElement('div');
    this._container.id = 'toast-container';
    this._container.style.cssText = `
      position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      z-index: 9999; pointer-events: none;
      width: max-content; max-width: calc(100vw - 32px);
    `;

    const style = document.createElement('style');
    style.textContent = `
      .toast-item {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px;
        background: rgba(40,26,16,0.82); backdrop-filter: blur(12px);
        border: 1px solid rgba(255,210,150,0.22); border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        font-size: 13px; font-weight: 500; color: #FFE6C2;
        white-space: nowrap;
        animation: toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
        pointer-events: none; max-width: calc(100vw - 32px);
      }
      .toast-item.success { border-color: rgba(150,200,140,0.4); }
      .toast-item.error   { border-color: rgba(212,96,90,0.45); color: #F2B0A8; }
      .toast-item.out     { animation: toast-out 0.25s ease both; }
      @keyframes toast-in  { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
      @keyframes toast-out { to   { opacity:0; transform:translateY(-8px); } }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this._container);

    this._lastNotifId = null;
    this._unsubscribe = store.subscribe(state => {
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
    toast.textContent = message;
    this._container.appendChild(toast);
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
