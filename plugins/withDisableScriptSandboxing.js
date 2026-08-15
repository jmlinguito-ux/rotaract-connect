const { withXcodeProject } = require('expo/config-plugins');

/**
 * Sets ENABLE_USER_SCRIPT_SANDBOXING = NO on every build configuration of the
 * iOS app project.
 *
 * Expo's dev-client writes an `ip.txt` file into the app bundle during a build
 * phase so the on-device app knows which Metro server to reach. With Xcode's
 * User Script Sandboxing enabled (the template default), that write is denied:
 *   Sandbox: bash(...) deny(1) file-write-create .../rotaractconnect.app/ip.txt
 * Disabling the script sandbox lets the build phase run. It only affects
 * build-time scripts, not app runtime security. Applied as a config plugin so
 * the setting survives `expo prebuild --clean`, which would otherwise reset it.
 */
module.exports = function withDisableScriptSandboxing(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      if (entry && typeof entry === 'object' && entry.buildSettings) {
        entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }
    return cfg;
  });
};
