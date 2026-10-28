package com.rpm.prototype;

/** One use of the notch. Pure: it reads inputs and returns data, and never touches views. */
interface NotchModule {
    String id();

    Offer offer(Inputs in);

    /** Runs one of this module's {@link Act.Local} verbs and returns its new local state. */
    default LocalState apply(String verb, String arg, Inputs in) {
        throw new IllegalArgumentException(id() + " has no verb " + verb);
    }
}
