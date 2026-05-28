/**
 * components/CharacterSelect.js
 * 캐릭터 선택 UI — 고양이 색상, 장신구 선택
 */

import { store, toggleUI } from '../store/gameStore.js';
import { saveCharacter } from '../systems/authService.js';
import { updateUserProfile } from '../store/gameStore.js';

// 선택 가능한 몸 색상
const BODY_COLORS = [
  { id: 'cream',   value: '#F4C896', label: '크림' },
  { id: 'orange',  value: '#E8965A', label: '오렌지' },
  { id: 'brown',   value: '#C47840', label: '브라운' },
  { id: 'gray',    value: '#B0A8A0', label: '그레이' },
  { id: 'white',   value: '#F0EDE8', label: '화이트' },
  { id: 'black',   value: '#4A3A2A', label: '다크' },
  { id: 'pink',    value: '#F0B8B8', label: '핑크' },
  { id: 'mint',    value: '#A8D8C0', label: '민트' },
  { id: 'lavender',value: '#C0B0D8', label: '라벤더' },
  { id: 'sky',     value: '#A0C8E8', label: '스카이' },
  { id: 'tan',     value: '#D4B090', label: '탄' },
  { id: 'sage',    value: '#98B890', label: '세이지' },
];

// 선택 가능한 장신구
const ACCESSORIES = [
  { id: 'glasses',    emoji: '👓', label: '안경' },
  { id: 'hat',        emoji: '🎩', label: '모자' },
  { id: 'bow',        emoji: '🎀', label: '리본' },
  { id: 'scarf',      emoji: '🧣', label: '목도리' },
  { id: 'headphones', emoji: '🎧', label: '헤드폰' },
];

export class CharacterSelect {
  constructor(container, onComplete) {
    this.container = container;
    this.onComplete = onComplete;

    // 현재 아바타 상태
    const { auth } = store.getState();
    this._avatar = { ...( auth.user?.avatar || { bodyColor: '#F4C896', accessories: [] }) };

    this._el = null;
    this._previewCanvas = null;
    this._render();
  }

  _render() {
    this._el = document.createElement('div');
    this._el.className = 'chara-overlay';
    this._el.innerHTML = this._getHTML();
    this.container.appendChild(this._el);
    this._bindEvents();
    this._updatePreview();
  }

  _getHTML() {
    const { accessories } = this._avatar;

    return `
<style>
.chara-overlay {
  position: fixed;
  inset: 0;
  background: rgba(26,15,8,0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.chara-card {
  background: #FFFFFF;
  border: 1px solid rgba(196,160,106,0.25);
  border-radius: 20px;
  box-shadow: 0 8px 40px rgba(26,15,8,0.18);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 32px;
  animation: scaleIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
}
.chara-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.chara-header h2 {
  font-family: 'Gowun Batang', serif;
  font-size: 20px;
  font-weight: 700;
  color: #3C2810;
  margin: 0;
}
.chara-header p {
  font-size: 12px;
  color: #A07840;
  margin: 4px 0 0;
}
.btn-close-chara {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: none;
  background: #F7F0E0;
  color: #7A5A28;
  cursor: pointer;
  font-size: 16px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.btn-close-chara:hover { background: #EDE3CC; }

/* 미리보기 */
.chara-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 110px;
  margin-bottom: 24px;
  background: linear-gradient(135deg, #F7F0E0 0%, #EDE3CC 100%);
  border-radius: 14px;
  border: 1px dashed rgba(196,160,106,0.4);
  position: relative;
  overflow: hidden;
}
.chara-preview::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 10px;
  background: rgba(196,160,106,0.2);
  border-radius: 50%;
}
#chara-preview-canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

/* 섹션 */
.chara-section {
  margin-bottom: 20px;
}
.chara-section-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #A07840;
  margin-bottom: 10px;
}

/* 색상 팔레트 */
.color-palette {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}
.color-swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  border: 2.5px solid transparent;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
  position: relative;
}
.color-swatch:hover { transform: scale(1.1); }
.color-swatch.active {
  border-color: #3C2810;
  transform: scale(1.08);
}
.color-swatch.active::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: rgba(0,0,0,0.6);
}

/* 장신구 */
.acc-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.acc-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  background: #F7F0E0;
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  color: #7A5A28;
  font-family: inherit;
  font-weight: 500;
  transition: all 0.15s;
}
.acc-chip:hover { background: #EDE3CC; }
.acc-chip.active {
  background: rgba(122,90,40,0.1);
  border-color: #7A5A28;
  color: #3C2810;
}
.acc-chip-emoji { font-size: 16px; }

/* 버튼 */
.chara-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.btn-chara-save {
  flex: 1;
  padding: 12px;
  background: #7A5A28;
  color: #F7F0E0;
  border: none;
  border-radius: 11px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-chara-save:hover {
  background: #5A3E18;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(90,62,24,0.3);
}
.btn-chara-reset {
  padding: 12px 16px;
  background: #F7F0E0;
  color: #A07840;
  border: 1.5px solid rgba(196,160,106,0.35);
  border-radius: 11px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-chara-reset:hover { background: #EDE3CC; }
</style>

<div class="chara-card">
  <div class="chara-header">
    <div>
      <h2>캐릭터 꾸미기</h2>
      <p>나만의 고양이를 만들어요</p>
    </div>
    <button class="btn-close-chara" id="btn-close-chara">✕</button>
  </div>

  <!-- 미리보기 -->
  <div class="chara-preview">
    <canvas id="chara-preview-canvas" width="96" height="96"></canvas>
  </div>

  <!-- 색상 선택 -->
  <div class="chara-section">
    <div class="chara-section-label">몸 색상</div>
    <div class="color-palette">
      ${BODY_COLORS.map(c => `
        <div class="color-swatch ${this._avatar.bodyColor === c.value ? 'active' : ''}"
          data-color="${c.value}"
          style="background:${c.value};"
          title="${c.label}">
        </div>
      `).join('')}
    </div>
  </div>

  <!-- 장신구 선택 (복수 선택) -->
  <div class="chara-section">
    <div class="chara-section-label">장신구 <span style="font-size:10px;color:#C4A06A;font-weight:400;text-transform:none;">(여러 개 선택 가능)</span></div>
    <div class="acc-grid">
      ${ACCESSORIES.map(a => `
        <button class="acc-chip ${accessories.includes(a.id) ? 'active' : ''}"
          data-acc="${a.id}">
          <span class="acc-chip-emoji">${a.emoji}</span>
          <span>${a.label}</span>
        </button>
      `).join('')}
    </div>
  </div>

  <div class="chara-actions">
    <button class="btn-chara-reset" id="btn-chara-reset">초기화</button>
    <button class="btn-chara-save" id="btn-chara-save">저장하고 입장 🐱</button>
  </div>
</div>
`;
  }

