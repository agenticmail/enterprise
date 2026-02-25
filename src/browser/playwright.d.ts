declare module "playwright" { export const chromium: any; export const firefox: any; export const webkit: any; }
declare module "playwright-core" {
  export type Page = any;
  export type Browser = any;
  export type BrowserContext = any;
  export type CDPSession = any;
  export type ConsoleMessage = any;
  export type Request = any;
  export type Response = any;
  export const chromium: any;
  export const devices: Record<string, any>;
}
