import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { z } from 'zod';

import type { ApiClient } from '../../data';

/** Someone closed the sheet: not a failure, nothing to say. */
export class SheetCancelled extends Error {
  constructor() {
    super('The sign-in sheet was closed');
    this.name = 'SheetCancelled';
  }
}

/** What a sheet answers: the identity token, and a first name to suggest when it gave one. */
export interface SheetAnswer {
  readonly token: string;
  readonly givenName: string | null;
  /**
   * Apple's one-time authorization code, handed to the server after signing in so it can revoke
   * the person's Apple tokens when they delete their account (`handOverAppleCode`).
   */
  readonly appleCode?: string;
}

/** The answer to `POST /v1/me/apple-authorization`: nothing (204). */
const NoContent = z.null();

/** Gives the server an Apple sign-in's authorization code; a failure only means less to revoke. */
export async function handOverAppleCode(api: Pick<ApiClient, 'request'>, code: string) {
  await api.request(NoContent, 'POST', '/v1/me/apple-authorization', { code }).catch(() => null);
}

/**
 * Sign in with Apple, with the SHA-256 of the server's nonce (`hashedNonce`): Apple puts it in the
 * identity token, and the server checks it against the raw nonce. Apple gives the name only the
 * first time someone signs in to the app.
 */
export async function appleSheet(hashedNonce: string): Promise<SheetAnswer> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new Error('Apple gave no identity token');
    return {
      token: credential.identityToken,
      givenName: credential.fullName?.givenName ?? null,
      ...(credential.authorizationCode ? { appleCode: credential.authorizationCode } : {}),
    };
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SheetCancelled();
    throw error;
  }
}

const google = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
} as const;

interface GoogleExtra {
  readonly googleIosClientId: string;
  readonly googleAndroidClientId?: string;
}

/**
 * This platform's Google OAuth client: the iOS one, or on Android the Android one (package name and
 * signing SHA-1), which may not exist yet. Null means Google sign-in isn't offered here.
 */
export function googleClient(): { id: string; redirectUri: string } | null {
  const extra = Constants.expoConfig?.extra as GoogleExtra | undefined;
  if (Platform.OS === 'android') {
    const id = extra?.googleAndroidClientId;
    const pkg = Constants.expoConfig?.android?.package;
    // An Android client returns to the app's package name, a scheme the app claims.
    return id && pkg ? { id, redirectUri: `${pkg}:/oauthredirect` } : null;
  }
  const id = extra?.googleIosClientId;
  return id ? { id, redirectUri: googleRedirect(id) } : null;
}

/** Google sends its sheet back to the client id's reversed form, a scheme the app claims. */
export function googleRedirect(clientId: string): string {
  const id = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${id}:/oauthredirect`;
}

/** The first name in an ID token's claims, if it has one. */
export function givenNameIn(idToken: string): string | null {
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { given_name?: unknown };
    return typeof claims.given_name === 'string' ? claims.given_name : null;
  } catch {
    return null;
  }
}

/**
 * Sign in with Google: the authorization code flow with PKCE in the system's OAuth sheet, with the
 * server's raw nonce, which Google puts in the ID token the code is exchanged for.
 */
export async function googleSheet(nonce: string): Promise<SheetAnswer> {
  const client = googleClient();
  if (client === null) throw new Error('No Google client on this platform');
  const { id: clientId, redirectUri } = client;
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: ['openid', 'profile', 'email'],
    usePKCE: true,
    extraParams: { nonce },
  });
  const result = await request.promptAsync(google);
  if (result.type === 'cancel' || result.type === 'dismiss') throw new SheetCancelled();
  if (result.type !== 'success' || !result.params['code']) {
    throw new Error(`Google answered ${result.type}`);
  }
  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      redirectUri,
      code: result.params['code'],
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
    },
    google,
  );
  if (!tokens.idToken) throw new Error('Google gave no ID token');
  return { token: tokens.idToken, givenName: givenNameIn(tokens.idToken) };
}
