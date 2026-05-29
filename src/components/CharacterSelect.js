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
  background: rgba(26,12,6,0.52);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.chara-card {
  background: #FFF8F2;
  border: 1.5px solid rgba(200,150,80,0.22);
  border-radius: 24px;
  box-shadow: 0 10px 44px rgba(26,12,6,0.18);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 28px;
  animation: scaleIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
}
.chara-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}
.chara-header h2 {
  font-family: 'Gowun Batang', serif;
  font-size: 20px;
  font-weight: 700;
  color: #3A2410;
  margin: 0;
}
.chara-header p {
  font-size: 12px;
  color: #A07838;
  margin: 4px 0 0;
}
.btn-close-chara {
  width: 32px; height: 32px;
  border-radius: 9px;
  border: none;
  background: #FFF0E0;
  color: #7A5228;
  cursor: pointer;
  font-size: 16px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.btn-close-chara:hover { background: #F5E0C8; transform: scale(1.05); }

/* 미리보기 */
.chara-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  margin-bottom: 22px;
  background: linear-gradient(135deg, #FFF0DC 0%, #F5DFC0 100%);
  border-radius: 16px;
  border: 1.5px dashed rgba(200,150,80,0.36);
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
  background: rgba(200,150,80,0.18);
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
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #A07838;
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
  border-radius: 9px;
  border: 2.5px solid transparent;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  position: relative;
}
.color-swatch:hover { transform: scale(1.12); box-shadow: 0 3px 8px rgba(0,0,0,0.15); }
.color-swatch.active {
  border-color: #5A3818;
  transform: scale(1.08);
  box-shadow: 0 2px 8px rgba(90,56,24,0.25);
}
.color-swatch.active::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: rgba(0,0,0,0.55);
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
  background: #FFF5E8;
  border: 2px solid rgba(200,150,80,0.2);
  border-radius: 11px;
  cursor: pointer;
  font-size: 13px;
  color: #7A5228;
  font-family: inherit;
  font-weight: 500;
  transition: all 0.15s;
}
.acc-chip:hover { background: #F5E8D0; border-color: rgba(200,150,80,0.4); }
.acc-chip.active {
  background: rgba(168,120,56,0.10);
  border-color: #7A5228;
  color: #3A2410;
  box-shadow: 0 2px 6px rgba(90,52,18,0.12);
}
.acc-chip-emoji { font-size: 16px; }

/* 버튼 */
.chara-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.btn-chara-save {
  flex: 1;
  padding: 12px;
  background: linear-gradient(160deg, #8B5428 0%, #6A3C1A 100%);
  color: #FFF0E0;
  border: none;
  border-radius: 12px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: .01em;
}
.btn-chara-save:hover {
  background: linear-gradient(160deg, #9A6030 0%, #7A4620 100%);
  transform: translateY(-1px);
  box-shadow: 0 5px 16px rgba(90,52,18,0.28);
}
.btn-chara-reset {
  padding: 12px 16px;
  background: #FFF0E0;
  color: #A07838;
  border: 1.5px solid rgba(200,150,80,0.3);
  border-radius: 12px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-chara-reset:hover { background: #F5E0C8; }
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
