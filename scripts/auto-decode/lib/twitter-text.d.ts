// The part of twitter-text 3.1.0 (X's own tweet parser, Apache-2.0) this package
// uses. The package ships no types.
declare module 'twitter-text' {
  interface UrlEntity {
    url: string;
    indices: [number, number];
  }
  interface ExtractUrlsOptions {
    /** Also extract bare domains such as `example.com/x`, as X does. Default true. */
    extractUrlsWithoutProtocol?: boolean;
  }
  const twitterText: {
    extractUrlsWithIndices(text: string, options?: ExtractUrlsOptions): UrlEntity[];
  };
  export default twitterText;
}
