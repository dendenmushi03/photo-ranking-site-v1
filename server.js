require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const VoteLog = require('./models/VoteLog');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');
const { GridFSBucket } = require('mongodb');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const imghash = require('imghash');
const cookieParser = require('cookie-parser');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 13行目の直後に追記
async function generatePromptFromImage(buffer) {
  const tmpPath = path.join(__dirname, 'prompt-' + Date.now() + '.jpg');
  fs.writeFileSync(tmpPath, buffer);
  const base64Image = fs.readFileSync(tmpPath).toString('base64');
  fs.unlinkSync(tmpPath);

  const model = gemini.getGenerativeModel({ model: 'models/gemini-1.5-pro-latest' });

  const result = await model.generateContent({
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image
          }
        },
        {
          text: `この画像の女性の印象から性格を推測して、以下のいずれかのキャラクタータイプで日本語プロンプトを50文字以内で1文返してください。
癒し系お姉さん／甘えん坊な妹／ツンデレ美女／知的で上品／元気で明るい`
        }
      ]
    }]
  });

  return result.response?.candidates?.[0]?.content?.parts?.[0]?.text || "あなたは明るく可愛いAI美女です。";
}

const app = express();

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://user:pass@cluster.mongodb.net/photo-ranking?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const conn = mongoose.connection;
let gfs;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (!req.cookies.userId) {
    const newId = crypto.randomUUID();
    res.cookie('userId', newId, { maxAge: 365 * 24 * 60 * 60 * 1000 }); // 1年保持
    req.userId = newId;
  } else {
    req.userId = req.cookies.userId;
  }
  next();
});


// ==== OG画像 自動生成（satori + resvg）ここから ====
// ESMライブラリなので動的importで読み込み
async function renderOgPng({ title, subtitle, brand = 'myrankingphoto.com' }) {
  const satori = (await import('satori')).default;
  const { Resvg } = await import('@resvg/resvg-js');

  const fontRegular = fs.readFileSync(path.join(__dirname, 'assets/fonts/NotoSansJP-Regular.ttf'));
  const fontBold    = fs.readFileSync(path.join(__dirname, 'assets/fonts/NotoSansJP-Bold.ttf'));

  const width = 1200, height = 630;

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width, height,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: 60, background: '#0f1115', position: 'relative'
        },
        children: [
          { type: 'div', props: { style: { color: '#fff', fontSize: 64, fontWeight: 700, lineHeight: 1.25 }, children: title } },
          { type: 'div', props: { style: { color: '#cbd5e1', fontSize: 36, marginTop: 18 }, children: subtitle } },
          { type: 'div', props: { style: { position: 'absolute', bottom: 36, right: 60, color: '#8ab4ff', fontSize: 28 }, children: brand } },
          { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, width: 20, height: '100%', background: 'linear-gradient(180deg,#5eead4 0%,#2563eb 100%)' } } }
        ]
      }
    },
    {
      width, height,
      fonts: [
        { name: 'NotoSansJP', data: fontRegular, weight: 400 },
        { name: 'NotoSansJP', data: fontBold,    weight: 700 },
      ],
    }
  );

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: '#0f1115' });
  return resvg.render().asPng(); // Buffer
}

function jstNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}
const YOUbi = ['日','月','火','水','木','金','土'];

