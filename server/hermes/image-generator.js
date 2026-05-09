"use strict";

const https = require("node:https");

function getOpenAiKey() {
  return String(process.env.OPENAI_API_KEY || "").trim();
}

function generateImage(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const key = getOpenAiKey();
    if (!key) {
      reject(new Error("Missing required server secret: OPENAI_API_KEY"));
      return;
    }
    const body = Buffer.from(JSON.stringify({
      model: "gpt-image-1",
      prompt: String(prompt || "").trim(),
      size: String(options.size || "1024x1024")
    }));
    const req = https.request({
      hostname: "api.openai.com",
      path: "/v1/images/generations",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
        "Authorization": `Bearer ${key}`
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(data?.error?.message || `Image API ${res.statusCode} failed`));
            return;
          }
          const item = Array.isArray(data?.data) ? data.data[0] : null;
          resolve({
            provider: "openai-images",
            revisedPrompt: String(item?.revised_prompt || ""),
            b64Json: String(item?.b64_json || "")
          });
        } catch (err) {
          reject(new Error(`Failed to parse image response: ${err.message}`));
        }
      });
    });
    req.setTimeout(45000, () => req.destroy(new Error("Image request timed out after 45000ms")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  getOpenAiKey,
  generateImage
};
