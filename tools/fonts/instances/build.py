"""
Makes the embedded fonts that are not used as published. An instance is a static cut of a
variable font: every axis pinned, renamed so it registers under its own family and PostScript
name. A subset is `pyftsubset` run with the given arguments. The output is byte-for-byte
reproducible with the pinned fontTools (requirements.txt): timestamps are kept from the source and
nothing depends on the clock.

    python -I build.py <spec.json>

The spec is written by `pnpm --filter @kithfield/fonts download` from `src/sources.ts`:

    {"jobs": [{"kind": "instance", "source": "<variable font>", "output": "<static font>",
               "axes": {"wght": 600, ...}, "family": "...", "style": "SemiBold",
               "weight": 600, "postScriptName": "..."},
              {"kind": "subset", "source": "<font>", "output": "<font>",
               "args": ["--unicodes=...", ...]}]}
"""

import json
import sys

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONTTOOLS = "4.60.2"

# Name IDs rewritten for the instance; every other Windows and Mac name is dropped except the
# copyright, version, manufacturer, designer, description, URLs and licence.
KEPT_NAMES = {0, 5, 7, 8, 9, 10, 11, 12, 13, 14}


def set_names(font, family, style, post_script_name):
    table = font["name"]
    table.names = [n for n in table.names if n.nameID in KEPT_NAMES]
    ribbi = style in ("Regular", "Bold")
    legacy_family = family if ribbi else f"{family} {style}"
    legacy_style = style if ribbi else "Regular"
    full = f"{family} {style}"
    version = font["head"].fontRevision
    for name_id, value in (
        (1, legacy_family),
        (2, legacy_style),
        (3, f"{version:.3f};{post_script_name}"),
        (4, full),
        (6, post_script_name),
    ):
        table.setName(value, name_id, 3, 1, 0x409)
    if not ribbi:
        table.setName(family, 16, 3, 1, 0x409)
        table.setName(style, 17, 3, 1, 0x409)


def set_style_bits(font, weight, style):
    os2 = font["OS/2"]
    os2.usWeightClass = weight
    bold = style == "Bold"
    # fsSelection: bit 0 italic, bit 5 bold, bit 6 regular; keep USE_TYPO_METRICS and the rest.
    sel = os2.fsSelection & ~((1 << 0) | (1 << 5) | (1 << 6))
    sel |= (1 << 5) if bold else (1 << 6) if style == "Regular" else 0
    os2.fsSelection = sel
    font["head"].macStyle = 1 if bold else 0


def instance(spec):
    source = TTFont(spec["source"])
    font = instancer.instantiateVariableFont(source, spec["axes"], updateFontNames=False)
    for tag in ("STAT", "DSIG"):
        if tag in font:
            del font[tag]

    set_names(font, spec["family"], spec["style"], spec["postScriptName"])
    set_style_bits(font, spec["weight"], spec["style"])
    font.recalcTimestamp = False
    font.save(spec["output"], reorderTables=True)


def main():
    if fontTools.version != FONTTOOLS:
        sys.exit(
            f"fontTools {fontTools.version}; the fonts are cut with {FONTTOOLS}: "
            "pip install -r tools/fonts/instances/requirements.txt"
        )
    with open(sys.argv[1], encoding="utf-8") as f:
        for job in json.load(f)["jobs"]:
            if job["kind"] == "instance":
                instance(job)
            else:
                subset.main([job["source"], *job["args"], f"--output-file={job['output']}"])
            print(f"  {job['output']}")


if __name__ == "__main__":
    main()
