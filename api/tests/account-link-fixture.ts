/** Supports old saved test fixtures and the current fragment-only email links. */
export function accountTokenFromLink(link:string):string|null {
 const url=new URL(link,'http://localhost');
 return new URLSearchParams(url.hash.slice(1)).get('token')||url.searchParams.get('token');
}
