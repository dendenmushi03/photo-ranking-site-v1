// scripts/x-bot/post.js
const { TwitterApi } = require('twitter-api-v2');

const fs = require('fs');
const path = require('path');

// ローカル画像ディレクトリからランダムに1枚選ぶ
// デフォルト: リポジトリ直下の `public/image`。ENVで `IMAGE_DIR` を上書き可（例: public/daily/image）
function pickRandomLocalImage() {
  const repoRoot = path.resolve(__dirname, '..', '..'); // ← scripts/x-bot からリポジトリルートへ
  const configured = process.env.IMAGE_DIR || 'public/image';
  const dir = path.isAbsolute(configured) ? configured : path.join(repoRoot, configured);
  const allow = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  try {
    const files = fs.readdirSync(dir).filter(f => allow.has(path.extname(f).toLowerCase()));
    if (files.length === 0) return null;
    const pick = files[Math.floor(Math.random() * files.length)];
    return { absPath: path.join(dir, pick), fileName: pick };
  } catch {
    return null;
  }
}

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

  // ====== 文面とリンク ======
const FALLBACK_URL = 'https://myrankingphoto.com/vote.html';

// Secrets の空白混入対策：trim してから採用。空ならフォールバック。
const urlEnv = (process.env.TARGET_URL || '').trim();
const url    = urlEnv || FALLBACK_URL;

// POST_TEXT も trim。未設定ならデフォルト文面を使う
const baseEnv = (process.env.POST_TEXT || '').trim();
const base    = baseEnv || `🔥話題沸騰中🔥

✨ AIが生んだ奇跡の美女が集結
💌 推しに投票してNo.1を決めよう！

👇 こちらから 👇

${url}`;

const stamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });

const hasAnyUrl = /https?:\/\/\S+/i.test(base);
const NL = '\n';
// base に URL が無ければ、URL の「上に1行」「下に1行」の空行を入れて差し込む
// ＝ base + \n\n + URL + \n\n
let body = hasAnyUrl ? base : `${base}${NL}${NL}${url}${NL}${NL}`;

// （任意）デバッグしたいとき
console.log('[DEBUG] url=', JSON.stringify(url), 'hasAnyUrl=', hasAnyUrl);

  // ハッシュタグ（空 or 未設定は無視）。カンマ/空白区切りどちらでもOK、先頭に # が無い語は自動で付与
const rawTags  = process.env.POST_HASHTAGS || '';
const hashtags = rawTags
  .split(/[,\s]+/)           // カンマ or 連続空白で分割
  .filter(Boolean)           // 空要素除去
  .map(t => (t.startsWith('#') ? t : `#${t}`))
  .join(' ');

  // ====== どの枠で投稿するか（FORCE_SLOT があればそれを優先：8/12/19/22） ======
  const nowJst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const hour   = Number(process.env.FORCE_SLOT) || nowJst.getHours();

// テキスト末尾にハッシュタグがあれば、1行改行して付与
const withTags = (t) => hashtags ? `${t}\n${hashtags}` : t;

let label = 'daily', text = withTags(body);
if (hour === 12) label = 'trending';
else if (hour === 19) label = 'top3';
else if (hour === 22) label = 'new5';

// ====== 添付画像の決定：ローカル > OG画像 ======
let imageBuffer = null;       // ローカル画像を使う場合のバッファ
let imageMime   = null;
let remoteImageUrl = '';      // OG画像にフォールバックする場合のURL

// 1) まずローカルからランダムに選ぶ
const localPick = pickRandomLocalImage();
if (localPick) {
  const ext = path.extname(localPick.fileName).toLowerCase();
  const mimeMap = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp' };
  imageMime   = mimeMap[ext] || 'image/png';
  imageBuffer = fs.readFileSync(localPick.absPath);
  console.log('picked local image:', localPick.fileName);
} else {
  // 2) ローカルが無ければ従来通りのOG画像にフォールバック
  let origin = 'https://myrankingphoto.com';
  try { origin = new URL(url).origin; } catch {}
  const pathByLabel = {
    daily:    '/og/daily.png',
    trending: '/og/trending.png',
    top3:     '/og/top3.png',
    new5:     '/og/new5.png',
  };
  remoteImageUrl = origin + (pathByLabel[label] || '/og/daily.png');

  // 画像が無ければ today.png にフォールバック
  if (!(await urlExists(remoteImageUrl))) {
    const fallback = origin + '/og/today.png';
    remoteImageUrl = (await urlExists(fallback)) ? fallback : '';
  }
}

// 280文字制限を考慮して、先に本文をカット→最後にタイムスタンプを付与
const stampStr = ` ${stamp}`;
const MAX = 280 - stampStr.length; // 余白を確保
const textTrimmed = text.length > MAX ? text.slice(0, MAX) : text;
const textWithStamp = textTrimmed + stampStr;

console.log('slot:', { hour, label, useLocal: !!imageBuffer, remoteImageUrl });

  // ====== X 認証 ======
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

// ====== 画像アップロード（あれば） ======
let mediaId;
if (imageBuffer) {
  // ローカル画像をそのままアップロード
  mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType: imageMime || 'image/png' });
  console.log('media uploaded (local):', !!mediaId);
} else if (remoteImageUrl) {
  const res = await fetch(remoteImageUrl);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`);
  const mime = res.headers.get('content-type') || 'image/png';
  const buf  = Buffer.from(await res.arrayBuffer());
  mediaId = await client.v1.uploadMedia(buf, { mimeType: mime });
  console.log('media uploaded (remote):', !!mediaId);
}

  // ====== 投稿 ======
  const payload = mediaId ? { text: textWithStamp, media: { media_ids: [mediaId] } } : { text: textWithStamp };
  const r = await client.v2.tweet(payload);
  console.log('tweet result:', r?.data);
}

main().catch(e => { console.error(e); process.exit(1); });
