import {
  ConfigPlugin,
  withMainApplication,
  withStringsXml,
  AndroidConfig,
} from "@expo/config-plugins";
import { ExpoConfig } from "@expo/config-types";
import { StallionPluginProps } from "./withStallion";

/**
 * Adds Stallion credentials to Android strings.xml
 */
const withStallionCredentials = (
  config: ExpoConfig,
  props: StallionPluginProps
) => {
  return withStringsXml(config, (config) => {
    config.modResults = AndroidConfig.Strings.setStringItem(
      [
        AndroidConfig.Resources.buildResourceItem({
          name: "StallionProjectId",
          value: props.projectId,
        }),
        AndroidConfig.Resources.buildResourceItem({
          name: "StallionAppToken",
          value: props.appToken,
        }),
      ],
      config.modResults
    );
    return config;
  });
};

/**
 * Patches MainApplication to use Stallion as JS bundle provider
 * Supports:
 * - Java MainApplication (RN 0.71-0.81)
 * - Kotlin MainApplication (RN 0.71-0.81)
 * - ReactHost (RN 0.82+)
 */
const withStallionBundleProvider = (
  config: ExpoConfig,
  props: StallionPluginProps
) => {
  return withMainApplication(config, (config) => {
    const mainApplication = config.modResults.contents;

    // Check if already patched
    if (mainApplication.includes("Stallion.getJSBundleFile")) {
      return config;
    }

    // Detect React Native version and host style
    const isReactHost =
      mainApplication.includes("ReactHost") ||
      mainApplication.includes("getDefaultReactHost");
    const isKotlin =
      mainApplication.includes("class MainApplication") &&
      mainApplication.includes("override fun");
    const isJava =
      mainApplication.includes("class MainApplication") &&
      !mainApplication.includes("override fun");

    if (isReactHost) {
      // RN 0.82+ with ReactHost
      config.modResults.contents = patchReactHost(mainApplication);
    } else if (isKotlin) {
      // Kotlin MainApplication (RN 0.71-0.81)
      config.modResults.contents = patchKotlinMainApplication(mainApplication);
    } else if (isJava) {
      // Java MainApplication (RN 0.71-0.81)
      config.modResults.contents = patchJavaMainApplication(mainApplication);
    } else {
      console.warn(
        "expo-stallion-plugin: Could not detect MainApplication style. Please manually configure Stallion bundle provider."
      );
    }

    return config;
  });
};

/**
 * Adds Stallion import to Android file (Java or Kotlin)
 */
function addStallionImport(contents: string, isKotlin: boolean): string {
  // Check if import already exists
  if (contents.includes("import com.stallion.Stallion")) {
    return contents;
  }

  if (isKotlin) {
    // Kotlin import
    const importPattern = /(import\s+[^\n]+\n)/g;
    const imports = contents.match(importPattern);
    if (imports && imports.length > 0) {
      // Add after last import
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = contents.lastIndexOf(lastImport);
      const insertPos = lastImportIndex + lastImport.length;
      return (
        contents.substring(0, insertPos) +
        "import com.stallion.Stallion\n" +
        contents.substring(insertPos)
      );
    } else {
      // Add at the beginning if no imports found
      return "import com.stallion.Stallion\n" + contents;
    }
  } else {
    // Java import
    const importPattern = /(import\s+[^\n]+;\n)/g;
    const imports = contents.match(importPattern);
    if (imports && imports.length > 0) {
      // Add after last import
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = contents.lastIndexOf(lastImport);
      const insertPos = lastImportIndex + lastImport.length;
      return (
        contents.substring(0, insertPos) +
        "import com.stallion.Stallion;\n" +
        contents.substring(insertPos)
      );
    } else {
      // Add at the beginning if no imports found
      return "import com.stallion.Stallion;\n" + contents;
    }
  }
}

/**
 * Patches ReactHost (RN 0.82+) to use Stallion bundle path
 */
