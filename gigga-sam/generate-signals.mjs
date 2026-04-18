import axios from "axios";
import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchNews() {
  try {
    const res = await axios.get("https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml");
    return ["Global tension rising","Market instability detected","System pressure increasing"];
  } catch {
    return ["Signal noise detected","Unknown pressure spike"];
  }
}

async function transform(text) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Convert real-world events into 1-line cyberpunk signal messages. No real names." },
      { role: "user", content: text }
    ]
  });

  return res.choices[0].message.content;
}

async function run() {
  const news = await fetchNews();

  const signals = [];
  for (let n of news) {
    const t = await transform(n);
    signals.push({
      text: t,
      intensity: Math.random(),
      ts: Date.now()
    });
  }

  fs.writeFileSync(
    "games/block-topia/data/live-signals.json",
    JSON.stringify({ signals }, null, 2)
  );

  console.log("Signals updated");
}

run();
