package com.rpm.prototype;

/** A rectangle in whole screen pixels, free of android.graphics so the island's geometry runs in plain JUnit. */
final class Box {
    final int left;
    final int top;
    final int right;
    final int bottom;

    Box(int left, int top, int right, int bottom) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
    }

    /** The smallest box holding the float rectangle. */
    static Box around(float left, float top, float right, float bottom) {
        return new Box((int) Math.floor(left), (int) Math.floor(top), (int) Math.ceil(right), (int) Math.ceil(bottom));
    }

    int width() {
        return right - left;
    }

    int height() {
        return bottom - top;
    }

    boolean contains(float x, float y) {
        return x >= left && x < right && y >= top && y < bottom;
    }

    Box union(Box o) {
        return new Box(Math.min(left, o.left), Math.min(top, o.top), Math.max(right, o.right), Math.max(bottom, o.bottom));
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Box)) return false;
        Box b = (Box) o;
        return left == b.left && top == b.top && right == b.right && bottom == b.bottom;
    }

    @Override
    public int hashCode() {
        return ((left * 31 + top) * 31 + right) * 31 + bottom;
    }

    @Override
    public String toString() {
        return "[" + left + "," + top + "][" + right + "," + bottom + "]";
    }
}
