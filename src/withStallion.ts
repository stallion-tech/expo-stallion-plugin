import { ConfigPlugin, withPlugins } from '@expo/config-plugins';
import { withStallionAndroid } from './android';
import { withStallionIOS } from './ios';

export interface StallionPluginProps {
  projectId: string;
  appToken: string;
}

/**
 * Main plugin function that applies Stallion configuration to both Android and iOS
 */
export const withStallion: ConfigPlugin<StallionPluginProps> = (config, props) => {
  // If required props are missing, skip plugin gracefully.
  // This allows commands like `eas env:pull` to work before
  // environment variables have been pulled down.
  if (!props.projectId || !props.appToken) {
    console.warn(
      'expo-stallion-plugin: projectId and appToken are not set — skipping native configuration. ' +
      'This is expected during commands like `eas env:pull`. ' +
      'Make sure these values are set before running a build.'
    );
    return config;
  }

  // Validate prop format (only when values are actually provided)
  if (!props.appToken.startsWith('spb_')) {
    throw new Error('expo-stallion-plugin: appToken must start with "spb_"');
  }

  return withPlugins(config, [
    [withStallionAndroid, props],
    [withStallionIOS, props],
  ]);
};

