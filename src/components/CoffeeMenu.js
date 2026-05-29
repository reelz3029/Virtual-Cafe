/**
 * components/CoffeeMenu.js
 * 커피 주문 모달 — 가상 머니로 구매
 */

import { store, toggleUI, showNotification, orderCoffee } from '../store/gameStore.js';

export class CoffeeMenu {
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
    const { coffeeMenu, auth, heldCoffee } = store.getState();
    const coins = auth.user?.coin || 0;

    return `
<style>
.coffee-overlay {
  position: fixed;
  inset: 0;
  background: rgba(26,12,6,0.48);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 30;
  animation: fadeIn 0.2s ease both;
}
.coffee-sheet {
  background: #FFF8F2;
  border-radius: 24px 24px 0 0;
  width: 100%;
  max-width: 480px;
  padding: 20px 20px 36px;
  box-shadow: 0 -10px 40px rgba(26,12,6,0.18);
  animation: slideInUp 0.35s cubic-bezier(0.16,1,0.3,1) both;
  max-height: 80vh;
  overflow-y: auto;
  border-top: 1px solid rgba(200,150,80,0.18);
}
@keyframes slideInUp {
  from { transform: translateY(100%); opacity: 0.8; }
  to   { transform: translateY(0); opacity: 1; }
}

.coffee-handle {
  width: 38px; height: 4px;
  background: rgba(200,150,80,0.36);
  border-radius: 2px;
  margin: 0 auto 20px;
}
.coffee-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.coffee-title {
  font-family: 'Gowun Batang', serif;
  font-size: 20px;
  font-weight: 700;
  color: #3A2410;
}
.coffee-coins {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: #8A6010;
  background: rgba(232,184,75,0.12);
  border: 1px solid rgba(232,184,75,0.28);
  border-radius: 10px;
  padding: 5px 10px;
}

/* 현재 들고 있는 음료 */
.coffee-held-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(168,120,56,0.06);
  border: 1px solid rgba(200,150,80,0.22);
  border-radius: 14px;
  margin-bottom: 14px;
  font-size: 12.5px;
  color: #5A3818;
}
.coffee-held-emoji { font-size: 22px; animation: float 2s ease-in-out infinite; }

/* 메뉴 그리드 */
.coffee-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}
.coffee-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 10px 12px;
  background: #FFFFFF;
  border: 1.5px solid rgba(200,150,80,0.18);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.18s;
  text-align: center;
  font-family: inherit;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(26,12,6,0.04);
}
.coffee-item::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(160deg, rgba(255,248,230,.6) 0%, transparent 60%);
  pointer-events: none;
}
.coffee-item:hover:not(:disabled) {
  background: #FFF5E8;
  border-color: rgba(200,150,80,0.45);
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(140,80,20,0.12);
}
.coffee-item:disabled { opacity: 0.4; cursor: not-allowed; }
.coffee-item:active:not(:disabled) { transform: translateY(-1px); }

.coffee-emoji { font-size: 30px; }
.coffee-name { font-size: 12.5px; font-weight: 600; color: #3A2410; }
.coffee-desc { font-size: 10.5px; color: #A07838; }
.coffee-price {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  font-weight: 600;
  color: #8A6010;
  background: rgba(232,184,75,0.12);
  padding: 3px 8px;
  border-radius: 6px;
}

/* 닫기 버튼 */
.btn-close-coffee {
  width: 100%;
  padding: 12px;
  background: #FFF0E0;
  color: #7A5228;
  border: 1.5px solid rgba(200,150,80,0.22);
  border-radius: 14px;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-close-coffee:hover {
  background: #F5E0C8;
  transform: translateY(-1px);
}

/* 코인 부족 경고 */
.coin-warning {
  font-size: 11px;
  color: #C03030;
  text-align: center;
  margin-bottom: 8px;
  display: none;
}
.coin-warning.visible { display: block; }

/* 코인 적립 안내 */
.coin-earn-tip {
  text-align: center;
  font-size: 11px;
  color: #C8A068;
  margin-bottom: 12px;
  padding: 7px 10px;
  background: rgba(232,184,75,0.07);
  border-radius: 10px;
  border: 1px dashed rgba(200,150,80,0.25);
}
</style>

<div class="coffee-overlay" id="coffee-overlay">
  <div class="coffee-sheet">
    <div class="coffee-handle"></div>
    <div class="coffee-header">
      <h2 class="coffee-title">☕ 카페 메뉴</h2>
      <div class="coffee-coins">
        <span>🪙</span>
        <span id="coffee-coin-display">${coins}</span>
      </div>
    </div>

    ${heldCoffee ? `
    <div class="coffee-held-banner">
      <span class="coffee-held-emoji">${heldCoffee.emoji}</span>
      <div>
        <div style="font-weight:600">${heldCoffee.name} 드시는 중!</div>
        <div style="font-size:11px;color:#A07840;margin-top:2px">새 음료를 주문하면 교체돼요</div>
      </div>
    </div>
    ` : ''}

    <div class="coin-earn-tip">🪙 접속 시간 1분마다 코인이 적립돼요!</div>

    <div class="coin-warning" id="coin-warning">코인이 부족해요. 조금 더 기다려주세요! 🪙</div>

    <div class="coffee-grid">
      ${coffeeMenu.map(item => `
        <button class="coffee-item" data-id="${item.id}" ${coins < item.price ? 'disabled' : ''}>
          <span class="coffee-emoji">${item.emoji}</span>
          <span class="coffee-name">${item.name}</span>
          <span class="coffee-desc">${item.desc}</span>
          <span class="coffee-price">🪙 ${item.price}</span>
        </button>
      `).join('')}
    </div>

    <button class="btn-close-coffee" id="btn-close-coffee">닫기</button>
  </div>
</div>
`;
  }

  _bindEvents() {
    // 오버레이 배경 클릭
    this._el.querySelector('#coffee-overlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) this._close();
    });

    // 닫기
    this._el.querySelector('#btn-close-coffee')?.addEventListener('click', () => this._close());

    // 아이템 주문
    this._el.querySelectorAll('.coffee-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const success = orderCoffee(id);

        if (!success) {
          const warn = this._el.querySelector('#coin-warning');
          if (warn) {
            warn.classList.add('visible');
            setTimeout(() => warn.classList.remove('visible'), 2500);
          }
          return;
        }

        const { coffeeMenu } = store.getState();
        const coffee = coffeeMenu.find(c => c.id === id);
        showNotification(`${coffee.emoji} ${coffee.name} 주문 완료!`, 'success');
        this._close();
      });
    });
  }

  _syncState() {
    const { auth } = store.getState();
    const coinEl = this._el.querySelector('#coffee-coin-display');
    if (coinEl) coinEl.textContent = auth.user?.coin || 0;
  }

  _close() {
    toggleUI('showCoffeeMenu', false);
    this._el.querySelector('.coffee-overlay').style.animation = 'fadeIn 0.2s ease reverse both';
    setTimeout(() => this._el.remove(), 200);
  }

  destroy() {
    this._unsubscribe?.();
    this._el?.remove();
  }
}
