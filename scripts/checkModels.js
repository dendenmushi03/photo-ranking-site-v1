require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    const models = await genAI.listModels(); // ← ✅ クラスではなくインスタンスから呼び出す
    console.log("✅ 利用可能なモデル一覧:");
    models.models.forEach((m) => {
      console.log(`- ${m.name}`);
    });
  } catch (err) {
    console.error("❌ モデル一覧の取得に失敗:", err);
  }
}

listModels();
