/* A note path in a URL. Paths may contain characters the URL grammar reserves — the API refuses % ? # outright, but
   spaces, non-ASCII and the rest must be encoded per segment or the router truncates the path at the first ? or #.
   Decoding is the mirror image: a malformed sequence must not throw, or the whole workspace unmounts. */

export const noteUrl = (path: string): string => '/n/' + path.split('/').map(encodeURIComponent).join('/');

export const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };
