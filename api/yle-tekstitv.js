// Vercel serverless function: api/yle-tekstitv.js
// Fetches a public Yle Teksti-TV page server-side to avoid browser CORS restrictions.
export default async function handler(req, res) {
  const page = String(req.query.page || "223").replace(/\D/g, "").slice(0, 3) || "223";
  try {
    const upstream = await fetch(`https://yle.fi/tekstitv/txt/${page}_0001.htm`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TVOverlay/1.0)" },
      cache: "no-store"
    });
    if (!upstream.ok) throw new Error(`Yle vastasi HTTP ${upstream.status}`);
    const html = await upstream.text();
    // Convert common HTML line breaks and remove markup/entities, then parse the monospaced teletext rows.
    let text = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|pre|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&auml;/gi, "ä").replace(/&ouml;/gi, "ö").replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö")
      .replace(/\r/g, "");
    text = text.split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    const titleMatch = text.match(/JÄÄKIEKKO\s+SM-LIIGA\s+(\d+\/\d+)/i) || text.match(/SM-LIIGA\s+(\d+\/\d+)/i);
    const title = (text.match(/JÄÄKIEKKO\s+SM-LIIGA/i) || text.match(/SM-LIIGA/i) || ["SARJATAULUKKO"])[0].toUpperCase();
    const rows = [];
    for (const line0 of text.split("\n")) {
      const line = line0.replace(/\s+/g, " ").trim();
      // Format: team, played, four result columns, goals-for/goals-against, points.
      const m = line.match(/^([A-Za-zÅÄÖåäöÉéÜü\-\.]+)\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,3})\s*-\s*(\d{1,3})\s+(\d{1,2})$/);
      if (m) {
        rows.push({ team: m[1], played: +m[2], won: +m[3], otw: +m[4], otl: +m[5], lost: +m[6], goals: `${m[7]}-${m[8]}`, points: +m[9] });
      }
    }
    // If Yle changes its HTML layout, return the extracted source text for diagnosis rather than fabricated rows.
    if (!rows.length) {
      res.status(502).json({ error: "Sarjataulukon rivejä ei tunnistettu Ylen sivulta.", source_preview: text.slice(0, 1800) });
      return;
    }
    res.setHeader("Cache-Control", "s-maxage=2, stale-while-revalidate=3");
    res.status(200).json({
      page, title, subpage: titleMatch ? titleMatch[1] : "",
      footer: "Lähde: Yle Teksti-TV · sivu " + page,
      rows
    });
  } catch (e) {
    res.status(502).json({ error: e.message || "Ylen Teksti-TV:n haku epäonnistui." });
  }
}
