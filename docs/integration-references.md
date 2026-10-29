# Integration references

These official documents describe external contracts, not guarantees of account eligibility, source coverage or extraction accuracy.

- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) — optional map rendering and attribution.
- [Mapbox Search Box](https://docs.mapbox.com/api/search/search-box/) — suggest/retrieve navigation and search sessions.
- [Mapbox Geocoding](https://docs.mapbox.com/api/search/geocoding/) — temporary reverse lookup. Permanent geocoding is blocked in this app; temporary results are not stored as project addresses.
- [NJGIN parcels](https://www.nj.gov/njgin/edata/parcels/) — the current public parcel adapter covers New Jersey, not all locations. Reference geometry is not survey data.
- [OpenAI sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) — user-owned account authorization and local callback.
- [OpenAI models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) — account model catalog and inference contract.
- [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search) — supplier research with consulted source links.
- [ChatGPT plan limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) — eligibility and supported request options vary by account/model.

The Codex app-server adapter is disabled; its example configuration is retained for reference only. JobNimbus is currently mocked. See [implementation limits](limitations.md) before describing these capabilities to a customer or deploying the app.
