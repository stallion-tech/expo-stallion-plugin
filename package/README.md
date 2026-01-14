# expo-stallion-plugin

Seamlessly integrate over-the-air (OTA) updates into your Expo apps with [Stallion](https://stalliontech.io/). This config plugin automatically sets up Stallion as your JavaScript bundle provider, so you can push updates to your users without going through the app stores.

Perfect for teams using **Expo EAS Build** who want a reliable OTA update solution that works alongside their existing workflow. No manual native code changes required—just install, configure, and start shipping updates.

## Why Use OTA Updates with Expo?

If you're building with Expo and EAS, you know the pain of waiting for app store reviews just to fix a critical bug or push a small feature. Over-the-air updates let you:

- **Ship fixes instantly** - Push bug fixes and patches directly to users
- **A/B test features** - Roll out features gradually to specific user segments
- **Reduce app store friction** - Update your JavaScript bundle without resubmitting
- **Work with EAS Build** - Use alongside Expo's build service seamlessly

Stallion provides a production-ready OTA solution that integrates perfectly with Expo's managed and bare workflows.

## Quick Start

Install the plugin and the Stallion SDK:

```bash
npm install expo-stallion-plugin react-native-stallion
```

Then add it to your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-stallion-plugin",
        {
          "projectId": "your-project-id",
          "appToken": "spb_your-app-token"
        }
      ]
    ]
  }
}
```

Get your credentials from your [Stallion console](https://console.stalliontech.io/). The `appToken` should start with `spb_`.

## How It Works with Expo EAS

This plugin works seamlessly with **Expo Application Services (EAS)** and the Expo prebuild system. Here's what happens:

1. **During prebuild** - The plugin automatically patches your native Android and iOS projects
2. **With EAS Build** - Your builds include Stallion configuration automatically
3. **In production** - Your app checks Stallion for OTA updates on launch

The plugin handles all the native integration steps that would normally require manual code changes. It detects your React Native version, project language (Java/Kotlin, Objective-C/Swift), and applies the correct patches.

### What Gets Configured

**Android:**

- Injects Stallion as the JS bundle provider in your MainApplication
- Adds your credentials to `strings.xml`
- Supports React Native 0.71 through 0.82+ (including the new ReactHost architecture)

**iOS:**

- Configures AppDelegate to use Stallion's bundle URL
- Adds credentials to `Info.plist`
- Works with both Objective-C and Swift AppDelegates

## Installation & Setup

### Step 1: Install Dependencies

```bash
npm install expo-stallion-plugin react-native-stallion
# or
yarn add expo-stallion-plugin react-native-stallion
```

### Step 2: Configure the Plugin

Add the plugin configuration to your Expo config file. You can use either `app.json` or `app.config.js`:

**app.json:**

```json
{
  "expo": {
    "plugins": [
      [
        "expo-stallion-plugin",
        {
          "projectId": "66ed03380eb95c9c316256d3",
          "appToken": "spb_abc123..."
        }
      ]
    ]
  }
}
```

**app.config.js:**

```javascript
export default {
  expo: {
    plugins: [
      [
        "expo-stallion-plugin",
        {
          projectId: "66ed03380eb95c9c316256d3",
          appToken: "spb_abc123...",
        },
      ],
    ],
  },
};
```

### Step 3: Prebuild Your Project

If you're using the managed workflow or EAS Build, run prebuild to generate native projects:

```bash
npx expo prebuild
```

This generates the Android and iOS folders with Stallion already configured.

### Step 4: Build with EAS

Build your app using EAS Build:

```bash
eas build --platform android
eas build --platform ios
```

Or build locally:

```bash
npx expo run:android
npx expo run:ios
```

That's it! Your app is now configured to receive OTA updates through Stallion.

## Using with Expo EAS Build

This plugin is designed to work perfectly with **Expo EAS Build**. Here's the typical workflow:

1. **Configure the plugin** in your `app.json` (as shown above)
2. **Run EAS Build** - The plugin runs during the build process
3. **Deploy updates** - Use [Stallion's console](https://console.stalliontech.io/) or API to push OTA updates
4. **Users get updates** - Your app automatically fetches and applies updates

The plugin is idempotent, meaning it's safe to run multiple times. EAS Build will apply the configuration automatically on each build.

## Requirements

- **Expo SDK 47+** - Works with modern Expo versions
- **React Native 0.71+** - Supports recent RN versions including 0.82+
- **EAS Build compatible** - Works with both managed and bare workflows

The plugin automatically detects your React Native version and applies the correct native code patches. No need to worry about compatibility.

## Features

✅ **Zero Configuration** - No manual native code changes needed  
✅ **EAS Build Ready** - Works seamlessly with Expo Application Services  
✅ **OTA Updates** - Enable over-the-air updates for your Expo app  
✅ **Multi-Platform** - Android and iOS support out of the box  
✅ **Version Detection** - Automatically adapts to your RN version  
✅ **Language Support** - Works with Java, Kotlin, Objective-C, and Swift  
✅ **Idempotent** - Safe to run multiple times without issues  
✅ **Production Ready** - Battle-tested for enterprise apps

## How OTA Updates Work

Once configured, your Expo app will:

1. **Check for updates** on app launch (configurable)
2. **Download new bundles** from Stallion's CDN
3. **Apply updates** seamlessly in the background
4. **Rollback automatically** if an update fails

You control when and how updates are applied through Stallion's SDK and dashboard. Perfect for gradual rollouts, A/B testing, and emergency hotfixes.

## Troubleshooting

### Plugin not applying changes

Make sure you run `npx expo prebuild` after adding the plugin configuration. The plugin only runs during the prebuild phase.

### Build errors with EAS

If you see build errors, ensure `react-native-stallion` is installed:

```bash
npm install react-native-stallion
```

The plugin relies on React Native's autolinking to include the native module.

### Credentials not working

Double-check your `projectId` and `appToken` in the plugin configuration. The `appToken` must start with `spb_`. You can find these in your [Stallion console](https://console.stalliontech.io/).

### Updates not appearing

Make sure you've:

1. Built and deployed your app with the plugin configured
2. Published an update through [Stallion's console](https://console.stalliontech.io/) or API
3. Configured the Stallion SDK in your JavaScript code to check for updates

## Integration with Expo Workflows

This plugin works with all Expo workflows:

- **Managed Workflow** - Use with `expo prebuild` and EAS Build
- **Bare Workflow** - Works with existing native projects
- **EAS Build** - Fully compatible with Expo's build service
- **Local Development** - Test updates in development builds

## Learn More

- [Stallion](https://stalliontech.io/) - Main website
- [Stallion Documentation](https://learn.stalliontech.io/)
- [Stallion Console](https://console.stalliontech.io/)
- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [React Native Stallion](https://github.com/stallion-tech/react-native-stallion)

## License

MIT

## Contributing

Found a bug or have a feature request? We'd love your help! Please open an issue or submit a pull request.
