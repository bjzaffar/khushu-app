import * as SecureStore from 'expo-secure-store';

const AUTH_RETURN_ROUTE_KEY = 'auth_return_route';

export type AuthReturnRoute = 'paywall';

export async function setPendingAuthReturn(route: AuthReturnRoute): Promise<void> {
  await SecureStore.setItemAsync(AUTH_RETURN_ROUTE_KEY, route);
}

export async function clearPendingAuthReturn(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_RETURN_ROUTE_KEY);
}

export async function consumePendingAuthReturn(): Promise<AuthReturnRoute | null> {
  const route = await SecureStore.getItemAsync(AUTH_RETURN_ROUTE_KEY);
  await SecureStore.deleteItemAsync(AUTH_RETURN_ROUTE_KEY);
  return route === 'paywall' ? route : null;
}
