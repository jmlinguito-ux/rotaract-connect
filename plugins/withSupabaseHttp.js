const { withInfoPlist } = require('expo/config-plugins');

/**
 * Parses the hostname out of EXPO_PUBLIC_SUPABASE_URL, if present.
 * Only returns a host when the backend is served over plain HTTP, since HTTPS
 * needs no ATS exception.
 * @returns {string | null}
 */
function getSupabaseHttpHost() {
  const raw = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' ? url.hostname : null;
  } catch {
    return null;
  }
}

/**
 * Allows cleartext (http://) requests to the Supabase host on iOS.
 *
 * The dev Supabase backend is reachable at an `http://...sslip.io` address (see
 * .env), but iOS App Transport Security blocks non-HTTPS connections by default
 * (`NSAllowsArbitraryLoads = false` in the generated Info.plist). Every network
 * call to it — including login — then fails with:
 *
 *   fetch failed: The resource could not be loaded because the App Transport
 *   Security policy requires the use of a secure connection.
 *
 * Instead of disabling ATS app-wide, this plugin registers a targeted
 * `NSExceptionDomains` entry for just the Supabase host so the app can talk to
 * it over plain HTTP while the rest of the app stays behind ATS.
 *
 * The host is read from `.env` at prebuild time, so if the sslip.io address/IP
 * changes, re-running `expo prebuild` keeps the exception in sync. HTTPS-only
 * setups are untouched (no exception is added).
 */
module.exports = function withSupabaseHttp(config) {
  return withInfoPlist(config, (cfg) => {
    const host = getSupabaseHttpHost();
    if (!host) return cfg;

    const plist = cfg.modResults;
    const ats = plist.NSAppTransportSecurity ?? {};
    ats.NSAllowsArbitraryLoads = ats.NSAllowsArbitraryLoads ?? false;
    ats.NSAllowsLocalNetworking = ats.NSAllowsLocalNetworking ?? true;
    ats.NSExceptionDomains = ats.NSExceptionDomains ?? {};
    ats.NSExceptionDomains[host] = {
      NSExceptionAllowsInsecureHTTPLoads: true,
      NSIncludesSubdomains: true,
    };
    plist.NSAppTransportSecurity = ats;
    return cfg;
  });
};
