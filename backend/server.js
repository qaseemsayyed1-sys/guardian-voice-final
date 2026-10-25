const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash"
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.get("/", (req, res) => {
  res.status(200).send("Guardian Voice backend is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Guardian Voice",
    aiConfigured: Boolean(GEMINI_API_KEY)
  });
});

app.post("/api/reset", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Chat reset successfully"
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "AI API key is missing. Configure GEMINI_API_KEY in Render."
      });
    }

    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "A valid message is required."
      });
    }

    const contents = [];

    if (Array.isArray(history)) {
      for (const item of history.slice(-12)) {
        if (
          item &&
          typeof item.content === "string" &&
          item.content.trim() &&
          ["user", "assistant", "model"].includes(item.role)
        ) {
          contents.push({
            role: item.role === "assistant" ? "model" : item.role,
            parts: [{ text: item.content.slice(0, 4000) }]
          });
        }
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: message.trim().slice(0, 10000) }]
    });

    const requestBody = {
      systemInstruction: {
        parts: [
          {
            text: "You are Guardian Voice, a helpful and calm AI assistant. Give clear, practical, safety-conscious answers. If someone may be in immediate danger, advise contacting local emergency services or a trusted person. Never claim that you have contacted emergency services or that help has been dispatched. Keep responses concise and easy to understand."
          }
        ]
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 512
      }
    };

    let response = null;
    let lastError = null;

    const retryableStatuses = [429, 500, 502, 503, 504];

    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) {
            await sleep(1500);
          }

          response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            requestBody,
            {
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY
              },
              timeout: 25000
            }
          );

          const reply =
            response.data?.candidates?.[0]?.content?.parts
              ?.map((part) => part.text || "")
              .join("")
              .trim();

          if (!reply) {
            response = null;
            lastError = new Error("The AI returned an empty response.");
            break;
          }

          return res.status(200).json({
            reply,
            uiUpdate: {}
          });
        } catch (error) {
          lastError = error;

          const status = error.response?.status;

          console.error("Gemini request failed:", {
            model,
            attempt: attempt + 1,
            status: status || "No HTTP status",
            message: error.message
          });

          if (status && !retryableStatuses.includes(status)) {
            if (status === 400 || status === 401 || status === 403 || status === 404) {
              break;
            }

            break;
          }

          if (attempt === 0) {
            await sleep(1000);
          }
        }
      }
    }

    console.error(
      "All Gemini models failed:",
      lastError?.response?.data || lastError?.message
    );

    const status = lastError?.response?.status;

    if (status === 400 || status === 401 || status === 403 || status === 404) {
      return res.status(502).json({
        error: "Gemini configuration or API key issue. Check Render logs and API access."
      });
    }

    return res.status(503).json({
      error: "AI is temporarily busy. Please try again in a few seconds."
    });
  } catch (error) {
    console.error("Guardian Voice server error:", error.message);

    return res.status(500).json({
      error: "An unexpected server error occurred."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Guardian Voice backend running on port ${PORT}`);
});
