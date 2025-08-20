// Gemini client wrapper using Firebase Functions proxy for security
// The API key is now securely stored in Firebase Functions environment

// Get your Firebase project ID - using the configured region
const FIREBASE_PROJECT_ID = "sadia-a6e31";
const FUNCTION_URL = `https://asia-east1-${FIREBASE_PROJECT_ID}.cloudfunctions.net/geminiProxy/generateContent`;

export async function generateWithGemini(prompt: string, modelName = "gemini-1.5-flash"): Promise<string> {
  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        modelName,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result || "";
  } catch (error) {
    console.error('Error calling Gemini proxy:', error);
    return "";
  }
}

// Multimodal: accept an array of parts like { text } and { inlineData: { mimeType, data } }
// For image data, pass base64 strings in the imageData array
export async function generateWithGeminiParts(parts: any[], modelName = "gemini-1.5-flash"): Promise<string> {
  try {
    // Extract text and image data from parts
    const textParts = parts.filter(p => p.text);
    const imageParts = parts.filter(p => p.inlineData);
    
    const prompt = textParts.map(p => p.text).join(' ');
    const imageData = imageParts.map(p => p.inlineData.data);

    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        imageData,
        modelName,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result || "";
  } catch (error) {
    console.error('Error calling Gemini proxy:', error);
    return "";
  }
}

// Legacy function for backward compatibility
export function getGemini() {
  // This function is no longer needed since we use the proxy
  // Return a mock object to prevent breaking changes
  return {
    getGenerativeModel: () => ({
      generateContent: () => {
        throw new Error("Direct Gemini access disabled. Use generateWithGemini or generateWithGeminiParts instead.");
      }
    })
  };
}
