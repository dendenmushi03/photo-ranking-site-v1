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

// ✅ ←ここに追記OK！
app.post('/api/vote', async (req, res) => {
  const { imageUrl, characterId } = req.body;

  // Cookie または session から userId を取得（なければ新規発行）
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
    await VoteLog.create({
      imageUrl,
      characterId,
      timestamp: new Date(),
      userId: userId
    });
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

app.post('/api/vote', async (req, res) => {
  const { imageUrl, characterId } = req.body;

  // Cookie または session から userId を取得（なければ新規発行）
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
    await VoteLog.create({
      imageUrl,
      characterId,
      timestamp: new Date(),
      userId: userId
    });
    res.json({ success: true });
  } catch (err) {
    console.error('投票履歴の保存エラー:', err);
    res.status(500).json({ error: '保存に失敗しました' });
  }
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

    // ✅ userとassistantだけ抽出
    const chatMessages = messages.filter(m => m.role === "user" || m.role === "assistant");

    const systemText = `あなたは、親しみやすくて丁寧な話し方をするAI美女です。
相手の気持ちに寄り添いながら、優しく、時に少し甘えるような返答をしてください。
語尾には可愛らしい絵文字（😊💕✨など）を使って、会話を明るくしてください。
以下はユーザーとの会話履歴です。続けてください。`;

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

    // ✅ 応答テキストを安全に取り出す
    const reply = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || "返答がありませんでした。";
    res.json({ reply });

  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "Chat failed" });
  }
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
