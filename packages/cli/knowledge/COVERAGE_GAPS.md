# Coverage Gaps and Crawl Boundary

## Directly known

- Unique Canadian URLs discovered: 170.
- HTTP 200 responses: 160.
- HTTP 200 pages with extractable main content: 158.
- Included web-page records after relevance filtering: 151.
- The global sitemap index worked, but the `en-CA` sitemap repeatedly returned `504 Gateway Time-out` during this collection.
- The Canadian `robots.txt` redirect target returned 404; the working U.S.-locale file disallowed query-string URLs. This crawl used query-free public URLs only.

## Failed live URLs

- `404` - https://ads.spotify.com/en-CA/help-center/export-reports/
- `404` - https://ads.spotify.com/en-CA/help-center/table-view/
- `404` - https://ads.spotify.com/en-CA/industries/food-and-beverage-advertising/
- `404` - https://ads.spotify.com/en-CA/news-and-insights/click-optimization-goals-and-cta-cards-available/
- `404` - https://ads.spotify.com/en-CA/news-and-insights/streaming-auto-brands/
- `500` - https://ads.spotify.com/en-CA/help-center/fan-targeting/
- `500` - https://ads.spotify.com/en-CA/help-center/genre-targeting/
- `500` - https://ads.spotify.com/en-CA/help-center/music-promotion-type/
- `500` - https://ads.spotify.com/en-CA/help-center/real-time-context-targeting/
- `500` - https://ads.spotify.com/en-CA/help-center/reporting-music-campaigns/

## HTTP 200 pages without usable main content

- https://ads.spotify.com/en-CA/help-center/ - title `Help Center`
- https://ads.spotify.com/en-CA/help-center/getting-started-with-ad-studio/ - title `Help Center`

## Deliberately excluded as outside best-practice/use scope

- https://ads.spotify.com/en-CA/help-center/differences-invoices-versus-account/
- https://ads.spotify.com/en-CA/help-center/errors-inputting-credit-card/
- https://ads.spotify.com/en-CA/help-center/forgot-password/
- https://ads.spotify.com/en-CA/help-center/issues-invoices/
- https://ads.spotify.com/en-CA/help-center/other-questions/
- https://ads.spotify.com/en-CA/news-and-insights/spotify-fourth-quarter-earnings-2024/
- https://ads.spotify.com/en-CA/news-and-insights/spotify-third-quarter-earnings-2024/

## Completeness conclusion

This corpus is comprehensive for the working, query-free Canadian link graph and search-discovered additions observed on 2026-07-21. It is not proof that every historical, unlinked, localized, personalized, gated, or search-unindexed Spotify Ads page has been captured.

## Best next refresh test

Retry the localized sitemap and the five persistent 500 URLs, then diff the resulting canonical URL set against `inventory.csv`.
