import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;

async function generateImage() {
  try {
    console.log("✅ APIキー:", API_KEY); // APIキー確認用

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: "A beautiful woman in cinematic lighting",
        n: 1,
        size: "1024x1024",
      }),
    });

    const data = await response.json();

    if (data?.data?.[0]?.url) {
      const imageUrl = data.data[0].url;
      const imageResponse = await fetch(imageUrl);
      const buffer = await imageResponse.arrayBuffer();  // 推奨APIに変更
      const today = new Date().toISOString().slice(0, 10);
      const filePath = path.resolve("public", "daily", `${today}.png`);

      // フォルダ存在確認（なければ作成）
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // ファイル書き込み
      fs.writeFileSync(filePath, Buffer.from(buffer));
      console.log(`✅ 画像保存完了: ${filePath}`);
    } else {
      console.error("❌ 画像生成失敗:", JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error("❌ 通信エラー:", e);
  }
}

generateImage();
