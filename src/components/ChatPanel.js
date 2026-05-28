/**
 * components/ChatPanel.js
 * 채팅 패널 — 합석한 사람들과 대화, 전체 공개 채팅
 */

import { store, toggleChat } from '../store/gameStore.js';
import { multiplayerSim } from '../systems/multiplayerSim.js';

export class ChatPanel {
  constructor(container) {
    this.container = container;
    this._el = null;
    this._unsubscribe = null;
    this._lastMsgId = null;

    this._render();
    this._unsubscribe = store.subscribe(state => this._syncState(state));
  }

  _render() {
    this._el = document.createElement('div');
    this._el.className = 'chat-wrapper';
    this._el.innerHTML = this._getHTML();
    this.container.appendChild(this._el);
    this._bindEvents();
  }

  _getHTML() {
    const { chatMessages, auth, tablemates, onlineUsers } = store.getState();
    const myId = auth.user?.id;

    return `
<style>
.chat-wrapper {
  position: fixed;
  right: 16px;
  bottom: 80px;
  width: 300px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(196,160,106,0.28);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(26,15,8,0.12);
  overflow: hidden;
  animation: slideInRight 0.3s cubic-bezier(0.16,1,0.3,1) both;
  z-index: 20;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(196,160,106,0.18);
  flex-shrink: 0;
}
.chat-header-title {
  font-size: 13px;
  font-weight: 600;
  color: #3C2810;
  display: flex;
  align-items: center;
  gap: 6px;
}
.chat-online-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(109,184,122,0.15);
  color: #3A7A46;
  border-radius: 5px;
  font-weight: 500;
}
.btn-close-chat {
  width: 24px; height: 24px;
  border-radius: 6px;
  border: none;
  background: #F7F0E0;
  color: #7A5A28;
  cursor: pointer;
  font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.btn-close-chat:hover { background: #EDE3CC; }

/* 탭 */
.chat-tabs {
  display: flex;
  padding: 6px 10px 0;
  gap: 0;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(196,160,106,0.15);
}
.chat-tab {
  flex: 1;
  padding: 6px 8px;
  font-size: 11.5px;
  font-weight: 500;
  color: #A07840;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  text-align: center;
}
.chat-tab:hover { color: #5A3E18; }
.chat-tab.active {
  color: #5A3E18;
  border-bottom-color: #7A5A28;
}

/* 메시지 리스트 */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 180px;
  max-height: 260px;
}
.chat-messages::-webkit-scrollbar { width: 3px; }
.chat-messages::-webkit-scrollbar-thumb { background: rgba(196,160,106,0.3); border-radius: 3px; }

.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: fadeInUp 0.2s ease both;
}
.chat-msg.mine { align-items: flex-end; }
.chat-msg.other { align-items: flex-start; }

.chat-msg-meta {
  font-size: 10px;
  color: #C4A06A;
  display: flex;
  align-items: center;
  gap: 4px;
}
.chat-msg.mine .chat-msg-meta { flex-direction: row-reverse; }

.chat-msg-bubble {
  max-width: 210px;
  padding: 7px 11px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.45;
  word-break: break-word;
}
.chat-msg.mine .chat-msg-bubble {
  background: #7A5A28;
  color: #F7F0E0;
  border-bottom-right-radius: 4px;
}
.chat-msg.other .chat-msg-bubble {
  background: #F7F0E0;
  color: #3C2810;
  border-bottom-left-radius: 4px;
}
.chat-msg.bot .chat-msg-bubble {
  background: #FDFAF4;
  border: 1px solid rgba(196,160,106,0.25);
  color: #5A3E18;
  border-bottom-left-radius: 4px;
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #C4A06A;
  font-size: 12px;
  padding: 20px;
  text-align: center;
}
.chat-empty-icon { font-size: 28px; }

/* 입력창 */
.chat-input-area {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-top: 1px solid rgba(196,160,106,0.15);
  flex-shrink: 0;
}
.chat-input {
  flex: 1;
  padding: 8px 11px;
  font-family: 'DM Sans', sans-serif;
  font-size: 12.5px;
  color: #3C2810;
  background: #FDFAF4;
  border: 1.5px solid rgba(196,160,106,0.25);
  border-radius: 9px;
  outline: none;
  transition: border-color 0.15s;
  resize: none;
}
.chat-input::placeholder { color: #C4A06A; }
.chat-input:focus {
  border-color: #A07840;
  background: #FFF;
}
.btn-chat-send {
  width: 34px; height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  border: none;
  background: #7A5A28;
  color: #F7F0E0;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.btn-chat-send:hover {
  background: #5A3E18;
  transform: scale(1.05);
}
.btn-chat-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
</style>

<div class="chat-header">
  <div class="chat-header-title">
    💬 채팅
    <span class="chat-online-badge" id="chat-online-badge">전체</span>
  </div>
  <button class="btn-close-chat" id="btn-close-chat">✕</button>
</div>

<div class="chat-messages" id="chat-messages">
  ${this._renderMessages(chatMessages, myId)}
</div>

<div class="chat-input-area">
  <textarea class="chat-input" id="chat-input" placeholder="메시지 입력... (Enter 전송)" rows="1" maxlength="100"></textarea>
  <button class="btn-chat-send" id="btn-chat-send">↑</button>
</div>
`;
  }

