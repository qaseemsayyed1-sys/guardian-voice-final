
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.8-flash";

app.get("/", (req, res) => {
  res.status(200).send("Guardian Voice Backend is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/api/reset", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Guardian Voice is ready",
    uiUpdate: {}
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const message =
      typeof req.body.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        reply: "Please enter a message.",
        uiUpdate: {}
      });
    }

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");

      return res.status(500).json({
        reply: "AI service is not configured. Please try again later.",
        uiUpdate: {}
      });
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        systemInstruction: {
          parts: [
            {
              text: "You are Guardian Voice, a helpful, intelligent and friendly AI assistant. Answer clearly, accurately and naturally. If you do not know something, say so honestly."
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: message }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        timeout: 30000
      }
    );

    const reply =
      response.data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

    if (!reply) {
      return res.status(502).json({
        reply: "I could not generate a response. Please try again.",
        uiUpdate: {}
      });
    }

    return res.status(200).json({
      reply,
      uiUpdate: {}
    });
  } catch (error) {
    console.error(
      "GEMINI_ERROR_STATUS:",
      error.response?.status || "No HTTP status"
    );

    console.error(
      "GEMINI_ERROR_BODY:",
      JSON.stringify(error.response?.data || error.message)
    );

    return res.status(502).json({
      reply: "AI service is temporarily unavailable. Please try again shortly.",
      uiUpdate: {}
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Guardian Backend running on port ${PORT}`);
});
