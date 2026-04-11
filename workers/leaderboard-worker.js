export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === "GET") {
      const game = url.searchParams.get("game") || "global";
      const data = await env.LEADERBOARD.get(`leaderboard:${game}`);
      return new Response(data || "[]", { headers: corsHeaders });
    }

    if (request.method === "POST") {
      const { player, score, game } = await request.json();
      const key = `leaderboard:${game || "global"}`;

      let leaderboard = JSON.parse(
        (await env.LEADERBOARD.get(key)) || "[]"
      );

      leaderboard.push({
        player,
        score,
        game,
        timestamp: Date.now()
      });

      leaderboard = leaderboard
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);

      await env.LEADERBOARD.put(key, JSON.stringify(leaderboard));

      return new Response(
        JSON.stringify({ status: "success" }),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: corsHeaders }
    );
  }
};