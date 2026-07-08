import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Android home-screen widget (LoveNote): handles add/update/resize events,
// including periodic headless updates while the app is closed.
if (Platform.OS === 'android') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { widgetTaskHandler } = require('./src/widget/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
