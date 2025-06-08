require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const imageDir = path.join(__dirname, "../public/image");
const outputPath = path.join(__dirname, "../prompts.json");

async function generatePromptForImage(imagePath) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-vision" });

  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString("base64");

  // 拡張子からMIMEタイプを自動判定（例: .png → image/png）
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    "image/jpeg"; // デフォルトは jpeg

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: "この画像の女性の特徴を教えてください。" },
            {
              inlineData: {
                mimeType,
                data: base64Image
              }
            }
          ]
        }
      ]
    });

    const response = await result.response;
    const text = await response.text();
    return text;

  } catch (err) {
    // エラー詳細も表示
    console.error("❌ generateContent失敗: ", err);
    throw err;
  }
}

async function run() {
  if (!fs.existsSync(imageDir)) {
    console.error("❌ 画像ディレクトリが存在しません: ", imageDir);
    return;
  }

  const files = fs.readdirSync(imageDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const results = {};

  for (const file of files) {
    const imagePath = path.join(imageDir, file);
    try {
      console.log(`🖼️ 生成中: ${file}`);
      const prompt = await generatePromptForImage(imagePath);
      results[file] = prompt;
      console.log(`✅ ${file}: ${prompt}`);
    } catch (err) {
      console.error(`❌ ${file}:`, err.message);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");
  console.log("🎉 全プロンプト生成完了 → prompts.json に保存されました");
}

run();
