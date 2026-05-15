import {
  ConfigPlugin,
  withAppDelegate,
  withInfoPlist,
} from "@expo/config-plugins";
import { ExpoConfig } from "@expo/config-types";
import { StallionPluginProps } from "./withStallion";

/**
 * Adds Stallion credentials to iOS Info.plist
 */
const withStallionCredentials = (
  config: ExpoConfig,
  props: StallionPluginProps
) => {
  return withInfoPlist(config, (config) => {
    config.modResults.StallionProjectId = props.projectId;
    config.modResults.StallionAppToken = props.appToken;
    if (props.publicSigningKey) {
      config.modResults.StallionPublicSigningKey = props.publicSigningKey;
    }
    return config;
  });
};

/**
 * Patches AppDelegate to use Stallion bundle URL
 * Supports both Objective-C and Swift AppDelegates
 */
const withStallionBundleProvider = (
  config: ExpoConfig,
  props: StallionPluginProps
) => {
  return withAppDelegate(config, (config) => {
    const appDelegate = config.modResults.contents;

    // Check if already patched with DEBUG/RELEASE pattern
    if (
      (appDelegate.includes("#if DEBUG") ||
        appDelegate.includes("#ifdef DEBUG")) &&
      appDelegate.includes(".expo/.virtual-metro-entry") &&
      (appDelegate.includes("StallionModule.getBundleURL") ||
        appDelegate.includes("[StallionModule getBundleURL]"))
    ) {
      return config;
    }

    // Detect Swift vs Objective-C
    // Swift indicators: import statements, @objc, func without @implementation
    // Objective-C indicators: @implementation, @interface, #import
    const isSwift =
      (appDelegate.includes("import ") && !appDelegate.includes("#import")) ||
      (appDelegate.includes("@objc") && appDelegate.includes("func")) ||
      (appDelegate.includes("func ") &&
        !appDelegate.includes("@implementation") &&
        !appDelegate.includes("#import"));

    const isObjC =
      appDelegate.includes("@implementation") ||
      appDelegate.includes("#import") ||
      (!isSwift && appDelegate.includes("@interface"));

    if (isSwift) {
      config.modResults.contents = patchSwiftAppDelegate(appDelegate);
    } else if (isObjC) {
      config.modResults.contents = patchObjCAppDelegate(appDelegate);
    } else {
      // Fallback: try Swift first, then Obj-C
      console.warn(
        "expo-stallion-plugin: Could not definitively detect AppDelegate language. Attempting Swift patching."
      );
      const swiftResult = patchSwiftAppDelegate(appDelegate);
      if (swiftResult !== appDelegate) {
        config.modResults.contents = swiftResult;
      } else {
        config.modResults.contents = patchObjCAppDelegate(appDelegate);
      }
    }

    return config;
  });
};

/**
 * Finds a safe position to insert a new top-level import in a Swift file.
 *
 * Returns the offset immediately after the last top-level import that is
 * NOT inside an `#if`/`#endif` conditional block and NOT inside an
 * `// @generated begin ... // @generated end` block. Scanning stops at the
 * first top-level `@main` / class / struct / enum / protocol / extension
 * declaration so we never insert below it (which would break `@main`).
 *
 * Falls back to position 0 if no safe top-level import is found.
 */
function findSwiftImportInsertPosition(contents: string): number {
  const lines = contents.split("\n");
  const importLine =
    /^((@\w+(\([^)]*\))?|public|private|internal|fileprivate|open)\s+)*import\s+\S/;
  const stopLine =
    /^(@main\b|class\s|struct\s|enum\s|protocol\s|extension\s|actor\s)/;

  let conditionalDepth = 0;
  let inGenerated = false;
  let lastSafeInsertPos = -1;
  let pos = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isLast = i === lines.length - 1;
    const afterLinePos = pos + line.length + (isLast ? 0 : 1);

    if (trimmed.startsWith("// @generated begin")) {
      inGenerated = true;
    } else if (trimmed.startsWith("// @generated end")) {
      inGenerated = false;
    } else if (/^#if\b/.test(trimmed)) {
      conditionalDepth++;
    } else if (/^#endif\b/.test(trimmed)) {
      conditionalDepth = Math.max(0, conditionalDepth - 1);
    } else {
      const insideBlock = inGenerated || conditionalDepth > 0;
      if (!insideBlock && stopLine.test(trimmed)) {
        break;
      }
      if (!insideBlock && importLine.test(trimmed)) {
        lastSafeInsertPos = afterLinePos;
      }
    }

    pos = afterLinePos;
  }

  return lastSafeInsertPos >= 0 ? lastSafeInsertPos : 0;
}

/**
 * Adds required imports to Swift AppDelegate
 */
function addStallionSwiftImports(contents: string): string {
  if (!contents.includes("import react_native_stallion")) {
    const insertPos = findSwiftImportInsertPosition(contents);
    contents =
      contents.substring(0, insertPos) +
      "import react_native_stallion\n" +
      contents.substring(insertPos);
  }

  // React is needed for RCTBundleURLProvider in the bundleURL override
  if (!contents.includes("import React")) {
    const insertPos = findSwiftImportInsertPosition(contents);
    contents =
      contents.substring(0, insertPos) +
      "import React\n" +
      contents.substring(insertPos);
  }

  return contents;
}

