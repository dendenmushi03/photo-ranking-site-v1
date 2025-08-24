// Node 20 以降（Actionsで使う）を想定：fetch がグローバルにある
const { TwitterApi } = require('twitter-api-v2');

async function main() {
  const text = process.env.POST_TEXT || '本日のAI美女はこちら 👉 ' + (process.env.TARGET_URL || 'https://example.com') + '?utm_source=x&utm_medium=social&utm_campaign=daily';
  const imageUrl = process.env.IMAGE_URL; // 例: https://your-site/og/daily.png

  // OAuth 1.0a（長期トークンで安定運用）
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  let mediaId;
  if (imageUrl) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    const mime = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    // v1.1 のメディアアップロード（安定・簡単）
    mediaId = await client.v1.uploadMedia(buffer, { mimeType: mime });
  }

  const payload = mediaId ? { text, media: { media_ids: [mediaId] } } : { text };
  const result = await client.v2.tweet(payload); // v2 の POST /2/tweets
  console.log('Posted', result?.data);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
