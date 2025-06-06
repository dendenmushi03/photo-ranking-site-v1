document.addEventListener('DOMContentLoaded', () => {
  // ✅ アクセスログを記録
  fetch('/log-access', { method: 'POST' });

  // 写真と投稿者を取得して表示
  fetch('/photo-meta')
    .then(res => res.ok ? res.json() : Promise.reject('写真データ取得失敗'))
    .then(photos => {
      const container = document.getElementById('photo-container');
      container.innerHTML = '';

      const shuffled = photos.sort(() => 0.5 - Math.random()).slice(0, 6); // ← ★ ここを9から6に変更！

      shuffled.forEach((photo, index) => {
        const div = document.createElement('div');
        div.className = 'photo-card';

        const radioId = `photo${index}`;

        div.innerHTML = `
          <img src="/image/${photo.filename}" alt="写真${index + 1}">
          <label for="${radioId}">
            <input type="radio" id="${radioId}" name="photo" value="${photo.filename}">
            ${photo.author}さんの写真
          </label>
        `;

        container.appendChild(div);
      });
    })
    .catch(err => {
      console.error("画像読み込みエラー:", err);
      document.getElementById('photo-container').innerHTML =
        '<p style="color:red;">写真の読み込みに失敗しました。</p>';
    });

  // 投票処理
  document.getElementById("voteForm").addEventListener("submit", function(event) {
    event.preventDefault();

    const selected = document.querySelector('input[name="photo"]:checked');
    if (!selected) {
      alert("投票する写真を選んでください。");
      return;
    }

    const photoId = selected.value;

    fetch('/vote-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId })
    })
      .then(res => res.ok ? res.json() : Promise.reject('投票エラー'))
      .then(data => {
        alert("投票が完了しました！");
        location.reload();
      })
      .catch(error => {
        alert("投票中にエラーが発生しました。");
        console.error(error);
      });
  });
});
