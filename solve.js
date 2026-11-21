// A fast drop-in for csv-reader 1.0.0: reads one broken CSV text, left to right,
// and returns {columns, rows, errors} exactly as the reference does.
// Dependency-free ES module. No state is kept between calls: every input is
// answered on its own.
//
// How it reads (from the competition rules):
// - A U+FEFF at the very start is dropped. A record ends at LF or CRLF; a line
//   left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (stray_cr).
// - A field that opens with a quote runs to the next quote that is not doubled;
//   "" inside it is one quote; each CRLF or lone CR inside it reads as LF.
//   What follows its closing quote, up to the next comma or line break, is
//   appended as it stands (quote_junk, when the field ends). A quote that
//   never closes is a literal character and the text after it is read again
//   as unquoted (unterminated_quote).
// - A quote inside an unquoted field is a literal character. Fields stay
//   strings, never trimmed or converted.
// - columns is the first record when header is true, else null (an empty
//   array when header is true and the text holds no record at all); rows
//   holds the records after it (every record when header is false), each
//   padded with empty strings (short_row, with fields: its field count) or
//   cut (long_row, with extra: the cut fields) to the first record's width.
// - Each error is {code, line, row}, in the order met; every error of a
//   record carries the 1-based line its record starts on (counting every LF,
//   CRLF and lone CR inside quotes), and row its record's index in rows,
//   null for the header.
//
// How it is fast: one pass, inlined field parsing (no helper call per
// field), indexOf jumps to the next delimiter instead of a per-character
// loop, and two monotonic cursors for the sparse characters (CR and the
// double quote) so searching for either costs one pass over the text in
// total instead of rescanning the same stretch from every field.

