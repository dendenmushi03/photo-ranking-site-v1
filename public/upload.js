document.getElementById('uploadForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const form = document.getElementById('uploadForm');
  const button = document.getElementById('uploadButton'); // ← アップロードボタン取得
  const formData = new FormData(form);

  // ⛔ ボタン無効化＆テキスト変更
  button.disabled = true;
  button.textContent = 'アップロード中...';

  try {
    const res = await fetch('/upload-photo', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      alert('アップロードが完了しました（承認待ち）');
      form.reset();
    } else {
      alert('アップロードに失敗しました');
    }
  } catch (error) {
    console.error('アップロードエラー:', error);
    alert('通信エラーが発生しました');
  } finally {
    // ✅ ボタン再有効化＆テキスト戻す
    button.disabled = false;
    button.textContent = 'アップロード';
  }
});
