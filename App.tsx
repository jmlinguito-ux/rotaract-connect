import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import './src/services/push';
import { ThemeProvider } from './src/context/ThemeContext';
import { PreferencesProvider } from './src/context/PreferencesContext';
import { ToastProvider } from './src/context/ToastContext';
import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import RootNavigator from './src/navigation/RootNavigator';
import ActiveSosBanner from './src/components/ActiveSosBanner';

// Hold the native splash until AuthContext has resolved the stored session.
// Hiding it here (the previous behaviour) exposed the navigator while `user` was
// still null, so a signed-in user saw the login screen flash before the app.
// RootNavigator hides it once auth settles; AuthContext's 4s safety timer bounds
// that, so a slow or offline start can never leave the splash stuck.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <PreferencesProvider>
              <AuthProvider>
                <DataProvider>
                  <ActiveSosBanner />
                  <RootNavigator />
                </DataProvider>
              </AuthProvider>
            </PreferencesProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

