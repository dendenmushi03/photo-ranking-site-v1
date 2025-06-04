// 各「彼女にする」ボタンにイベントを追加
document.addEventListener("DOMContentLoaded", () => {
document.querySelectorAll(".love-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const card = btn.closest(".photo-card");
    const img = card.querySelector("img").src;
    const timestamp = card.querySelector("p").textContent;

    // characterIdはonclick属性から渡されるか、別途取得（data属性等でもOK）
    const characterId = btn.getAttribute("onclick").match(/'([^']+)'/)[1];

    addToGirlfriends(characterId, img, timestamp);
  });
});

// 彼女リストに追加する共通関数
function addToGirlfriends(characterId, image, timestamp) {
  const stored = localStorage.getItem("girlfriends");
  const girlfriends = stored ? JSON.parse(stored) : [];

  if (girlfriends.some(gf => gf.characterId === characterId)) {
    alert("すでに彼女リストに追加されています。");
    return;
  }

  girlfriends.push({
    characterId,
    image,
    timestamp
  });

  localStorage.setItem("girlfriends", JSON.stringify(girlfriends));
  alert("彼女リストに追加しました！");
}
