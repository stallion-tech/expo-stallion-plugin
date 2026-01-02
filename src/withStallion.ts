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
  // Validate required props
  if (!props.projectId) {
    throw new Error('expo-stallion-plugin: projectId is required');
  }
  if (!props.appToken) {
    throw new Error('expo-stallion-plugin: appToken is required');
  }
  if (!props.appToken.startsWith('spb_')) {
    throw new Error('expo-stallion-plugin: appToken must start with "spb_"');
  }

  return withPlugins(config, [
    [withStallionAndroid, props],
    [withStallionIOS, props],
  ]);
};

