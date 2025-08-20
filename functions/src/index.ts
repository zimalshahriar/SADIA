import "dotenv/config"; // Load .env in local/dev (ignored in prod)
import { onRequest } from "firebase-functions/v2/https";
import express, { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Firebase Admin
admin.initializeApp();

const app = express();

// Enable basic CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  next();
});

// Parse JSON bodies
app.use(express.json());

// Main endpoint: /generateContent
app.post("/generateContent", async (req: Request, res: Response) => {
  try {
    // Get and parse Authorization header (optional for now)
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ?
      authHeader.split("Bearer ")[1] :
      null;

    let uid = "guest";

    // Optional: Verify token if present
    if (idToken) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        uid = decodedToken.uid;
        console.log("Verified UID:", uid);
      } catch (err) {
        console.warn("Invalid token, continuing as guest");
      }
    } else {
      console.log("No auth token provided, continuing as guest");
    }

    // Get API key from environment or Firebase config
  const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      res.status(500).json({ error: "Gemini API key not configured" });
      return;
    }

    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(apiKey);

    // Extract request details from body
    const { prompt, modelName, imageData } = req.body;

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    // Handle text-only or multimodal requests
    if (imageData && Array.isArray(imageData) && imageData.length > 0) {
      // Handle multimodal (image + text)
  const model = genAI.getGenerativeModel({ 
        model: modelName || "gemini-1.5-flash" 
      });
      
      const imageParts = imageData.map((img: string) => ({
        inlineData: { data: img, mimeType: "image/jpeg" }
      }));
      
      const promptParts = [
        ...imageParts, 
        { text: prompt }
      ];
      
      const result = await model.generateContent({
        contents: [{ role: "user", parts: promptParts }]
      });
      
      res.status(200).json({ 
        result: result.response.text(),
        uid: uid
      });
    } else {
      // Handle text-only
  const model = genAI.getGenerativeModel({ 
        model: modelName || "gemini-1.5-flash" 
      });
      const result = await model.generateContent(prompt);
      
      res.status(200).json({ 
        result: result.response.text(),
        uid: uid
      });
    }

  } catch (error: any) {
    console.error("Error in generateContent:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Export the function (v2) with region
export const geminiProxy = onRequest({ region: "asia-east1" }, app);
