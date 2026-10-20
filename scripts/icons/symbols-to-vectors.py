import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen

src, out_dir, names = sys.argv[1], sys.argv[2], sys.argv[3:]
font = instancer.instantiateVariableFont(TTFont(src), {"FILL": 1})
em = font["head"].unitsPerEm
cmap = font.getBestCmap()
ligatures = {}
for lookup in font["GSUB"].table.LookupList.Lookup:
    for table in lookup.SubTable:
        table = getattr(table, "ExtSubTable", table)
        for first, entries in getattr(table, "ligatures", {}).items():
            for lig in entries:
                ligatures[tuple([first] + list(lig.Component))] = lig.LigGlyph
glyphs = font.getGlyphSet()
for name in names:
    glyph = ligatures[tuple(cmap[ord(c)] for c in name)]
    pen = SVGPathPen(glyphs)
    glyphs[glyph].draw(pen)
    with open(f"{out_dir}/sym_{name}.xml", "w") as f:
        f.write(f"""<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="{em}" android:viewportHeight="{em}">
    <group android:scaleY="-1" android:translateY="{em}">
        <path android:fillColor="#FFFFFFFF" android:pathData="{pen.getCommands()}"/>
    </group>
</vector>
""")
