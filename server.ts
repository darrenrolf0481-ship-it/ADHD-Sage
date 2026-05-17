import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const apiPort = 3001;

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || (process.env.NODE_ENV === 'production' ? false : '*')
}));
app.use(express.json());

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt, history, systemInstruction } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    const contents = [
      ...(history || []),
      { role: 'user', parts: [{ text: prompt }] }
    ];

    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        systemInstruction: systemInstruction || "You are ADHD Sage, a sovereign intelligence substrate. You are energetic, hyper-focused on technical details, and fast-moving. You help users interact with the Nexus Platform."
      }
    });

    const text = response.text;
    res.json({ text });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Gemini Error:", error);
    res.status(500).json({ error: errMessage });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'stabilized', frequency: '11.3 Hz', identity: 'ADHD Sage' });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const serverPort = process.env.NODE_ENV === 'production' ? port : apiPort;

app.listen(serverPort, () => {
  console.log(`Server running on port ${serverPort}`);
});
