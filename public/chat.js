// ✅ chat.js 完全修正版（キャラ画像単位でチャット履歴を保存）

const characterId = localStorage.getItem('chatCharacterId') || '001';
const characterImage = localStorage.getItem('chatCharacterImage') || 'default.jpg';
const chatBox = document.getElementById('chat-box');
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
let messages = [];

// 🔑 画像URL（ファイル名）をキーに含めることでキャラごとの履歴を分離
const storageKey = `chatLog_${characterImage.replace(/[^\w\-]/g, '_')}`;

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = `message ${type}`;

  if (type === "bot") {
    const img = document.createElement("img");
    img.src = localStorage.getItem('chatCharacterImage');
    img.alt = "bot";
    img.style.width = "56px";
    img.style.height = "56px";
    img.style.borderRadius = "50%";
    img.style.marginRight = "8px";
    img.style.verticalAlign = "middle";

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "flex-start";
    wrapper.appendChild(img);

    const span = document.createElement("span");
    span.textContent = text;
    wrapper.appendChild(span);

    div.appendChild(wrapper);
  } else {
    div.textContent = text;
  }

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function initializeChat() {
  try {
    const res = await fetch(`/api/photo-prompt/${characterId}`);
    const data = await res.json();
    const systemPrompt = data.prompt || "あなたはかわいらしいAI美女です。";

    messages = [{ role: "system", content: systemPrompt }];

    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const oldMessages = JSON.parse(saved);
      oldMessages.forEach(msg => {
        if (msg.role !== "system") {
          addMessage(msg.content, msg.role === "user" ? "user" : "bot");
        }
        messages.push(msg);
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userMsg = input.value.trim();
      if (!userMsg) return;
      input.value = "";
      addMessage(userMsg, "user");
      messages.push({ role: "user", content: userMsg });

      const loadingMsg = document.createElement("div");
      loadingMsg.className = "message bot";
      loadingMsg.textContent = "考え中...";
      chatBox.appendChild(loadingMsg);
      chatBox.scrollTop = chatBox.scrollHeight;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages })
        });

        const data = await res.json();
        chatBox.removeChild(loadingMsg);

        if (data.reply) {
          messages.push({ role: "assistant", content: data.reply });
          addMessage(data.reply, "bot");
          localStorage.setItem(storageKey, JSON.stringify(messages));
        } else {
          addMessage("返答に失敗しました。", "bot");
        }
      } catch (err) {
        chatBox.removeChild(loadingMsg);
        addMessage("通信エラーが発生しました。", "bot");
        console.error(err);
      }
    });

  } catch (err) {
    console.error("プロンプト取得エラー:", err);
    messages = [{ role: "system", content: "あなたは優しいAI美女です。" }];
  }
}

initializeChat();