function patchReactHost(contents: string): string {
  // Add import first (ReactHost is typically in Kotlin)
  contents = addStallionImport(contents, true);

  // Check if jsBundleFilePath already exists in getDefaultReactHost call
  const hasJsBundlePath = /getDefaultReactHost\s*\([^)]*jsBundleFilePath/.test(
    contents
  );

  if (hasJsBundlePath) {
    // Replace existing jsBundleFilePath value with Stallion call
    // Match: jsBundleFilePath = <anything> or jsBundleFilePath: <anything>
    return contents.replace(
      /(jsBundleFilePath\s*[:=]\s*)([^,\n)]+)/,
      "$1Stallion.getJSBundleFile(applicationContext)"
    );
  } else {
    // Add jsBundleFilePath parameter to getDefaultReactHost call
    // Handle both Kotlin (named parameter) and potential other formats
    const kotlinPattern = /getDefaultReactHost\s*\(/;
    if (kotlinPattern.test(contents)) {
      // For Kotlin, add as named parameter
      return contents.replace(
        kotlinPattern,
        "getDefaultReactHost(\n      jsBundleFilePath = Stallion.getJSBundleFile(applicationContext),"
      );
    } else {
      // Fallback: try to find ReactHost creation pattern
      const reactHostCreation = contents.match(/(ReactHost\s*\([^)]*)/);
      if (reactHostCreation) {
        return contents.replace(
          /(ReactHost\s*\()/,
          "$1jsBundleFilePath = Stallion.getJSBundleFile(applicationContext), "
        );
      }
    }
  }

  return contents;
}

/**
 * Patches Kotlin MainApplication (RN 0.71-0.81)
 */
function patchKotlinMainApplication(contents: string): string {
  // Add import first
  contents = addStallionImport(contents, true);

  // Check if getJSBundleFile already exists
  if (contents.includes("override fun getJSBundleFile")) {
    // Replace existing implementation
    return contents.replace(
      /override\s+fun\s+getJSBundleFile\(\)\s*:\s*String\?[^{]*\{[^}]*\}/,
      `override fun getJSBundleFile(): String? {
    return Stallion.getJSBundleFile(applicationContext)
  }`
    );
  } else {
    // Add new override method before onCreate or at end of class
    const onCreateMatch = contents.match(/override\s+fun\s+onCreate\(/);
    if (onCreateMatch && onCreateMatch.index !== undefined) {
      const insertPos = onCreateMatch.index;
      const beforeOnCreate = contents.substring(0, insertPos);
      const afterOnCreate = contents.substring(insertPos);
      return (
        beforeOnCreate +
        `  override fun getJSBundleFile(): String? {
    return Stallion.getJSBundleFile(applicationContext)
  }

  ` +
        afterOnCreate
      );
    } else {
      // Fallback: add before closing brace of class
      return contents.replace(
        /(\s+)(override\s+fun\s+onCreate|})/,
        `$1override fun getJSBundleFile(): String? {
$1  return Stallion.getJSBundleFile(applicationContext)
$1}

$1$2`
      );
    }
  }
}

/**
 * Patches Java MainApplication (RN 0.71-0.81)
 */
function patchJavaMainApplication(contents: string): string {
  // Add import first
  contents = addStallionImport(contents, false);

  // Check if getJSBundleFile already exists
  if (contents.includes("@Override") && contents.includes("getJSBundleFile")) {
    // Replace existing implementation
    return contents.replace(
      /@Override\s+protected\s+String\s+getJSBundleFile\(\)\s*\{[^}]*\}/,
      `@Override
  protected String getJSBundleFile() {
    return Stallion.getJSBundleFile(getApplicationContext());
  }`
    );
  } else {
    // Add new override method before onCreate or at end of class
    const onCreateMatch = contents.match(
      /@Override\s+protected\s+void\s+onCreate\(/
    );
    if (onCreateMatch && onCreateMatch.index !== undefined) {
      const insertPos = onCreateMatch.index;
      const beforeOnCreate = contents.substring(0, insertPos);
      const afterOnCreate = contents.substring(insertPos);
      return (
        beforeOnCreate +
        `  @Override
  protected String getJSBundleFile() {
    return Stallion.getJSBundleFile(getApplicationContext());
  }

  ` +
        afterOnCreate
      );
    } else {
      // Fallback: add before closing brace of class
      return contents.replace(
        /(\s+)(@Override\s+protected\s+void\s+onCreate|})/,
        `$1@Override
$1protected String getJSBundleFile() {
$1  return Stallion.getJSBundleFile(getApplicationContext());
$1}

$1$2`
      );
    }
  }
}

/**
 * Main Android plugin function
 */
export const withStallionAndroid: ConfigPlugin<StallionPluginProps> = (
  config,
  props
) => {
  config = withStallionCredentials(config, props);
  config = withStallionBundleProvider(config, props);
  return config;
};