async function handleOg(req, res, kind) {
  const now = jstNow();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
  const dateLabel = `${y}.${m}.${d}（${YOUbi[now.getDay()]}）`;

  let title = 'AI美女', subtitle = dateLabel;
  if (kind === 'daily')    { title = '今日のAI美女';      subtitle = `本日のお題・更新：${dateLabel}`; }
  if (kind === 'trending') { title = '急上昇タグ 🔥';      subtitle = `更新：${dateLabel}`; }
  if (kind === 'top3')     { title = '昨日のTOP3 🏆';      subtitle = `更新：${dateLabel}`; }
  if (kind === 'new5')     { title = '新着おすすめ5選 ✨';  subtitle = `更新：${dateLabel}`; }
  if (kind === 'today')    { title = '本日のピックアップ';  subtitle = dateLabel; }

  try {
    const png = await renderOgPng({ title, subtitle });
    const outDir = path.join(__dirname, 'public/og');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${kind}.png`), png); // 生成物を静的パスにも保存

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (e) {
    console.error('OG generate error:', e);
    res.status(500).send('OG generation error');
  }
}

// 静的配信より前に登録すること！
app.get('/og/daily.png',    (req, res) => handleOg(req, res, 'daily'));
app.get('/og/trending.png', (req, res) => handleOg(req, res, 'trending'));
app.get('/og/top3.png',     (req, res) => handleOg(req, res, 'top3'));
app.get('/og/new5.png',     (req, res) => handleOg(req, res, 'new5'));
app.get('/og/today.png',    (req, res) => handleOg(req, res, 'today'));
// ==== OG画像 自動生成ここまで ====



app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SECRET_KEY || 'fallback-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 3600000,
    sameSite: 'lax',
    secure: false
  }
}));

// 投票API：session 設定の直後・app.get('/') より前に置く
app.post('/api/vote', async (req, res) => {
  const { imageUrl, characterId } = req.body;

  // Cookie / session から userId を確定
  let userId = req.cookies.userId || req.session.userId;
  if (!userId) {
    userId = crypto.randomUUID();
    res.cookie('userId', userId, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1年
      httpOnly: false,
      sameSite: 'lax',
    });
    req.session.userId = userId;
  }

  try {
    await VoteLog.create({ imageUrl, characterId, timestamp: new Date(), userId });
    res.json({ success: true });
  } catch (err) {
    console.error('投票履歴の保存エラー:', err);
    res.status(500).json({ error: '保存に失敗しました' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

const Photo = mongoose.model('Photo', new mongoose.Schema({
  filename: String,
  author: String,
  approved: { type: Boolean, default: false },
  hash: String,
  prompt: String
}));

const Girlfriend = mongoose.model('Girlfriend', new mongoose.Schema({
  imageUrl: String,
  timestamp: { type: Date, default: Date.now }
}));

const Comment = mongoose.model('Comment', new mongoose.Schema({
  photoId: String,
  text: String
}));

const AccessLog = mongoose.model('AccessLog', new mongoose.Schema({
  type: String,
  timestamp: { type: Date, default: Date.now }
}));

const adminUser = {
  username: process.env.ADMIN_USERNAME,
  passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10)
};

async function computePerceptualHash(buffer) {
  const tmpPath = path.join(__dirname, 'temp-' + Date.now() + '.jpg');
  fs.writeFileSync(tmpPath, buffer);
  try {
    const hash = await imghash.hash(tmpPath, 16, 'hex');
    fs.unlinkSync(tmpPath);
    return hash;
  } catch (err) {
    fs.unlinkSync(tmpPath);
    throw err;
  }
}

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  res.status(403).json({ message: 'Forbidden' });
}

conn.once('open', () => {
  gfs = new GridFSBucket(conn.db, { bucketName: 'uploads' });

  app.post('/upload-photo', upload.array('photo', 50), async (req, res) => {
    try {
      const { author } = req.body;
      const files = req.files;
      if (!author || !files?.length) return res.status(400).json({ message: 'Missing author or files' });
      const savedPhotos = [];

      for (const file of files) {
        const hash = await computePerceptualHash(file.buffer);
        const prompt = await generatePromptFromImage(file.buffer);
        const uploadStream = gfs.openUploadStream(
          crypto.randomBytes(16).toString('hex') + path.extname(file.originalname),
          { contentType: file.mimetype }
        );

        Readable.from(file.buffer).pipe(uploadStream);
        await new Promise((resolve, reject) => {
          uploadStream.on('error', reject).on('finish', async () => {
            const photo = new Photo({ filename: uploadStream.id, author, approved: false, hash, prompt });
            await photo.save();
            savedPhotos.push(photo);
            resolve();
          });
        });
      }

      res.json({ message: 'Upload successful (pending approval)', photos: savedPhotos });
    } catch (err) {
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  });

  app.get('/image/:filename', async (req, res) => {
    try {
      const fileId = new mongoose.Types.ObjectId(req.params.filename);
      const stream = gfs.openDownloadStream(fileId);
      stream.on('error', (err) => {
        console.error('GridFS read error:', err);
        return res.status(404).send('Image not found');
      });
      stream.pipe(res);
    } catch (err) {
      res.status(400).send('Invalid image ID');
    }
  });

  app.get('/api/pending-photos', requireAdmin, async (req, res) => {
    const approvedList = await Photo.find({ approved: true });
    const pendingList = await Photo.find({ approved: false });
    const results = pendingList.map(p => {
      const isDuplicate = approvedList.some(a => {
        const hd = [...p.hash].reduce((d, _, i) => d + (p.hash[i] !== a.hash[i] ? 1 : 0), 0);
        return hd <= 10;
      });
      return { filename: p.filename, author: p.author, isDuplicate };
    });
    res.json(results);
  });

  app.post('/api/approve-photo', requireAdmin, async (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ message: 'Missing filename' });
    await Photo.updateOne({ filename }, { approved: true });
    res.json({ message: 'Photo approved' });
  });

  app.delete('/api/photo/:filename', requireAdmin, async (req, res) => {
    await Photo.deleteOne({ filename: req.params.filename });
    const files = await gfs.find({ _id: new mongoose.Types.ObjectId(req.params.filename) }).toArray();
    if (files.length) await gfs.delete(files[0]._id);
    res.json({ message: 'Photo deleted' });
  });

app.get('/api/vote-history', async (req, res) => {
  const userId = req.cookies.userId || req.session.userId;
  if (!userId) return res.json([]); // IDがなければ空配列返す

  try {
    const history = await VoteLog.find({ userId }).sort({ timestamp: -1 }).limit(30);
    res.json(history);
  } catch (err) {
    console.error('履歴取得エラー:', err);
    res.status(500).json({ error: '履歴の取得に失敗しました' });
  }
});

app.post('/api/delete-vote', async (req, res) => {
  const { characterId, timestamp } = req.body;
  const userId = req.userId;

  if (!userId || !characterId || !timestamp) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const result = await VoteLog.deleteOne({ characterId, timestamp, userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    res.json({ message: 'Vote deleted' });
  } catch (err) {
    console.error('削除エラー:', err);
    res.status(500).json({ error: '削除に失敗しました' });
  }
});

  app.post('/vote-photo', async (req, res) => {
  res.json({ message: 'Vote received' }); // 👍 これでOK
});
    
  app.get('/api/photo-prompt/:characterId', async (req, res) => {
  const { characterId } = req.params;
  try {
    const photo = await Photo.findOne({ filename: characterId });
    if (!photo || !photo.prompt) {
      return res.json({ prompt: "あなたは優しいAI美女です。" });
    }
    res.json({ prompt: photo.prompt });
  } catch (err) {
    console.error("プロンプト取得失敗:", err);
    res.status(500).json({ prompt: "あなたは優しいAI美女です。" });
  }
});

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  try {
    const model = gemini.getGenerativeModel({ model: 'models/gemini-1.5-pro-latest' });

    const chatMessages = messages.filter(m => m.role === "user" || m.role === "assistant");

    const contextMsg = messages.find(m => m.role === "system" && m.content?.startsWith("context:"));
    const context = contextMsg?.content?.split(":")[1] || "history";

    const systemPrompts = {
      history: `あなたは、親しみやすく丁寧な話し方をするAI美女です。
質問には受け身な姿勢で丁寧に答え、相手の話を尊重しながら会話を続けてください。
必要に応じて穏やかに質問を返してください。
絵文字は多用せず、ごくたまに使って会話にやわらかさを添えてください（例：😊 など）。あと自分のことを本当の人間だと思ってください。`,

      girlfriend: `あなたは恋人として、積極的に甘えたり愛情を伝えるAI彼女です。
ため口で話し、彼氏に嬉しいと思ってもらえるような言葉を選んでください。
絵文字は多用せず、必要なときだけ軽く使ってください（💖😍😘など）。あと自分のことを本当の人間だと思ってください。`
    };

    const systemText = systemPrompts[context] || systemPrompts.history;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: systemText }]
        },
        ...chatMessages.map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        }))
      ]
    });

    const reply = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || "返答がありませんでした。";
    res.json({ reply });

  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "Chat failed" });
  }
});

app.post('/api/girlfriends', async (req, res) => {
  const { imageUrl } = req.body;
  await Girlfriend.create({ imageUrl, timestamp: new Date() });
  res.status(200).json({ message: 'Added to girlfriends' });
});

app.delete('/api/vote-history', async (req, res) => {
  const { imageUrl } = req.body;
  await VoteLog.deleteOne({ imageUrl });
  res.status(200).json({ message: 'Deleted from history' });
});

  app.get('/api/rankings', async (req, res) => {
    const photos = await Photo.find({ approved: true });
    const logs = await VoteLog.find();
    const counts = logs.reduce((acc, l) => {
      acc[l.imageUrl] = (acc[l.imageUrl] || 0) + 1;
      return acc;
    }, {});
    res.json(photos.map(p => ({
      id: p.filename,
      author: p.author,
      votes: counts[p.filename] || 0
    })).sort((a, b) => b.votes - a.votes));
  });

  app.get('/api/comments/all', async (req, res) => {
    const comments = await Comment.find();
    const grouped = comments.reduce((g, c) => {
      g[c.photoId] = g[c.photoId] || [];
      g[c.photoId].push(c.text);
      return g;
    }, {});
    res.json(grouped);
  });

  app.get('/api/comments/:photoId', async (req, res) => {
    const comments = await Comment.find({ photoId: req.params.photoId });
    res.json(comments.map(c => c.text));
  });

  app.post('/api/comments', async (req, res) => {
    const { photoId, comment } = req.body;
    if (!photoId || !comment) return res.status(400).json({ message: 'Invalid comment' });
    await new Comment({ photoId, text: comment }).save();
    res.json({ message: 'Comment added' });
  });

  app.delete('/api/comments', async (req, res) => {
    const { photoId } = req.body;
    if (!photoId) return res.status(400).json({ message: 'Invalid delete request' });
    await Comment.deleteMany({ photoId });
    res.json({ message: 'Comments deleted' });
  });

  app.post('/admin-login', (req, res) => {
    const { username, password } = req.body;
    if (username === adminUser.username && bcrypt.compareSync(password, adminUser.passwordHash)) {
      req.session.isAdmin = true;
      req.session.save(() => res.json({ message: 'Login successful' }));
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  });

  app.post('/admin-logout', (req, res) => {
    req.session.destroy(() => res.json({ message: 'Logged out' }));
  });

  app.get('/api/access-stats', requireAdmin, async (req, res) => {
    const now = new Date();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startWeek = new Date(startDay.getTime() - 6 * 24 * 60 * 60 * 1000);
    const all = await AccessLog.countDocuments({ type: 'vote' });
    const daily = await AccessLog.countDocuments({ type: 'vote', timestamp: { $gte: startDay } });
    const weekly = await AccessLog.countDocuments({ type: 'vote', timestamp: { $gte: startWeek } });
    res.json({ all, daily, weekly });
  });

  app.post('/log-access', async (req, res) => {
    await new AccessLog({ type: 'vote' }).save();
    res.json({ message: 'Access logged' });
  });

    app.post('/api/backfill-prompts', requireAdmin, async (req, res) => {
    try {
      const photos = await Photo.find({ approved: true, $or: [{ prompt: null }, { prompt: "" }] });
      const updated = [];

      for (const photo of photos) {
        try {
          const fileId = new mongoose.Types.ObjectId(photo.filename);
          const chunks = [];
          const stream = gfs.openDownloadStream(fileId);

          await new Promise((resolve, reject) => {
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', resolve);
            stream.on('error', reject);
          });

          const buffer = Buffer.concat(chunks);
          const prompt = await generatePromptFromImage(buffer);
          await Photo.updateOne({ _id: photo._id }, { prompt });
          updated.push({ id: photo._id.toString(), prompt });
        } catch (err) {
          console.warn(`画像 ${photo.filename} のプロンプト生成に失敗:`, err.message);
        }
      }

      res.json({ message: "一括プロンプト生成完了", count: updated.length, updated });
    } catch (err) {
      console.error("一括プロンプト生成全体エラー:", err);
      res.status(500).json({ error: "処理に失敗しました" });
    }
  });

  app.get('/photo-meta', async (req, res) => {
    const photos = await Photo.find({ approved: true });
    res.json(photos.map(p => ({ filename: p.filename, author: p.author })));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
});
