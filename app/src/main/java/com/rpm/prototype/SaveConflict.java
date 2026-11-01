package com.rpm.prototype;

/** Another writer saved first. The page reloads and retries, so this is an expected outcome, not an app error. */
final class SaveConflict extends java.io.IOException {
    static final String MESSAGE="Saved context changed. Reopen RPM before retrying.";
    SaveConflict(){super(MESSAGE);}
}