/**
 * Patches Swift AppDelegate to use Stallion bundle URL with Expo dev runtime support
 */
function patchSwiftAppDelegate(contents: string): string {
  // Add required imports first
  contents = addStallionSwiftImports(contents);

  // Look for existing bundleURL method
  const bundleURLPattern = /func\s+bundleURL\(\)\s*->\s*URL\?/;

  // Target implementation with DEBUG/RELEASE
  const targetImplementation = `override func bundleURL() -> URL? {
    #if DEBUG
      return RCTBundleURLProvider.sharedSettings()
        .jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
    #else
      return StallionModule.getBundleURL()
    #endif
  }`;

  if (bundleURLPattern.test(contents)) {
    // Replace existing bundleURL implementation
    // Match the entire method from declaration to closing brace
    // This pattern matches: optional "override", "func bundleURL() -> URL?", opening brace,
    // any content (including newlines), and closing brace
    const methodPattern =
      /(override\s+)?func\s+bundleURL\(\)\s*->\s*URL\?\s*\{[\s\S]*?\n\s*\}/;

    if (methodPattern.test(contents)) {
      return contents.replace(methodPattern, targetImplementation);
    }
  } else {
    // Add new bundleURL method right after the class opening brace.
    // \w* (not \w+) so SDK 55's bare `class AppDelegate` is matched in
    // addition to prefixed names like `RNAppDelegate` or `FooAppDelegate`.
    const classPattern = /(class\s+\w*AppDelegate\b[^{]*\{)/;
    const classMatch = contents.match(classPattern);
    if (classMatch && classMatch.index !== undefined) {
      const insertPos = classMatch.index + classMatch[0].length;
      const before = contents.substring(0, insertPos);
      const after = contents.substring(insertPos);
      return before + "\n  " + targetImplementation + "\n" + after;
    }
  }

  return contents;
}

/**
 * Adds required imports to Objective-C AppDelegate
 */
function addStallionObjCImports(contents: string): string {
  // Add react_native_stallion import if missing
  if (
    !contents.includes("#import <react_native_stallion/StallionModule.h>") &&
    !contents.includes('#import "StallionModule.h"')
  ) {
    const importPattern = /(#import\s+[^\n]+\n)/g;
    const imports = contents.match(importPattern);
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = contents.lastIndexOf(lastImport);
      const insertPos = lastImportIndex + lastImport.length;
      contents =
        contents.substring(0, insertPos) +
        '#import "StallionModule.h"\n' +
        contents.substring(insertPos);
    } else {
      contents = '#import "StallionModule.h"\n' + contents;
    }
  }

  // Add RCTBundleURLProvider import if missing (needed for Expo dev runtime)
  if (
    !contents.includes("#import <React/RCTBundleURLProvider.h>") &&
    !contents.includes('#import "RCTBundleURLProvider.h"')
  ) {
    const importPattern = /(#import\s+[^\n]+\n)/g;
    const imports = contents.match(importPattern);
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = contents.lastIndexOf(lastImport);
      const insertPos = lastImportIndex + lastImport.length;
      contents =
        contents.substring(0, insertPos) +
        "#import <React/RCTBundleURLProvider.h>\n" +
        contents.substring(insertPos);
    } else {
      contents = "#import <React/RCTBundleURLProvider.h>\n" + contents;
    }
  }

  return contents;
}

/**
 * Patches Objective-C AppDelegate to use Stallion bundle URL with Expo dev runtime support
 */
function patchObjCAppDelegate(contents: string): string {
  // Add required imports first
  contents = addStallionObjCImports(contents);

  // Look for existing bundleURL method
  const bundleURLPattern = /-?\s*\(NSURL\s*\*\s*\)\s*bundleURL/;

  // Target implementation with DEBUG/RELEASE
  const targetImplementation = `- (NSURL *)bundleURL {
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings]
    jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [StallionModule getBundleURL];
#endif
}`;

  if (bundleURLPattern.test(contents)) {
    // Replace existing bundleURL implementation
    // Match the entire method from declaration to closing brace
    // This pattern matches: "- (NSURL *)bundleURL", opening brace,
    // any content (including newlines), and closing brace
    const methodPattern = /-\s*\(NSURL\s*\*\s*\)\s*bundleURL\s*\{[\s\S]*?\n\}/;

    if (methodPattern.test(contents)) {
      return contents.replace(methodPattern, targetImplementation);
    }
  } else {
    // Add new bundleURL method
    // Try to find a good insertion point (after @implementation, before @end)
    const implementationMatch = contents.match(
      /(@implementation\s+\w+AppDelegate)/
    );
    if (implementationMatch && implementationMatch.index !== undefined) {
      const insertPos =
        implementationMatch.index + implementationMatch[0].length;
      const before = contents.substring(0, insertPos);
      const after = contents.substring(insertPos);
      return before + "\n\n" + targetImplementation + "\n" + after;
    } else {
      // Fallback: add before @end
      return contents.replace(/(@end)/, targetImplementation + "\n\n$1");
    }
  }

  return contents;
}

/**
 * Main iOS plugin function
 */
export const withStallionIOS: ConfigPlugin<StallionPluginProps> = (
  config,
  props
) => {
  config = withStallionCredentials(config, props);
  config = withStallionBundleProvider(config, props);
  return config;
};
