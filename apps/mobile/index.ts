import { Platform } from 'react-native';

import 'expo-router/entry';

import { registerWidgets } from './src/features/android/widgets/task-handler';

// Android's home-screen widgets draw in a background task that may start without the app.
if (Platform.OS === 'android') registerWidgets();
