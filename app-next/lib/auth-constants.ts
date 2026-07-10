// Marker cookie set by the login form when "Remember this device" is checked.
// Short-lived on purpose — it only needs to survive from form submit to the
// user clicking the magic link, which happens in the same browser.
export const REMEMBER_DEVICE_COOKIE = 'lbm_remember_device';

// Browsers hard-cap Set-Cookie Max-Age at 400 days, so that's the practical
// ceiling for a session that should feel like it never expires on a device.
export const REMEMBER_DEVICE_SECONDS = 60 * 60 * 24 * 400;
