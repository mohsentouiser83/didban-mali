// API decimals may arrive in scientific notation; expand them without float rounding.
export function rial(amount: string) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(amount.trim());
  if (!match) throw new Error("Invalid monetary amount");
  const [, sign, integer, fraction = "", exponent = "0"] = match;
  const shift = Number(exponent) - fraction.length;
  const digits = integer + fraction;
  if (shift < 0 && !/^0*$/.test(digits.slice(shift))) throw new Error("Fractional rial amount");
  return BigInt(`${sign}${shift >= 0 ? digits + "0".repeat(shift) : digits.slice(0, shift) || "0"}`);
}

// Keep integer rial amounts exact before converting them for presentation.
export function toman(amount: string) {
  const value = rial(amount);
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / BigInt(10)}${absolute % BigInt(10) ? `.${absolute % BigInt(10)}` : ""}`;
}

