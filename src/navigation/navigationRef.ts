import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';

/**
 * App-level navigation ref so non-screen components (e.g. the global in-app
 * notification banner) can navigate without a screen's navigation prop.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<Name extends keyof RootStackParamList>(
  ...args: undefined extends RootStackParamList[Name]
    ? [screen: Name] | [screen: Name, params: RootStackParamList[Name]]
    : [screen: Name, params: RootStackParamList[Name]]
) {
  if (navigationRef.isReady()) {
    // @ts-expect-error — variadic args match the navigator's overloads at runtime.
    navigationRef.navigate(...args);
  }
}
