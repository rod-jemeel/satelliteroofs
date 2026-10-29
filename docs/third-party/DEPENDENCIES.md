# Third-party notices

Dependency versions are retained in `package-lock.json`, `apps/web/package-lock.json`, `requirements.txt` ; local verification is summarized in `docs/limitations.md`.

- The copied PDF.js browser worker is Apache-2.0 licensed. Its full license is retained in `PDFJS-LICENSE.txt`; keep that file with redistributions.
- Embedded PostgreSQL's JavaScript wrapper is MIT licensed; its package license is retained alongside this file. The Windows binary package's supplied license is also copied here. PostgreSQL and bundled native libraries retain their upstream notices in installed dependency packages.
- Other JavaScript dependency license files remain in their installed npm packages. Mapbox GL JS has its own terms; supply an eligible account and keep required map attribution visible.
- Python packages and their license metadata remain in their installed distributions. The local compatibility environment is an installation aid, not a source distribution or a portable runtime.

Do not redistribute private runtime data or credentials. A future packaged application needs an inventory of all bundled native components and their exact notices, beyond this local source prototype.