  _renderMessages(messages, myId) {
    if (!messages.length) {
      return `
        <div class="chat-empty">
          <div class="chat-empty-icon">☕</div>
          <div>아직 메시지가 없어요</div>
          <div style="font-size:11px;color:#DCC9A0">먼저 말을 걸어보세요!</div>
        </div>
      `;
    }
    return messages.slice(-50).map(msg => this._renderSingleMessage(msg, myId)).join('');
  }

  _renderSingleMessage(msg, myId) {
    const isMe = msg.from === myId;
    const isBot = msg.isBot;
    const time = new Date(msg.timestamp).toLocaleTimeString('ko-KR', {
      hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="chat-msg ${isMe ? 'mine' : isBot ? 'bot' : 'other'}">
        <div class="chat-msg-meta">
          <span>${isMe ? '나' : msg.fromName}</span>
          <span>${time}</span>
        </div>
        <div class="chat-msg-bubble">${this._escapeHtml(msg.text)}</div>
      </div>
    `;
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _bindEvents() {
    // 닫기
    this._el.querySelector('#btn-close-chat')?.addEventListener('click', () => {
      toggleChat(false);
    });

    // 전송
    const sendBtn = this._el.querySelector('#btn-chat-send');
    const input = this._el.querySelector('#chat-input');

    sendBtn?.addEventListener('click', () => this._sendMessage());
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
      // 높이 자동 조절
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 72) + 'px';
    });
  }

  _sendMessage() {
    const input = this._el.querySelector('#chat-input');
    const text = input?.value?.trim();
    if (!text) return;

    multiplayerSim.sendChat(text);

    input.value = '';
    input.style.height = 'auto';
  }

  _syncState(state) {
    const { chatMessages } = state;
    if (!chatMessages.length) return;

    const lastMsg = chatMessages[chatMessages.length - 1];
    if (lastMsg.id === this._lastMsgId) return;

    const myId = state.auth.user?.id;
    const messagesEl = this._el.querySelector('#chat-messages');
    if (!messagesEl) return;

    if (!this._lastMsgId) {
      // 첫 렌더 — 전체 그리기
      messagesEl.innerHTML = this._renderMessages(chatMessages, myId);
    } else {
      const lastIdx = chatMessages.findIndex(m => m.id === this._lastMsgId);
      if (lastIdx === -1) {
        // 이전 메시지 ID를 찾을 수 없음(메시지 잘림) — 전체 재렌더
        messagesEl.innerHTML = this._renderMessages(chatMessages, myId);
      } else {
        // 새 메시지만 추가 (전체 재작성 없이 append)
        const empty = messagesEl.querySelector('.chat-empty');
        if (empty) messagesEl.innerHTML = '';
        chatMessages.slice(lastIdx + 1).forEach(msg => {
          messagesEl.insertAdjacentHTML('beforeend', this._renderSingleMessage(msg, myId));
        });
      }
    }

    this._lastMsgId = lastMsg.id;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  destroy() {
    this._unsubscribe?.();
    this._el?.remove();
  }
}
