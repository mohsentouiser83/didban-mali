/** Presentation only: never convert financial Decimal strings to Number. */
export function normalizeMoneyInput(value: string): string {
  return value
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".")
    .replace(/−/g, "-");
}

/** Keeps fractional digits, including trailing zeroes and an in-progress dot. */
export function groupMoneyDigits(value: string): string {
  const match = /^(-?)(\d*)(\.?\d*)$/.exec(value);
  if (!match) return value;
  return match[1] + match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + match[3];
}

/** Format explicit currency amounts in prose; leave dates and identifiers alone. */
export function formatMoneyText(text: string): string {
  return text.replace(
    /[−-]?[0-9۰-۹٠-٩]+(?:[,٬][0-9۰-۹٠-٩]{3})*(?:[.٫][0-9۰-۹٠-٩]+)?(?=\s*(?:ریال|تومان|دلار)(?:\s|[.،؛:!?؟]|$))/g,
    (value) => {
      const negative = /^[−-]/.exec(value)?.[0] ?? "";
      const [whole, fraction] = value.replace(/^[−-]/, "").split(/[.٫]/);
      const grouped = whole
        .replace(/[,٬]/g, "")
        .replace(/([0-9۰-۹٠-٩])(?=([0-9۰-۹٠-٩]{3})+(?![0-9۰-۹٠-٩]))/g, "$1,");
      return (
        negative +
        grouped +
        (fraction !== undefined
          ? (value.includes("٫") ? "٫" : ".") + fraction
          : "")
      );
    },
  );
}
