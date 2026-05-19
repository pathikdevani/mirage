import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyOptions,
  type JWTVerifyResult,
} from 'jose';
import type { MirageJwtClaims } from '@mirage/types';

export interface KeycloakVerifierOptions {
  /** OIDC issuer, e.g. `http://localhost:8080/realms/mirage`. */
  issuer: string;
  /** JWKS endpoint URL, typically `${issuer}/protocol/openid-connect/certs`. */
  jwksUri: string;
  /** Expected `aud` claim. Optional — Keycloak access tokens often have `aud: "account"`. */
  audience?: string | ReadonlyArray<string>;
  /** Clock-skew tolerance in seconds (default 5). */
  clockToleranceSec?: number;
}

export class JwtVerificationError extends Error {
  override readonly name = 'JwtVerificationError';
}

/**
 * Build a reusable verifier bound to a Keycloak realm. The JWKS is cached
 * and refreshed automatically by `jose`. Call the returned function on
 * every request — verification is cheap once the JWKS is warm.
 */
export function createKeycloakVerifier(opts: KeycloakVerifierOptions) {
  const jwks = createRemoteJWKSet(new URL(opts.jwksUri));

  const verifyOpts: JWTVerifyOptions = {
    issuer: opts.issuer,
    clockTolerance: opts.clockToleranceSec ?? 5,
  };
  if (opts.audience !== undefined) {
    verifyOpts.audience = opts.audience as string | string[];
  }

  return async function verify(token: string): Promise<MirageJwtClaims & JWTPayload> {
    let result: JWTVerifyResult;
    try {
      result = await jwtVerify(token, jwks, verifyOpts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new JwtVerificationError(`JWT verification failed: ${message}`);
    }

    const payload = result.payload;
    if (typeof payload.sub !== 'string') {
      throw new JwtVerificationError('JWT payload missing `sub`');
    }
    return payload as MirageJwtClaims & JWTPayload;
  };
}

export type KeycloakVerifier = ReturnType<typeof createKeycloakVerifier>;
