package com.rpm.prototype;

/** A value tagged with the module that offered it. */
record Owned<T>(String module, T value) {}
