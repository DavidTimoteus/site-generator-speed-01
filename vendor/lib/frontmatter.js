// makefun-site's front matter (README.md, "Front matter"): a strict subset of YAML's block mappings, its own. A source
// opens on a line "---" and its front matter runs to the next line "---"; every line between is blank, a comment
// ("#" first) or "key: value" with one space after the colon. Seven keys are known, each with its own value grammar,
// and anything else refuses the file with the first reason met, line by line.
//
// The reference used a regex per line and per value; this file does the same checks by hand (same shapes, same error
// strings) because a front-matter line is short and the regex setup dominated.

/** The keys a source's front matter may give. */
export const KEYS = Object.freeze(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);

/** Whether `line` is blank: empty, or only spaces and tabs (the reference's /^[ \t]*$/). */
function isBlank(line) {
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c !== ' ' && c !== '\t') return false;
  }
  return true;
}

/** `line` with its trailing spaces and tabs dropped (the reference's /[ \t]+$/). */
function rtrim(line) {
  let b = line.length;
  while (b > 0 && (line[b - 1] === ' ' || line[b - 1] === '\t')) b--;
  return b === line.length ? line : line.slice(0, b);
}

/**
 * `line` as "key: value" — the reference's /^([a-z_]+):(?: (.*))?$/ — or null when it is not one: the key is one or
 * more of a-z and _, then ':', then either the end of the line or one space and the rest (the rest kept as-is).
 */
function keyValue(line) {
  let i = 0;
  while (i < line.length) {
    const c = line.charCodeAt(i);
    if (!((c >= 97 && c <= 122) || c === 95)) break; // a-z or _
    i++;
  }
  if (i === 0 || i >= line.length || line.charCodeAt(i) !== 58) return null; // 58 = ':'
  if (i + 1 === line.length) return { key: line.slice(0, i), raw: '' };
  if (line.charCodeAt(i + 1) !== 32) return null; // 32 = ' '
  return { key: line.slice(0, i), raw: line.slice(i + 2) };
}

/** `raw` as a YYYY-MM-DD date — the reference's /^(\d{4})-(\d{2})-(\d{2})$/ — or null when it is not one. */
function dateOf(raw) {
  if (raw.length !== 10 || raw[4] !== '-' || raw[7] !== '-') return null;
  let y = 0;
  let mo = 0;
  let d = 0;
  for (let i = 0; i < 10; i++) {
    if (i === 4 || i === 7) continue;
    const c = raw.charCodeAt(i);
    if (c < 48 || c > 57) return null; // not a digit
    const v = c - 48;
    if (i < 4) y = y * 10 + v;
    else if (i < 7) mo = mo * 10 + v;
    else d = d * 10 + v;
  }
  return { y, mo, d };
}

/** Whether `raw` is a template name: one or more of a-z, 0-9 and - (the reference's /^[a-z0-9-]+$/). */
function isName(raw) {
  if (raw.length === 0) return false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45)) return false;
  }
  return true;
}

/**
 * Whether `raw` is a slug: one or more of a-z and 0-9, dashes only between them, at most 64 characters
 * (the reference's /^[a-z0-9]+(?:-[a-z0-9]+)*$/ and its length cap).
 */
function isSlug(raw) {
  if (raw.length === 0 || raw.length > 64) return false;
  let prevDash = true; // a leading '-' fails
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) prevDash = false;
    else if (c === 45 && !prevDash) prevDash = true;
    else return false;
  }
  return !prevDash; // no trailing '-'
}

/** Whether `t` is a tag: one or more characters, none of " [ ] (the reference's /^[^"[\]]+$/). */
function isTag(t) {
  if (t.length === 0) return false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"' || c === '[' || c === ']') return false;
  }
  return true;
}

/** The days of month `m` (1-12) of year `y`, by the Gregorian rule. */
function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** A string value: "..." with \" and \\ its only escapes, or bare, the rest of the line (never opening on " or [). */
function stringOf(raw) {
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.startsWith('[')) return { error: 'a bare string opens on [' };
  return { value: raw };
}

/** One key's value, or why it is refused. */
function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      const p = dateOf(raw);
      if (!p || p.y < 1970 || p.y > 2099 || p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > daysIn(p.y, p.mo))
        return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      if (tags.some((t) => t === '' || !isTag(t))) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return isName(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return isSlug(raw) ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
}

/**
 * A source's front matter and body: { data, body }, or { error } with the first reason it is refused. `text` has "\n"
 * line ends.
 */
export function parseFrontMatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { error: 'no front matter' };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      close = i;
      break;
    }
  }
  if (close === -1) return { error: 'the front matter is not closed' };
  const data = {};
  for (let i = 1; i < close; i++) {
    const line = lines[i];
    if (isBlank(line) || line.startsWith('#')) continue;
    const kv = keyValue(line);
    if (kv === null) return { error: `line ${i + 1} is not "key: value"` };
    const raw = rtrim(kv.raw);
    if (!KEYS.includes(kv.key)) return { error: `unknown key "${kv.key}"` };
    if (Object.hasOwn(data, kv.key)) return { error: `key "${kv.key}" is given twice` };
    if (raw === '') return { error: `key "${kv.key}" has no value` };
    const v = valueOf(kv.key, raw);
    if ('error' in v) return v;
    data[kv.key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: lines.slice(close + 1).join('\n') };
}
