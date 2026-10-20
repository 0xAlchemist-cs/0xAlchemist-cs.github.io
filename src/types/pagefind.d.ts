declare module '@pagefind/default-ui' {
  export class PagefindUI {
    constructor(options: {
      element: string;
      bundlePath?: string;
      excerptLength?: number;
      showSubResults?: boolean;
      showImages?: boolean;
      translations?: Record<string, string>;
    });
  }
}
