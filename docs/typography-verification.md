# Typography verification

Status: VERIFIED IN PRODUCTION. The approved centralized 1.25 type scale is preserved. No CSS zoom, transform-based text scaling or browser zoom is used.

Before values use the preserved pre-change CSS reference; after values use deployed styles. Thirty computed before/after samples across 1440, 1280, 768, 390, 360 and 320 pixel viewports measured exactly 1.25×. This is a representative computed sample, not a claim that every text node was measured. The earlier application-wide source audit and 156 route/viewport checks cover the public site, portals, forms and tables. Later specialist and production workflow checks supplement that evidence.

| Width | Selector | Before px | After px | Change |
|---|---|---|---|---|
| 1440 | `body` | 15 | 18.75 | +25% |
| 1440 | `h1` | 68.4 | 85.5 | +25% |
| 1440 | `.eyebrow` | 10 | 12.5 | +25% |
| 1440 | `.button` | 11 | 13.75 | +25% |
| 1440 | `.public-footer p` | 11 | 13.75 | +25% |
| 1280 | `body` | 15 | 18.75 | +25% |
| 1280 | `h1` | 60.8 | 76 | +25% |
| 1280 | `.eyebrow` | 10 | 12.5 | +25% |
| 1280 | `.button` | 11 | 13.75 | +25% |
| 1280 | `.public-footer p` | 11 | 13.75 | +25% |
| 768 | `body` | 15 | 18.75 | +25% |
| 768 | `h1` | 44 | 55 | +25% |
| 768 | `.eyebrow` | 10 | 12.5 | +25% |
| 768 | `.button` | 11 | 13.75 | +25% |
| 768 | `.public-footer p` | 11 | 13.75 | +25% |
| 390 | `body` | 15 | 18.75 | +25% |
| 390 | `h1` | 43 | 53.75 | +25% |
| 390 | `.eyebrow` | 8 | 10 | +25% |
| 390 | `.button` | 10 | 12.5 | +25% |
| 390 | `.public-footer p` | 11 | 13.75 | +25% |
| 360 | `body` | 15 | 18.75 | +25% |
| 360 | `h1` | 40 | 50 | +25% |
| 360 | `.eyebrow` | 8 | 10 | +25% |
| 360 | `.button` | 10 | 12.5 | +25% |
| 360 | `.public-footer p` | 11 | 13.75 | +25% |
| 320 | `body` | 15 | 18.75 | +25% |
| 320 | `h1` | 40 | 50 | +25% |
| 320 | `.eyebrow` | 8 | 10 | +25% |
| 320 | `.button` | 10 | 12.5 | +25% |
| 320 | `.public-footer p` | 11 | 13.75 | +25% |

No additional font-size exception was introduced in this execution. Responsive fixes change wrapping, layout and visibility instead of shrinking text. Visual review caught a mobile consent flex-layout issue and a closed-drawer transition/focus issue missed by width-only checks; both were corrected and tested at six widths. Reduced-motion handling remains present.

Private owner evidence is in `.local/launch/typography/`: before/after PNGs at all six widths, production-results.json, application-results.json and specialist captures. Current portfolio and customer production screenshots are in `.local/launch/portfolio-production/` and `.local/launch/customer-production-browser/`. New corrected settings evidence is in `.local/launch/mobile-feedback-browser/`. These files are intentionally not committed with private workspace artifacts.
