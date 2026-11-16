/** Quote one RFC 4180 field while keeping spreadsheet formula-like values inert. */
export function csvCell(value:unknown):string {
 let text=String(value??'');
 // Preserve the original value. The quote is an intentional spreadsheet safety
 // prefix, including for formulas hidden behind whitespace/control characters.
 if(/^[\t\0]/u.test(text)||/^[\s\u0000-\u001f]*[=+@-]/u.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}

/** Each field is quoted, including embedded delimiters and CR/LF. */
export function csvDocument(headers:readonly string[],rows:readonly (readonly unknown[])[]):string {
 return [headers.map(csvCell).join(','),...rows.map(row=>row.map(csvCell).join(','))].join('\r\n');
}
