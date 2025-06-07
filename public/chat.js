const characterId = localStorage.getItem('chatCharacterId') || '001';
const chatBox = document.getElementById('chat-box');
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
let messages = [];

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = `message ${type}`;

  if (type === "bot") {
    const img = document.createElement("img");
    img.src = `/image/${characterId}`;
    img.alt = "Bot Avatar";
    img.className = "avatar";
    div.appendChild(img);
  }

  const span = document.createElement("span");
  span.textContent = text;
  div.appendChild(span);

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function initializeChat() {
  try {
    const res = await fetch(`/api/photo-prompt/${characterId}`);
    const data = await res.json();
    const systemPrompt = data.prompt || "あなたはかわいらしいAI美女です。";

    messages = [{ role: "system", content: systemPrompt }];

    const storageKey = `chatLog_${characterId}`;
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
