import Schema from '@deepseek-ai/schemastery';
import { WebError } from '@deepseek-ai/dsh-web';
import { createSearchProvider, DEFAULTS } from './provider.js';

export const name = 'web-search-searxng';
export const inject = ['web'];

// Volatile fields participate in Harness settings and update without a restart.
export const Config = Schema.object({
  baseURL: Schema.string().default(DEFAULTS.baseURL).volatile(),
  maxResults: Schema.number().step(1).min(1).max(50).default(DEFAULTS.maxResults).volatile(),
  language: Schema.string().default(DEFAULTS.language).volatile(),
  engines: Schema.string().default(DEFAULTS.engines).volatile(),
  timeoutMs: Schema.number().step(1).min(100).max(120000).default(DEFAULTS.timeoutMs).volatile(),
});

export function apply(ctx, config) {
  const readOptions = () => Object.fromEntries(
    Object.keys(DEFAULTS).map((key) => [key, config[key].get()]),
  );
  ctx.web.registerSearchProvider(createSearchProvider(readOptions, {
    makeError: (message, code, cause) => new WebError(message, code, { cause }),
  }));
}
