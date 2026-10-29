# Security

SatelliteRoofs is a local, single-owner prototype. Keep all services bound to loopback. Do not publish the local API or database through a reverse proxy or port-forward without designing hosted authentication, authorization, tenant isolation and operational controls first.

Never commit `.runtime/`, `.env*`, uploaded customer documents, database files, OAuth credentials or provider tokens. Use your own accounts in Settings. Mapbox and AI features may consume billable usage; permanent geocoding is disabled, but this is not an account spending cap.

For a suspected vulnerability, use GitHub private vulnerability reporting when available. Do not include credentials, customer reports or exploitable details in a public issue. If a credential is exposed, revoke it at its provider; removing a file from a public repository is not sufficient.

Third-party provider responses and PDF contents are untrusted input. Native PDF inspection has limits; internet-facing or multi-user use needs a separate security review.
