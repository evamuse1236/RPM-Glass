package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The open, alert and receipt islands sit as far in from each side as their top (the pill's top) is below the screen's top, one 36dp corner,
 * a 16dp margin on all four sides, and every inner corner 36 less its inset.
 */
public class IslandShapeTest {
    private static final float D = 450f / 160f;
    private static final NotchAnchor S24 = NotchAnchor.fromCutout(506, 24, 574, 92, 92, D);
    /** A phone whose pill is the plan's 36dp. */
    private static final NotchAnchor TALL = NotchAnchor.fromCutout(500, 0, 580, NotchAnchor.dp(36, D), 0, D);

    private static float dp(float v) {
        return NotchAnchor.dp(v, D);
    }

    @Test
    public void openIslandSitsAsFarInFromEachSideAsItsTopIsBelowTheScreensTop() {
        IslandShape open = IslandShape.island(S24, 1080, 700, D);
        assertEquals("equal outer margins", (float) open.top, open.left, 0f);
        assertEquals(1080f - open.top, open.right, 0f);
        NotchAnchor none = NotchAnchor.fallback(1080, D);
        assertEquals("no cutout: the pill sits 12dp down, so the sides are 12dp", (float) none.pillTop(), IslandShape.island(none, 1080, 700, D).left, 0f);
        NotchAnchor low = NotchAnchor.fromCutout(500, NotchAnchor.dp(30, D), 580, NotchAnchor.dp(60, D), 0, D);
        assertEquals("never more than 16dp", dp(16), IslandShape.island(low, 1080, 700, D).left, 1f);
        assertEquals(S24.pillTop(), open.top, 0f);
        assertEquals(S24.pillTop() + 700f, open.bottom, 0f);
        assertEquals(0f, open.splitR, 0f);
    }

    @Test
    public void everyIslandHasOneThirtySixDpCorner() {
        assertEquals(dp(36), IslandShape.island(S24, 1080, 700, D).radius, 0f);
        assertEquals(dp(36), IslandShape.island(S24, 1080, 300, D).radius, 0f);
        assertEquals(36, NotchGeometry.RADIUS_DP);
    }

    @Test
    public void innerRadiusIsOuterMinusPadding() {
        assertEquals(16, NotchGeometry.PAD_DP);
        assertEquals(20, NotchGeometry.innerRadius(NotchGeometry.PAD_DP));
        assertEquals("the 40dp circle, Stop, Undo and the pills are round at 20dp", NotchGeometry.CIRCLE_DP / 2, NotchGeometry.innerRadius(NotchGeometry.PAD_DP));
        assertEquals(NotchGeometry.CONTROL_DP / 2, NotchGeometry.innerRadius(NotchGeometry.PAD_DP));
        assertEquals("rows are fully round", 22, NotchGeometry.ROW_DP / 2);
        assertEquals(48, NotchGeometry.TOUCH_DP);
    }

    @Test
    public void marginsAreSixteenDpOnAllFourSides() {
        IslandShape open = IslandShape.island(S24, 1080, 700, D);
        NotchGeometry.Band band = NotchGeometry.island(open, D, dp(22));
        assertEquals("ring 16dp from the start", dp(16), band.ringLeft() - open.left, 0.5f);
        assertEquals("ring 16dp below the top", dp(16), band.ringTop() - open.top, 0.5f);
        assertEquals("value 16dp from the end", dp(16), open.right - band.valueRight, 0.5f);
        assertEquals("ring and value share the band's middle line", band.cy, band.valueCy, 0f);
        int[] pad = NotchGeometry.facePadding(D);
        assertEquals("the face's start margin", (int) dp(16), pad[0]);
        assertEquals("the face's end margin", (int) dp(16), pad[2]);
        assertEquals("the space below the last element equals the space above the first", band.ringTop() - open.top, pad[3], 0.5f);
        assertEquals("words start 12dp under the 40dp band", (int) dp(16 + 40 + 12), pad[1]);
    }

    @Test
    public void aFaceTooTallForTheScreenDropsRowsThenShortensItsTitleAndIsNeverCut() throws Exception {
        java.util.List<NotchGeometry.Fit> open = NotchGeometry.fits(true);
        assertEquals(4, open.size());
        int[] rows = {3, 2, 1, 1};
        for (int i = 0; i < rows.length; i++) {
            assertEquals(rows[i], open.get(i).rows);
            assertEquals(i == 3, open.get(i).shortTitle);
        }
        java.util.List<NotchGeometry.Fit> other = NotchGeometry.fits(false);
        assertEquals(2, other.size());
        assertEquals(3, other.get(1).rows);
        assertTrue("alert controls, alerts and receipts keep every row and shorten the title", other.get(1).shortTitle);
        String pill = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/java/com/rpm/prototype/NotchPill.java")),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(pill.contains("NotchGeometry.fits(f.mode == Mode.OPEN)"));
        assertTrue("the island is as tall as its face, so nothing is clipped", pill.contains("Math.max(face.getMeasuredHeight(), h)"));
    }

    @Test
    public void pillMinWidthIs112() {
        assertEquals(112, NotchGeometry.MIN_PILL_WIDTH_DP);
        int keep = S24.holeWidth + NotchAnchor.dp(12, D);
        int side = NotchAnchor.pillSide(10, 10, keep, NotchAnchor.dp(NotchGeometry.MIN_PILL_WIDTH_DP, D));
        IslandShape p = IslandShape.pill(S24, 1080, side, keep, false, D);
        assertEquals(dp(112), p.width(), 2f);
    }

    @Test
    public void thePillsRingIsConcentricWithItsEnds() {
        int keep = TALL.holeWidth + NotchAnchor.dp(12, D);
        IslandShape p = IslandShape.pill(TALL, 1080, 200, keep, false, D);
        assertEquals(dp(36), p.height(), 1f);
        NotchGeometry.Band ring = NotchGeometry.pill(p, D, dp(15));
        assertEquals("28dp ring", dp(28), ring.diameter, 0f);
        float inset = ring.ringLeft() - p.left;
        assertEquals("inset 4dp", dp(4), inset, 1f);
        assertEquals("18 - 4 = 14, the ring's radius", p.radius - inset, ring.diameter / 2f, 1f);
        IslandShape small = IslandShape.pill(S24, 1080, 200, keep, false, D);
        NotchGeometry.Band smallRing = NotchGeometry.pill(small, D, dp(15));
        assertEquals("a short pill shrinks the ring, not the inset", small.radius - (smallRing.ringLeft() - small.left), smallRing.diameter / 2f, 1f);
    }

    @Test
    public void pillStaysCentredOnTheCameraWithTheSplitCircleToItsLeft() {
        int keep = S24.holeWidth + NotchAnchor.dp(12, D);
        IslandShape p = IslandShape.pill(S24, 1080, 200, keep, true, D);
        assertEquals(S24.centerX, (p.left + p.right) / 2f, 1f);
        assertEquals(S24.pillHeight / 2f, p.radius, 0f);
        assertTrue(p.splitCx + p.splitR <= p.left - NotchAnchor.dp(8, D) + 1);
        assertTrue("the split circle takes taps too", p.touch.contains(p.splitCx, p.splitCy));
    }

    @Test
    public void theSplitCircleFoldsIntoTheBandsLeadingCircle() {
        IslandShape open = IslandShape.island(S24, 1080, 700, D);
        NotchGeometry.Band band = NotchGeometry.island(open, D, dp(22));
        assertEquals(band.cx, open.splitCx, 0.5f);
        assertEquals(band.cy, open.splitCy, 0.5f);
    }

    @Test
    public void windowHoldsTheShadowBelowAFloatingIsland() {
        IslandShape open = IslandShape.island(S24, 1080, 700, D);
        Box w = open.window();
        assertTrue(w.bottom >= open.bottom + NotchAnchor.dp(IslandShape.SHADOW_BELOW_DP, D));
        assertTrue(w.left <= open.left - NotchAnchor.dp(IslandShape.SHADOW_SIDE_DP, D));
    }

    @Test
    public void aFloatingIslandHasAOneDpWhiteEightPercentEdgeSoABlackWallpaperCannotSwallowIt() throws Exception {
        assertEquals(0x14FFFFFF, NotchInk.HAIRLINE);
        assertEquals("the pill sits in the status bar like the camera: no edge", 0, NotchInk.hairline(0f) >>> 24);
        assertEquals(0x14FFFFFF, NotchInk.hairline(1f));
        assertEquals(10, NotchInk.hairline(0.5f) >>> 24);
        String view = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/java/com/rpm/prototype/IslandView.java")),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue("the edge is drawn over the faces and the band", view.contains("band.draw(canvas, -loc[0], -loc[1]);\n        drawEdge(canvas, x, y, w, h, r);"));
        assertTrue(view.contains("int color = NotchInk.hairline(now.shadow);"));
    }

    @Test
    public void facesShrinkWithTheIslandSoTheyAlwaysFitInsideIt() {
        int keep = S24.holeWidth + NotchAnchor.dp(12, D);
        IslandShape pill = IslandShape.pill(S24, 1080, 200, keep, false, D);
        IslandShape open = IslandShape.island(S24, 1080, 700, D);
        float w = open.width(), h = open.height();
        assertEquals("a settled face is drawn at its own size", 1f, IslandShape.faceScale(w, h, w, h), 0f);
        for (float t = 0f; t <= 1f; t += 0.05f) {
            for (IslandShape now : new IslandShape[]{IslandShape.morph(pill, open, t), IslandShape.morph(open, pill, t)}) {
                float s = IslandShape.faceScale(w, h, now.width(), now.height());
                assertTrue("t=" + t + " width", w * s <= now.width() + 0.01f);
                assertTrue("t=" + t + " height", h * s <= now.height() + 0.01f);
            }
        }
        assertEquals("never drawn larger than it is", 1f, IslandShape.faceScale(pill.width(), pill.height(), w, h), 0f);
        assertEquals(1f, IslandShape.faceScale(0f, 0f, w, h), 0f);
    }

    @Test
    public void openingWidensFirstAndClosingNarrowsLastSoTheEdgePassesTheClockQuickly() {
        int keep = S24.holeWidth + NotchAnchor.dp(12, D);
        IslandShape pill = IslandShape.pill(S24, 1080, 200, keep, false, D);
        IslandShape open = IslandShape.island(S24, 1080, 700, D);
        IslandShape opening = IslandShape.morph(pill, open, IslandShape.WIDTH_SHARE);
        assertEquals("opening: full width by the middle", open.left, opening.left, 0.01f);
        assertTrue("while it is still growing down", opening.bottom < open.bottom);
        IslandShape closing = IslandShape.morph(open, pill, 1f - IslandShape.WIDTH_SHARE);
        assertEquals("closing: still full width at the middle", open.left, closing.left, 0.01f);
        assertEquals("once it is pill height", pill.bottom, closing.bottom, 0.01f);
        assertEquals(pill.left, IslandShape.morph(open, pill, 1f).left, 0.01f);
        IslandShape receipt = IslandShape.island(S24, 1080, 300, D);
        assertEquals("same width: both move together", IslandShape.lerp(open, receipt, 0.3f).bottom, IslandShape.morph(open, receipt, 0.3f).bottom, 0.01f);
    }

    @Test
    public void halfwayMorphSitsBetweenBothShapes() {
        int keep = S24.holeWidth + NotchAnchor.dp(12, D);
        IslandShape p = IslandShape.pill(S24, 1080, 200, keep, false, D);
        IslandShape open = IslandShape.island(S24, 1080, 700, D);
        IslandShape mid = IslandShape.lerp(p, open, 0.5f);
        assertEquals((p.left + open.left) / 2f, mid.left, 0.01f);
        assertEquals((p.bottom + open.bottom) / 2f, mid.bottom, 0.01f);
        assertEquals(open.touch, mid.touch);
        Box w = p.window().union(open.window());
        assertTrue(w.left <= mid.window().left && w.right >= mid.window().right && w.bottom >= mid.window().bottom);
    }
}
