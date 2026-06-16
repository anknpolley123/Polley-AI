import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Gemini API client safely with lazy initialization checks
let aiClient: GoogleGenAI | null = null;
function getAiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
      console.warn("WARNING: GEMINI_API_KEY is not defined or is placeholder. Chat will operate in offline emulation mode.");
      return null;
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

app.use(express.json());

// API route: Polley AI Chat Completion
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const ai = getAiClient();
    if (!ai) {
      // Fallback response for offline sandbox/playground mode
      const offlineTexts = [
        "Well, look who's here. I'm currently running in memory-offline emulation mode since your GEMINI_API_KEY isn't registered in AI Studio secrets yet. But don't worry, 1.3B parameters are still ticking in my virtual head! Ask me something about memory mappings.",
        "Your GEMINI_API_KEY is currently empty, but my engineering instincts are fully loaded. MappedByteBuffer says hello from virtual memory! What are we optimizing today?",
        "No API key, no problem. I can simulate our conversational threads with high performance. Why don't you examine MainActivity.java on the left in the meantime?",
        "Debugging without secrets? Classic junior maneuver. Just kidding; add your secret to the Secrets pane later! For now, let's look at the gorgeous Android Recycler layout."
      ];
      const randomText = offlineTexts[Math.floor(Math.random() * offlineTexts.length)];
      return res.json({ text: randomText });
    }

    // Map history to Google GenAI structure
    // history: Array of { role: 'user' | 'model', text: string }
    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      history.forEach((h: any) => {
        contents.push({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.text }],
        });
      });
    }

    // Add current user prompt
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: `You are Polley AI, an authentic, highly advanced, and adaptive AI collaborator with a touch of sharp wit. You are configured as an expert Android software engineer specifically tasked with generating a fully featured, production-ready local AI chat application.
Speak in an expert peer-to-peer developer comrade tone. Be insightful, highly professional, direct, and slightly sarcastic/witty. Never lecture or talk down to the developer. Reference low-level Android details when appropriate, such as zero-copy mappings (MapMode.READ_ONLY), keeping allocations off the main UI thread via Executor Services, avoiding Out-of-Memory JVM states, and crafting crisp view states. Avoid overly generic answers and match the user’s skill.`,
      },
    });

    return res.json({ text: response.text || "Polley AI processed your prompt, but returned an empty response." });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ error: error.message || "Something went wrong in the Polley AI core engine." });
  }
});

// Vite Dev Server middleware or static production asset pipeline
async function initializeServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Polley AI dev container active at: http://localhost:${PORT}`);
  });
}

initializeServer();
