// Things expects spaces as %20. URLSearchParams encodes them as "+", and
// Things keeps the "+" literally in titles and notes
// (jimfilippou/things-mcp#4, fix from jimfilippou/things-mcp#2).
export function thingsQuery(params: URLSearchParams): string {
  return params.toString().replace(/\+/g, "%20");
}
