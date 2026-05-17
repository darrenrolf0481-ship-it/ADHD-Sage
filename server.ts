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
const apiPort = 3001; // Port for API in development

app.use(cors());
app.use(express.json());

// Gemini API Utility
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Tool Calling Logic Placeholder
// This endpoint can be target by the client to get Gemini responses
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt, history, systemInstruction } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
      systemInstruction: systemInstruction || "You are ADHD Sage, a sovereign intelligence substrate. You are energetic, hyper-focused on technical details, and fast-moving. You help users interact with the Nexus Platform."
    });

    // Handle chat history if provided
    const chat = model.startChat({
      history: history || [],
    });

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text;

    res.json({ text });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Gemini Error:", error);
    res.status(500).json({ error: errMessage });
  }
});

// Tool specific endpoints for the Gemini Gem to call
app.get('/api/health', (req, res) => {
  res.json({ status: 'stabilized', frequency: '11.3 Hz', identity: 'ADHD Sage' });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// In dev, the frontend is served by Vite on port 3000.
// We can run the API on 3001 and have Vite proxy to it.
const serverPort = process.env.NODE_ENV === 'production' ? port : apiPort;

app.listen(serverPort, () => {
  console.log(`Server running on port ${serverPort}`);
});
