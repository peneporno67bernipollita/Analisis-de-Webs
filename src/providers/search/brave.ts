import { getEnv } from "@/config/env";
import type { SearchProvider, SearchResult, UsageRecorder } from "@/domain/ports";
import { retry } from "@/shared/async";
import { ProviderError, isRetryableStatus } from "@/shared/errors";

/** Brave Search API — https://api-dashboard.search.brave.com/app/documentation/web-search */
export class BraveSearchProvider implements SearchProvider {
  readonly key = "brave";
  constructor(private readonly apiKey = getEnv().SEARCH_API_KEY) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(
    query: string,
    opts: { countryCode?: string; language?: string; count?: number },
    usage: UsageRecorder,
  ): Promise<SearchResult[]> {
    if (!this.apiKey) return [];
    const params = new URLSearchParams({ q: query, count: String(opts.count ?? 8), safesearch: "moderate" });
    if (opts.countryCode) params.set("country", opts.countryCode.toLowerCase());
    if (opts.language) params.set("search_lang", opts.language);
    const data = await retry(
      async () => {
        const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
          headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey! },
          signal: AbortSignal.timeout(15_000),
        });
        usage.record("search_brave");
        if (!res.ok)
          throw new ProviderError(
            this.key,
            `Brave Search ${res.status}`,
            res.status,
            isRetryableStatus(res.status),
          );
        return (await res.json()) as {
          web?: { results?: { url: string; title: string; description?: string }[] };
        };
      },
      {
        retries: 2,
        baseDelayMs: 1500,
        shouldRetry: (e) => (e instanceof ProviderError ? e.retryable : true),
      },
    );
    return (data.web?.results ?? []).map((r) => ({ url: r.url, title: r.title, snippet: r.description }));
  }
}
