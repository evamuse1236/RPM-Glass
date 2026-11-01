package com.rpm.prototype;

/** The phone has no connection. The page shows the message; nothing in the app is broken. */
final class Offline extends IllegalStateException {
    Offline(String message){super(message);}
}
