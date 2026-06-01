import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: 'AIzaSyCfbrLfgc6Jr6Z3nwnJF-qlFIkxedg_Xts' });

async function test() {
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  for (const m of models) {
    try {
      console.log(`Testing model ${m}...`);
      const res = await ai.models.generateContent({ model: m, contents: 'hi' });
      console.log(`✅ Success with ${m}! Response: ${res.text}`);
      return;
    } catch (e: any) {
      console.log(`❌ Failed with ${m}: ${e.message}`);
    }
  }
}

test();
