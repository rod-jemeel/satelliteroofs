# Implementation limits and verification

## Implemented

PDF upload; native-text measurement candidates with source evidence; human correction and verification; versioned deterministic estimates; material/labor calculations; approval and customer/internal exports; optional map sketches, layer order, temporary address search and supplier research.

## Not production-complete

- Only synthetic report fixtures have a reviewed extraction baseline. Generic PDFs use label-based extraction; no accuracy percentage or multi-provider reliability claim is justified.
- Scanned/image-only PDFs do not have validated OCR or vision extraction. Manual entry remains available.
- Roof pitch is not measured from satellite imagery. Map-based budgets depend on manually reviewed assumptions and imagery alignment.
- Demo assemblies, coverage and prices are not manufacturer-certified specifications or contractor rates. They require business configuration.
- JobNimbus is a mock integration. There is no live CRM sync or production-manager handoff automation.
- Automatic parcel highlighting currently covers New Jersey only. Parcel boundaries are reference data, not legal survey data.
- No hosted identity, tenancy, backups, billing controls or internet deployment is supplied.
- No embeddings, vector database or autonomous purchasing are used.

## Tests and clean installs

The backend suite covers PDF evidence, unit conversion, calculation invariants, stale revisions, approval gates, export separation, provider failures and parcel boundaries. Geometry and browser suites cover roof drawing, overlapping layers, saved state, address navigation, mobile layouts and the PDF-to-estimate workflow. External APIs are stubbed in browser regressions.

The original development machine used a compatibility Python environment. The pinned public requirements installed successfully in a fresh Python 3.12 environment; all 69 backend tests and pip dependency checks passed. The frontend production build, 10 geometry tests and 34 browser tests also passed locally. Running tests proves the tested behavior, not acceptance of a new provider's report or eligibility for an external account feature.

## Media

The PDF walkthrough is an automated recording of the real local app using `fixtures/demo-roof-report.pdf`, not a simulated interface. Captions identify synthetic inputs and demonstration pricing. External requests are blocked during recording. Map screenshots are separate interface examples, not proof of measured roof accuracy. The media contains no user-uploaded report, saved API token or connected-account settings.
