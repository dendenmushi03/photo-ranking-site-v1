// scripts/x-bot/post.js
const { TwitterApi } = require('twitter-api-v2');

// 画像の存在チェック（HEAD）
async function urlExists(u) {
  try {
    const r = await fetch(u, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

async function main() {
  // ====== 文面とリンク ======
  const base  = process.env.POST_TEXT || '本日のAI美女はこちら👇';
  const url   = process.env.TARGET_URL || 'https://myrankingphoto.com/';
  const stamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });

  // ====== どの枠で投稿するか（FORCE_SLOT があればそれを優先：8/12/19/22） ======
  const nowJst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const hour   = Number(process.env.FORCE_SLOT) || nowJst.getHours();

  // ====== 画像URLを TARGET_URL から自動生成 ======
  let origin = 'https://myrankingphoto.com';
  try { origin = new URL(url).origin; } catch {}

  // デフォルト「today.png」、時間帯で自動差し替え
  let label = 'daily', imgPath = '/og/daily.png', text = base + ' ' + url;
  if (hour === 12) { label = 'trending'; imgPath = '/og/trending.png'; text = '急上昇タグ 🔥 ' + url; }
  else if (hour === 19){ label = 'top3'; imgPath = '/og/top3.png'; text = '昨日のTOP3 🏆 ' + url; }
  else if (hour === 22){ label = 'new5'; imgPath = '/og/new5.png'; text = '新着おすすめ5選 ✨ ' + url; }

  let imageUrl = origin + imgPath;

  // 画像が無ければ today.png にフォールバック
  if (!(await urlExists(imageUrl))) {
    const fallback = origin + '/og/today.png';
    if (await urlExists(fallback)) imageUrl = fallback;
    else imageUrl = ''; // それも無ければテキストのみ
  }

  const textWithStamp = `${text} ${stamp}`.slice(0, 270);

  console.log('slot:', { hour, label, imageUrl });

  // ====== X 認証 ======
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  // ====== 画像アップロード（あれば） ======
  let mediaId;
  if (imageUrl) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`);
    const mime = res.headers.get('content-type') || 'image/png';
    const buf  = Buffer.from(await res.arrayBuffer());
    mediaId = await client.v1.uploadMedia(buf, { mimeType: mime });
    console.log('media uploaded:', !!mediaId);
  }

  // ====== 投稿 ======
  const payload = mediaId ? { text: textWithStamp, media: { media_ids: [mediaId] } } : { text: textWithStamp };
  const r = await client.v2.tweet(payload);
  console.log('tweet result:', r?.data);
}

main().catch(e => { console.error(e); process.exit(1); });