export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  let p = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) p = 1;

  const errors = [];
  const rows = [];
  let columns = header ? [] : null;
  let width = 0;
  let line = 1;
  let seen = 0;
  // True when a stray CR was dropped just before this record starts: the
  // record's first field is then read as unquoted (a quote that follows the
  // dropped CR is a literal character, not an opener), because the CR has
  // already started the field.
  let forced = false;

  // The next CR / double quote at or after the current scan point (Infinity
  // when none remain). Both cursors move only forward, so all searches for
  // either character together cost one pass over the text. CRs are sparse,
  // so an unbounded indexOf('\r') from every field would rescan the same
  // stretch thousands of times; quotes are dense, but the cursor also keeps
  // quote-free stretches (an unterminated tail holds none) from rescanning.
  let nextCR = -1;
  let nextQ = -1;
  const crAt = (from) => {
    if (nextCR < from) {
      const r = text.indexOf('\r', from);
      nextCR = r === -1 ? Infinity : r;
    }
    return nextCR;
  };
  const qAt = (from) => {
    if (nextQ < from) {
      const r = text.indexOf('"', from);
      nextQ = r === -1 ? Infinity : r;
    }
    return nextQ;
  };

  while (p < n) {
    const ch = text.charCodeAt(p);
    if (ch === 10) { p++; line++; forced = false; continue; }
    if (ch === 13) {
      if (p + 1 < n && text.charCodeAt(p + 1) === 10) { p += 2; line++; forced = false; continue; }
      // A lone CR before any field of the next record: dropped, as ever, and
      // the record that follows starts mid-field (see `forced` above).
      errors.push({ code: 'stray_cr', line, row: header ? (seen === 0 ? null : seen - 1) : seen });
      p++;
      forced = true;
      continue;
    }

    const startLine = line;
    const row = header ? (seen === 0 ? null : seen - 1) : seen;
    const nl0 = text.indexOf('\n', p);
    const nl = nl0 === -1 ? n : nl0;

    if (!forced && qAt(p) >= nl) {
      // Fast line: no quote on this line, so the record ends at its line
      // break. A CR here can only be the CRLF that ends it; a stray CR in
      // the line needs the slow path below.
      const cr = crAt(p);
      if (cr >= nl || (cr === nl - 1 && nl < n)) {
        const end = cr === nl - 1 && nl < n ? nl - 1 : nl;
        const fields = [];
        let s = p;
        for (;;) {
          const c = text.indexOf(',', s);
          if (c === -1 || c >= end) { fields.push(text.slice(s, end)); break; }
          fields.push(text.slice(s, c));
          s = c + 1;
        }
        p = nl < n ? nl + 1 : n;
        if (nl < n) line++;
        if (seen === 0) {
          width = fields.length;
          if (header) columns = fields;
          else rows.push(fields);
        } else if (fields.length < width) {
          errors.push({ code: 'short_row', line: startLine, row, fields: fields.length });
          while (fields.length < width) fields.push('');
          rows.push(fields);
        } else if (fields.length > width) {
          errors.push({ code: 'long_row', line: startLine, row, extra: fields.slice(width) });
          fields.length = width;
          rows.push(fields);
        } else {
          rows.push(fields);
        }
        seen++;
        continue;
      }
    }

    // Slow path: this record holds a quote, a stray CR, or both; or its
    // first field was forced unquoted by a dropped CR just before it.
    // endKind: 0 after a comma (another field follows), 1 at the end of the
    // record, 2 at the end of the text.
    const fields = [];
    let recDone = false;
    let firstField = true;
    while (!recDone) {
      if (p >= n) { fields.push(''); recDone = true; break; }
      let endKind = 0;
      let isQuoted = text.charCodeAt(p) === 34 && !(firstField && forced);
      firstField = false;

      if (isQuoted) {
        const start = p;
        let j = start + 1;
        let close = -1;
        let doubled = false;
        for (;;) {
          const q = text.indexOf('"', j);
          if (q === -1) break;
          if (q + 1 < n && text.charCodeAt(q + 1) === 34) { doubled = true; j = q + 2; continue; }
          close = q;
          break;
        }
        if (close === -1) {
          // The quote never closes: it is a literal character and the text
          // after it is read again as unquoted, below.
          errors.push({ code: 'unterminated_quote', line: startLine, row });
          isQuoted = false;
        } else {
          let val = text.slice(start + 1, close);
          if (doubled) val = val.replaceAll('""', '"');
          if (val.indexOf('\n') !== -1 || val.indexOf('\r') !== -1) {
            val = val.replace(/\r\n?/g, '\n');
            let k = -1;
            let breaks = 0;
            while ((k = val.indexOf('\n', k + 1)) !== -1) breaks++;
            line += breaks;
          }
          // What follows the closing quote, up to the next comma or line
          // break, is appended as it stands. A lone CR inside that tail is
          // dropped with a stray_cr error and the tail carries on past it.
          p = close + 1;
          let junk = '';
          let junkDone = false;
          while (!junkDone) {
            const nc = text.indexOf(',', p);
            const nn = text.indexOf('\n', p);
            const nr = crAt(p);
            let end = n;
            let kind = 2;
            if (nc !== -1 && nc < end) { end = nc; kind = 0; }
            if (nn !== -1 && nn < end) { end = nn; kind = 1; }
            if (nr < end) { end = nr; kind = 3; }
            if (kind === 3) {
              if (end + 1 < n && text.charCodeAt(end + 1) === 10) {
                junk += text.slice(p, end);
                if (junk.length > 0) errors.push({ code: 'quote_junk', line: startLine, row });
                fields.push(val + junk);
                p = end + 2;
                line++;
                endKind = 1;
                junkDone = true;
              } else {
                errors.push({ code: 'stray_cr', line: startLine, row });
                junk += text.slice(p, end);
                p = end + 1;
              }
              continue;
            }
            junk += text.slice(p, end);
            if (junk.length > 0) errors.push({ code: 'quote_junk', line: startLine, row });
            fields.push(val + junk);
            if (kind === 0) { p = end + 1; endKind = 0; }
            else if (kind === 1) { p = end + 1; line++; endKind = 1; }
            else { p = n; endKind = 2; }
            junkDone = true;
          }
        }
      }

      if (!isQuoted) {
        // An unquoted field: a quote inside it is a literal character. A
        // lone CR is dropped with a stray_cr error and the field carries on
        // past it; a CRLF ends the record.
        let val = '';
        let s = p;
        let unqDone = false;
        while (!unqDone) {
          const nc = text.indexOf(',', s);
          const nn = text.indexOf('\n', s);
          const nr = crAt(s);
          let end = n;
          let kind = 2;
          if (nc !== -1 && nc < end) { end = nc; kind = 0; }
          if (nn !== -1 && nn < end) { end = nn; kind = 1; }
          if (nr < end) { end = nr; kind = 3; }
          if (kind === 3) {
            if (end + 1 < n && text.charCodeAt(end + 1) === 10) {
              val += text.slice(s, end);
              fields.push(val);
              p = end + 2;
              line++;
              endKind = 1;
              unqDone = true;
            } else {
              errors.push({ code: 'stray_cr', line: startLine, row });
              val += text.slice(s, end);
              s = end + 1;
            }
            continue;
          }
          val += text.slice(s, end);
          fields.push(val);
          if (kind === 0) { p = end + 1; endKind = 0; }
          else if (kind === 1) { p = end + 1; line++; endKind = 1; }
          else { p = n; endKind = 2; }
          unqDone = true;
        }
      }

      if (endKind !== 0) recDone = true;
    }
    forced = false;

    // File the finished record away: the first sets the width, the rest are
    // padded or cut to it, with a short_row / long_row error when they differ.
    if (seen === 0) {
      width = fields.length;
      if (header) columns = fields;
      else rows.push(fields);
    } else if (fields.length < width) {
      errors.push({ code: 'short_row', line: startLine, row, fields: fields.length });
      while (fields.length < width) fields.push('');
      rows.push(fields);
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: startLine, row, extra: fields.slice(width) });
      fields.length = width;
      rows.push(fields);
    } else {
      rows.push(fields);
    }
    seen++;
  }

  return { columns, rows, errors };
}
