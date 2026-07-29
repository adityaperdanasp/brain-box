// Brain Box — daily usage digest. Triggered by the cron entry in
// vercel.json (0 0 * * * = 00:00 UTC = 07:00 WIB). Reads yesterday's play
// counter from Vercel KV and posts it straight to Telegram — no other
// system involved, independent from al-idrisi-games' own cron/messages.
//
// Vercel Cron sends GET requests, not POST — this accepts both.
//
// Optional hardening (not wired up — would need one more env var,
// CRON_SECRET, flagged separately rather than added silently): Vercel
// auto-injects `Authorization: Bearer $CRON_SECRET` on cron-triggered
// calls if that env var is set, so the handler could reject any request
// missing/mismatching it. Left out for now since this endpoint only
// leaks a play count, not anything sensitive — happy to add it if wanted.
module.exports = async (req, res) => {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!kvUrl || !kvToken || !botToken || !chatId) {
    res.status(500).json({ error: "Server not configured: missing KV or Telegram env vars" });
    return;
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const key = `plays:${yesterday}`;

  try {
    const kvRes = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${kvToken}` }
    });
    if (!kvRes.ok) {
      res.status(502).json({ error: "KV request failed" });
      return;
    }
    const kvData = await kvRes.json();
    const count = Number(kvData.result) || 0;

    const text = `📊 ${yesterday} — brain-box: ${count} player`;
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    if (!tgRes.ok) {
      const detail = await tgRes.text();
      res.status(502).json({ error: "Telegram send failed", detail });
      return;
    }

    res.status(200).json({ ok: true, date: yesterday, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
