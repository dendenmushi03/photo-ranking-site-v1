require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testVision() {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-vision" });

  const testImagePath = path.join(__dirname, "../public/image");
  const files = fs.readdirSync(testImagePath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  if (files.length === 0) {
    console.error("❌ テスト用画像が見つかりません。public/image に画像を入れてください。");
    return;
  }

  const imageBuffer = fs.readFileSync(path.join(testImagePath, files[0]));
  const base64Image = imageBuffer.toString("base64");

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: "この画像の内容を説明してください。" },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image
              }
            }
          ]
        }
      ]
    });

    const response = await result.response;
    const text = await response.text();
    console.log(`✅ Visionモデルが利用可能です: ${text}`);
  } catch (err) {
    console.error("❌ Visionモデルは使えません:", err.message || err);
  }
}

testVision();
