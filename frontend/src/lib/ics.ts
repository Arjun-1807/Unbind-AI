/**
 * iCalendar (RFC 5545) TEXT value escaping.
 *
 * The .ics files this app generates interpolate model-generated strings (key
 * date labels and descriptions, which ultimately echo attacker-controlled
 * contract text) straight into `SUMMARY:` / `DESCRIPTION:` lines. iCalendar is
 * a CRLF line-oriented format, so a raw newline inside one of those values ends
 * the property and everything after it is parsed as a new property — or a whole
 * second VEVENT — in the user's calendar app. Commas, semicolons and
 * backslashes are value/parameter separators and need escaping too.
 *
 * Per RFC 5545 §3.3.11, escaped-char is: "\\" / "\;" / "\," / "\N" / "\n".
 * The backslash must be replaced first so the escapes we add aren't re-escaped.
 */
export function escapeIcsText(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    // Normalise CRLF / CR / LF alike to the literal two-character "\n" sequence.
    .replace(/\r\n|\r|\n/g, "\\n");
}