  _bindEvents() {
    // 닫기
    this._el.querySelector('#btn-close-chara')?.addEventListener('click', () => {
      this._close();
    });

    // 색상 선택
    this._el.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        this._avatar.bodyColor = swatch.dataset.color;
        this._el.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this._updatePreview();
      });
    });

    // 장신구 토글
    this._el.querySelectorAll('.acc-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const accId = chip.dataset.acc;
        const idx = this._avatar.accessories.indexOf(accId);
        if (idx >= 0) {
          this._avatar.accessories.splice(idx, 1);
          chip.classList.remove('active');
        } else {
          this._avatar.accessories.push(accId);
          chip.classList.add('active');
        }
        this._updatePreview();
      });
    });

    // 저장
    this._el.querySelector('#btn-chara-save')?.addEventListener('click', () => {
      this._save();
    });

    // 초기화
    this._el.querySelector('#btn-chara-reset')?.addEventListener('click', () => {
      this._avatar = { bodyColor: '#F4C896', accessories: [] };
      this._refresh();
    });
  }

  _updatePreview() {
    const canvas = this._el.querySelector('#chara-preview-canvas');
    if (!canvas) return;

    // 동적 import로 characterRenderer 사용
    import('../utils/characterRenderer.js').then(({ createCharacterSprite }) => {
      // Canvas 직접 그리기
      this._drawPreviewDirect(canvas);
    });
  }

  /** 미리보기를 Canvas 2D로 직접 그리기 */
  _drawPreviewDirect(canvas) {
    // characterRenderer의 내부 드로잉 로직을 재사용하기 위해
    // 별도 canvas를 만들어 복사
    const temp = document.createElement('canvas');
    temp.width = 128;
    temp.height = 128;

    // 간단히 characterRenderer의 drawCharacter 함수 효과를 직접 구현
    // (캐릭터 렌더러를 직접 임포트할 수 없어 간단한 버전으로)
    this._drawSimplePreview(canvas, this._avatar);
  }

  _drawSimplePreview(canvas, avatar) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    const scale = size / 128;
    ctx.save();
    ctx.scale(scale, scale);

    const cx = 64;
    const bodyColor = avatar.bodyColor || '#F4C896';
    const accessories = avatar.accessories || [];
    const dark = this._darken(bodyColor, 0.2);
    const light = this._lighten(bodyColor, 0.15);

    // 그림자
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#3A2010';
    ctx.beginPath();
    ctx.ellipse(cx, 110, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 꼬리
    ctx.save();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + 16, 92);
    ctx.quadraticCurveTo(cx + 40, 85, cx + 30, 68);
    ctx.stroke();
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // 몸통
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(cx, 82, 22, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // 앞발
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(cx - 14, 100, 7, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 14, 100, 7, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(cx - 14, 103, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 14, 103, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // 귀
    if (!accessories.includes('hat')) {
      ctx.fillStyle = bodyColor;
      ctx.beginPath(); ctx.moveTo(cx-22,42); ctx.lineTo(cx-32,20); ctx.lineTo(cx-10,34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F8C0C0';
      ctx.beginPath(); ctx.moveTo(cx-21,40); ctx.lineTo(cx-28,25); ctx.lineTo(cx-13,36); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bodyColor;
      ctx.beginPath(); ctx.moveTo(cx+22,42); ctx.lineTo(cx+32,20); ctx.lineTo(cx+10,34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F8C0C0';
      ctx.beginPath(); ctx.moveTo(cx+21,40); ctx.lineTo(cx+28,25); ctx.lineTo(cx+13,36); ctx.closePath(); ctx.fill();
    }

    // 머리
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(cx, 56, 26, 0, Math.PI * 2);
    ctx.fill();

    // 눈
    if (!accessories.includes('glasses')) {
      ctx.fillStyle = '#2A1A0A';
      ctx.beginPath(); ctx.ellipse(cx-9, 54, 4.5, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(cx-7, 52, 1.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2A1A0A';
      ctx.beginPath(); ctx.ellipse(cx+9, 54, 4.5, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(cx+11, 52, 1.5, 0, Math.PI*2); ctx.fill();
    } else {
      // 안경
      ctx.strokeStyle = '#5A3A1A'; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(180,210,240,0.3)';
      ctx.beginPath(); ctx.arc(cx-9, 54, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx+9, 54, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-2, 54); ctx.lineTo(cx+2, 54); ctx.stroke();
      ctx.fillStyle = '#2A1A0A';
      ctx.beginPath(); ctx.ellipse(cx-9, 54, 3.5, 4, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+9, 54, 3.5, 4, 0, 0, Math.PI*2); ctx.fill();
    }

    // 코
    ctx.fillStyle = '#E8808A';
    ctx.beginPath(); ctx.moveTo(cx,61); ctx.lineTo(cx-3,65); ctx.lineTo(cx+3,65); ctx.closePath(); ctx.fill();

    // 볼터치
    ctx.fillStyle = 'rgba(240,140,130,0.35)';
    ctx.beginPath(); ctx.ellipse(cx-14, 63, 5, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+14, 63, 5, 3, 0, 0, Math.PI*2); ctx.fill();

    // 모자
    if (accessories.includes('hat')) {
      ctx.fillStyle = '#3A2010';
      ctx.beginPath(); ctx.ellipse(cx, 36, 28, 6, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#4A2E14';
      ctx.fillRect(cx-18, 14, 36, 24);
      ctx.fillStyle = '#3A2010';
      ctx.beginPath(); ctx.ellipse(cx, 14, 18, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#C4704A';
      ctx.fillRect(cx-18, 29, 36, 6);
      ctx.fillStyle = '#E8B84B';
      ctx.fillRect(cx-5, 30, 10, 4);
    }

    // 리본
    if (accessories.includes('bow')) {
      const bx = cx + 22, by = 38;
      ctx.fillStyle = '#E8608A';
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.bezierCurveTo(bx-12,by-8,bx-12,by+8,bx,by); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.bezierCurveTo(bx+12,by-8,bx+12,by+8,bx,by); ctx.fill();
      ctx.fillStyle = '#C84A6A';
      ctx.beginPath(); ctx.arc(bx,by,3.5,0,Math.PI*2); ctx.fill();
    }

    // 목도리
    if (accessories.includes('scarf')) {
      ctx.fillStyle = '#E84848';
      ctx.fillRect(cx-22, 72, 44, 10);
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < 5; i++) { ctx.fillRect(cx-20+i*9, 74, 4, 2); }
    }

    // 헤드폰
    if (accessories.includes('headphones')) {
      ctx.strokeStyle = '#2A2A3A'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, 48, 28, Math.PI*1.15, Math.PI*1.85, false); ctx.stroke();
      ctx.fillStyle = '#3A3A4A';
      ctx.beginPath(); ctx.ellipse(cx+26, 52, 8, 10, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx-26, 52, 8, 10, -0.3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#6A6A8A';
      ctx.beginPath(); ctx.ellipse(cx+26, 52, 5, 7, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx-26, 52, 5, 7, -0.3, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();
  }

  _darken(hex, amt) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const toHex = v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
    return `#${toHex(r*(1-amt))}${toHex(g*(1-amt))}${toHex(b*(1-amt))}`;
  }

  _lighten(hex, amt) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const toHex = v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
    return `#${toHex(r+(255-r)*amt)}${toHex(g+(255-g)*amt)}${toHex(b+(255-b)*amt)}`;
  }

  _save() {
    const saved = saveCharacter({ ...this._avatar });
    updateUserProfile({ avatar: { ...this._avatar } });
    this.onComplete?.(this._avatar);
    this._close();
  }

  _refresh() {
    this._el.innerHTML = this._getHTML();
    this._bindEvents();
    this._updatePreview();
  }

  _close() {
    toggleUI('showCharacterSelect', false);
    this._el.style.animation = 'fadeIn 0.2s ease reverse both';
    setTimeout(() => this._el.remove(), 200);
  }

  destroy() {
    this._el?.remove();
  }
}
