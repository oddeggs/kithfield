Young Serif (copyright 2023 The Young Serif Project Authors), Gaegu (copyright 2018 The Gaegu Project Authors),
Patrick Hand (copyright 2010-2012 Patrick Wagesreiter) and Lora (copyright 2011 The Lora Project Authors),
all under the SIL Open Font License, Version 1.1 (https://openfontlicense.org; the licence texts are
in packages/theme/fonts, and Lora's in apps/web/fonts).

These are WOFF2 subsets of the app's own font files in packages/theme/fonts, and of the site's own
Lora in apps/web/fonts (Latin, and Vietnamese for the two faces that have it), made with fontTools
so no page asks another company for its type:

  pyftsubset packages/theme/fonts/<Face>.ttf --unicodes=<range> --flavor=woff2 \
    --layout-features='*' --output-file=apps/web/public/fonts/<face>-<subset>.woff2

with the ranges in apps/web/src/styles/fonts.css (`scripts/subset-fonts.sh` runs all six). Renaming
a file is how a change reaches visitors: `/fonts/*` is cached for a year (`_headers`).
