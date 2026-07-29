// Brain Box — usage-tracking beacon. Increments today's play counter in
// Vercel KV. Fired from scripts/practice.js at the exact moment a prompt
// hits the Anthropic API (api/generate-hint.js) — NOT on page load/view,
// per the "user main brain-box" definition this counter is meant to track.
//
// Uses Vercel KV's REST API directly (no @vercel/kv SDK) — this repo has
// no package.json/build step, and this keeps it that way.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) {
    res.status(500).json({ error: "Server not configured: KV_REST_API_URL/KV_REST_API_TOKEN missing" });
    return;
  }

  // UTC calendar date — see api/send-daily-digest.js for how this lines up
  // with the 07:00 WIB cron trigger.
  const today = new Date().toISOString().slice(0, 10);
  const key = `plays:${today}`;

  try {
    const kvRes = await fetch(`${kvUrl}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${kvToken}` }
    });
    if (!kvRes.ok) {
      res.status(502).json({ error: "KV request failed" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
