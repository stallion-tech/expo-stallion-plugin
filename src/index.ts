import { ConfigPlugin } from '@expo/config-plugins';
import { withStallion } from './withStallion';

/**
 * Expo Config Plugin for react-native-stallion
 * 
 * Automatically configures Stallion as the JS bundle provider for Expo apps.
 * 
 * @example
 * ```json
 * {
 *   "expo": {
 *     "plugins": [
 *       [
 *         "expo-stallion-plugin",
 *         {
 *           "projectId": "66ed03380eb95c9c316256d3",
 *           "appToken": "spb_..."
 *         }
 *       ]
 *     ]
 *   }
 * }
 * ```
 */
const withExpoStallion: ConfigPlugin<{
  projectId: string;
  appToken: string;
}> = (config, props) => {
  return withStallion(config, props);
};

export default withExpoStallion;

