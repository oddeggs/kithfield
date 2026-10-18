#!/bin/sh
# Rebuilds the site's WOFF2 subsets from the theme's fonts. Needs fontTools with brotli
# (`pip install fonttools brotli`). See public/fonts/README.txt.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
src="$here/../../packages/theme/fonts"
out="$here/public/fonts"
latin='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD'
vietnamese='U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB'
subset() {
  pyftsubset "$src/$1.ttf" --unicodes="$2" --flavor=woff2 --layout-features='*' \
    --output-file="$out/$3.woff2"
}
subset YoungSerif-Regular "$latin" young-serif-latin
subset Gaegu-Bold "$latin" gaegu-bold-latin
subset PatrickHand-Regular "$latin" patrick-hand-latin
subset PatrickHand-Regular "$vietnamese" patrick-hand-vietnamese
subset Lora-Regular "$latin" lora-latin
subset Lora-Regular "$vietnamese" lora-vietnamese
