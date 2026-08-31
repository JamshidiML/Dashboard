// Regenerates market.json from free, keyless public APIs:
//   - Stooq (stock daily closes, CSV, no key)
//   - CoinGecko (crypto price + 7d sparkline, no key)
//   - Hacker News Algolia API (front-page tech news, no key)
//
// Run by the same daily Action as update-data.mjs.

const STOCKS = ["spy.us", "qqq.us", "nvda.us", "msft.us", "googl.us", "amd.us"];
const STOCK_LABELS = {
  "spy.us": "S&P 500 (SPY)",
  "qqq.us": "Nasdaq 100 (QQQ)",
  "nvda.us": "NVIDIA",
  "msft.us": "Microsoft",
  "googl.us": "Alphabet",
  "amd.us": "AMD",
};

async function fetchStock(symbol) {
  const res = await fetch(`https://stooq.com/q/d/l/?s=${symbol}&i=d`);
  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 3) return null;
  const rows = lines.slice(1).map((l) => l.split(","));
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const close = parseFloat(last[4]);
  const prevClose = parseFloat(prev[4]);
  const changePct = ((close - prevClose) / prevClose) * 100;
  return {
    symbol,
    label: STOCK_LABELS[symbol] || symbol,
    date: last[0],
    close,
    change_pct: Math.round(changePct * 100) / 100,
    // last 20 closes for a sparkline
    series: rows.slice(-20).map((r) => parseFloat(r[4])),
  };
}

async function fetchCrypto() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&sparkline=true&price_change_percentage=24h,7d"
  );
  const data = await res.json();
  return data.map((c) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    price: c.current_price,
    change_24h_pct: c.price_change_percentage_24h_in_currency,
    change_7d_pct: c.price_change_percentage_7d_in_currency,
    sparkline_7d: (c.sparkline_in_7d?.price || []).filter((_, i) => i % 6 === 0), // thin to ~28 points
  }));
}

async function fetchNews() {
  const res = await fetch(
    "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60"
  );
  const data = await res.json();
  const keywords = /\b(ai|llm|gpt|openai|anthropic|claude|gemini|nvidia|machine learning|neural)\b/i;
  const hits = (data.hits || [])
    .filter((h) => h.title && keywords.test(h.title))
    .slice(0, 3)
    .map((h) => ({
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points,
    }));
  return hits;
}

async function main() {
  const [stocks, crypto, news] = await Promise.all([
    Promise.all(STOCKS.map(fetchStock)).then((r) => r.filter(Boolean)),
    fetchCrypto().catch(() => []),
    fetchNews().catch(() => []),
  ]);

  const payload = {
    generated_at: new Date().toISOString(),
    stocks,
    crypto,
    news,
  };

  const fs = await import("node:fs/promises");
  await fs.writeFile("market.json", JSON.stringify(payload, null, 2));
  console.log(
    `Wrote market.json: ${stocks.length} stocks, ${crypto.length} crypto, ${news.length} news items.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
