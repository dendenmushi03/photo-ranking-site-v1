document.getElementById('uploadForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const form = document.getElementById('uploadForm');
  const formData = new FormData(form);

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
  }
});
