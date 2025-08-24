const { TwitterApi } = require('twitter-api-v2');

async function main() {
  const base = process.env.POST_TEXT || '本日のAI美女はこちら👇';
  const url  = process.env.TARGET_URL || 'https://myrankingphoto.com/vote.html';
  const stamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
  const text = `${base} ${url} ${stamp}`.slice(0, 270);
  const imageUrl = process.env.IMAGE_URL;

  console.log('env check:', {
    hasKey: !!process.env.TWITTER_API_KEY,
    hasSecret: !!process.env.TWITTER_API_SECRET,
    hasAccessToken: !!process.env.TWITTER_ACCESS_TOKEN,
    hasAccessSecret: !!process.env.TWITTER_ACCESS_SECRET,
    hasImageUrl: !!imageUrl,
  });

  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  let mediaId;
  if (imageUrl) {
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`);
      const mime = res.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await res.arrayBuffer());
      mediaId = await client.v1.uploadMedia(buf, { mimeType: mime });
      console.log('media uploaded:', !!mediaId);
    } catch (e) {
      console.error('media upload error:', e);
    }
  }

  try {
    const payload = mediaId ? { text, media: { media_ids: [mediaId] } } : { text };
    const r = await client.v2.tweet(payload);
    console.log('tweet result:', r?.data || r);
  } catch (e) {
    console.error('tweet error:', e?.data?.errors || e);
    throw e;
  }
}

main().catch(err => process.exit(1));
