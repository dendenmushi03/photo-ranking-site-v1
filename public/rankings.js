fetch('/api/rankings')
  .then(res => res.json())
  .then(data => {
    const container = document.getElementById('ranking-container');

    if (data.length === 0) {
      container.innerHTML = '<p style="text-align:center;">まだ投票結果がありません。</p>';
      return;
    }

    const maxVotes = Math.max(...data.map(photo => photo.votes));

    data.forEach((photo, index) => {
      const div = document.createElement('div');
      div.className = 'ranking-card';

      // 順位アイコン
      let icon = '';
      if (index === 0) icon = '👑';
      else if (index === 1) icon = '🥈';
      else if (index === 2) icon = '🥉';
      else icon = `${index + 1}位`;

      const barWidth = maxVotes > 0 ? (photo.votes / maxVotes) * 100 : 0;

      div.innerHTML = `
        <div class="ranking-icon">${icon}</div>
        <img src="/uploads/${photo.id}" alt="写真${index + 1}">
        <p><strong>投稿者:</strong> ${photo.author}</p>
        <p><strong>得票数:</strong> ${photo.votes}</p>
        <div class="bar-container"><div class="bar" style="width: ${barWidth}%"></div></div>
        
        <div class="comment-section">
          <h3>コメント</h3>
          <ul class="comment-list" id="comments-${photo.id}">読み込み中...</ul>
          <input type="text" id="input-${photo.id}" placeholder="コメントを入力" style="width: 80%;">
          <button onclick="submitComment('${photo.id}')">送信</button>
        </div>
      `;

      container.appendChild(div);

      // コメント読み込み
      fetch(`/api/comments/${photo.id}`)
        .then(res => res.json())
        .then(comments => {
          const commentList = document.getElementById(`comments-${photo.id}`);
          commentList.innerHTML = '';
          comments.forEach(comment => {
            const li = document.createElement('li');
            li.textContent = comment;
            commentList.appendChild(li);
          });
        });
    });
  });

function submitComment(photoId) {
  const input = document.getElementById(`input-${photoId}`);
  const comment = input.value.trim();
  if (!comment) return;

  fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId, comment })
  })
  .then(res => res.json())
  .then(() => {
    const commentList = document.getElementById(`comments-${photoId}`);
    const li = document.createElement('li');
    li.textContent = comment;
    commentList.appendChild(li);
    input.value = '';
  });
}
