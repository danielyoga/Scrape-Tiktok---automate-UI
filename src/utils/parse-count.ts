/** Parses TikTok's display-formatted counts: "18.800" (18,800) or "4.4K" / "3.4M". */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.trim().toUpperCase();

  const suffix = t.match(/^([\d.,]+)([KM])$/);
  if (suffix) {
    const n = parseFloat(suffix[1].replace(",", "."));
    return Math.round(n * (suffix[2] === "K" ? 1_000 : 1_000_000));
  }

  const digits = t.replace(/[.,]/g, "");
  return digits ? parseInt(digits, 10) : null;
}
