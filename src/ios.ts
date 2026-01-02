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
 * Adds required imports to Swift AppDelegate
 */
function addStallionSwiftImports(contents: string): string {
  // Add react_native_stallion import if missing
  if (!contents.includes("import react_native_stallion")) {
    const importPattern = /(import\s+[^\n]+\n)/g;
    const imports = contents.match(importPattern);
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = contents.lastIndexOf(lastImport);
      const insertPos = lastImportIndex + lastImport.length;
      contents =
        contents.substring(0, insertPos) +
        "import react_native_stallion\n" +
        contents.substring(insertPos);
    } else {
      contents = "import react_native_stallion\n" + contents;
    }
  }

  // Add React import if missing (needed for RCTBundleURLProvider)
  if (!contents.includes("import React")) {
    const importPattern = /(import\s+[^\n]+\n)/g;
    const imports = contents.match(importPattern);
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = contents.lastIndexOf(lastImport);
      const insertPos = lastImportIndex + lastImport.length;
      contents =
        contents.substring(0, insertPos) +
        "import React\n" +
        contents.substring(insertPos);
    } else {
      contents = "import React\n" + contents;
    }
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
    // Add new bundleURL method
    // Try to find a good insertion point (after class declaration, before other methods)
    const classMatch = contents.match(/(class\s+\w+AppDelegate[^{]*\{)/);
    if (classMatch && classMatch.index !== undefined) {
      const insertPos = classMatch.index + classMatch[0].length;
      const before = contents.substring(0, insertPos);
      const after = contents.substring(insertPos);
      return before + "\n  " + targetImplementation + "\n" + after;
    } else {
      // Fallback: add at the beginning of the class body
      return contents.replace(
        /(class\s+\w+AppDelegate[^{]*\{)/,
        `$1
  ${targetImplementation}`
      );
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
        "#import <react_native_stallion/StallionModule.h>\n" +
        contents.substring(insertPos);
    } else {
      contents =
        "#import <react_native_stallion/StallionModule.h>\n" + contents;
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
