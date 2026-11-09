/**
 * Host half of the work-chat-switch bundle.
 *
 * The switch is entirely a Client concern: it measures the sidebar's shipped
 * New Session button, hides it, and draws the Work / Chat pair in its place.
 * Session creation and model selection go through the Client's own Remote
 * namespaces, so this half only makes the bundle a loadable row.
 */
export function apply() {}
