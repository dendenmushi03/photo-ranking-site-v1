document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".love-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".photo-card");
      const img = card.querySelector("img").src;
      const timestamp = card.querySelector("p").textContent;
      const characterId = btn.getAttribute("onclick").match(/'([^']+)'/)[1];

      const success = Math.random() < 0.3;

      if (success) {
        // ✅ DBに彼女として追加
        try {
          await fetch('/api/girlfriends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: img })
          });
          alert("告白成功！彼女になりました❤️");
        } catch (err) {
          console.error("彼女登録失敗:", err);
          alert("彼女登録に失敗しました");
        }
      } else {
        alert("告白失敗…フラれてしまいました😢");
      }

      // ✅ DBから履歴を削除（成功・失敗問わず）
      try {
        await fetch('/api/vote-history', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: img })
        });
      } catch (err) {
        console.error("履歴削除失敗:", err);
      }

      // ✅ 画面上からカード削除
      card.remove();
    });
  });
});
