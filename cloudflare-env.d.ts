interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Database {
  readonly __d1Brand?: unique symbol;
}

declare module "cloudflare:workers" {
  export const env: { DB?: D1Database };
}
