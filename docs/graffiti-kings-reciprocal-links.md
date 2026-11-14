# Graffiti Kings reciprocal links — Nov 2026

This branch adds **contextual external links** from the Crypto Moonboys site to the related, project-maintained `https://graffitikings.com/` archive. It does **not** create links on third-party sites, change wallet or creator licences, add new fictional canon, or claim the GK archive is an independent source of verification.

Affected pages: home, About, the Graffiti Kings creative guide, historical Graffiti Kings About page and 15 topic-specific wiki entries (SER, Charlie, GKniftyHEADS, GraffPUNKS, Crypto Moonboys, radio, WAX, No Ball Games, XRP Kids, Graffiti Queens and Bitcoin Kid).

Link destinations were checked against the merged Graffiti Kings repository's published sitemap at the start of this work. After merge and successful GitHub Pages deployment, review the main pages visually, test navigation on mobile, and verify external HTTP targets. The static link test does not perform external network calls or prove Google indexing.

Verification: `node scripts/check-graffiti-kings-reciprocal-links.mjs` checks 19 source pages, 64 links, canonical host/path, unique targets per page, accessible link labels, safe external-window attributes, and placement within `<main>`. It is also included in the existing **manual-only** Wiki Structure Enforcement workflow. No scheduled or automatically triggered CI jobs are added.

A future reciprocal-link PR for `nbg1618.com`, `graffpunks.live` or other sites needs confirmed, editable website ownership/repository access. Those sites have not been modified here.
