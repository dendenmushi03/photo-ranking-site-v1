// 写真アップロード機能
document.getElementById("uploadForm").addEventListener("submit", function(event) {
    event.preventDefault();
    const fileInput = document.getElementById("photoUpload");
    const formData = new FormData();
    formData.append("photo", fileInput.files[0]);

    fetch('http://localhost:3000/upload-photo', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`サーバーからのエラー: ${response.status} - ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('アップロード成功:', data);
        alert('写真がアップロードされました！');
    })
    .catch(error => {
        console.error('アップロード失敗:', error);
        alert(`アップロードに失敗しました。\nエラー内容: ${error.message}`);
    });
});

// 投票機能のコード
document.getElementById("voteForm").addEventListener("submit", function(event) {
    event.preventDefault();
    const selectedPhoto = document.querySelector('input[name="photo"]:checked');
    if (!selectedPhoto) {
        alert("投票する写真を選んでください");
        return;
    }

    const photoId = selectedPhoto.value; // どの写真に投票したか

    fetch('http://localhost:3000/vote-photo', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ photoId: photoId })
    })
    .then(response => response.json())
    .then(data => {
        console.log('投票成功:', data);
        alert(`写真 ${photoId} に投票しました！`);
    })
    .catch(error => {
        console.error('投票失敗:', error);
        alert(`投票に失敗しました。\nエラー内容: ${error.message}`);
    });
});
