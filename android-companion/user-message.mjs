// The one place an error becomes words on screen. Messages written for Dara (the native bridge's, or the app's own
// `throw new Error('…')`) pass through. A script fault such as "Cannot read properties of null (reading
// 'querySelectorAll')" is a bug, not a message: it goes to the console (logcat) and the screen gets a calm line.
const FAULTS = [TypeError, ReferenceError, SyntaxError, RangeError, EvalError, URIError];

export const FAULT_TEXT = 'Something went wrong on this screen. Your saved plans are safe.';

export function userMessage(error, fallback = FAULT_TEXT) {
  if (error == null) return fallback;
  if (FAULTS.some(type => error instanceof type)) {
    console.error(error);
    return fallback;
  }
  const text = typeof error === 'string' ? error : error.message;
  return typeof text === 'string' && text.trim() ? text : fallback;
}
