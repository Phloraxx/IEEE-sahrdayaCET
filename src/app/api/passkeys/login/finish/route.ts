import { NextRequest, NextResponse } from 'next/server';
import { validateCSRF } from '@/lib/api/csrf';
import * as SimpleWebAuthnServer from '@simplewebauthn/server';
import * as SimpleWebAuthnServerHelpers from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON } from '@simplewebauthn/browser';
import crypto from 'crypto';

import { createLogger } from '@/lib/api/logger';
import { handleError } from '@/lib/errorHandler';

import {
  createSessionToken,
  findUserIdByCredentialId,
  getCredentials,
  getSignedInUserFromRequest,
  updateCredentialCounter,
} from '@/lib/passkeys/passkeyStore';

const log = createLogger({ action: 'passkey-login-finish' });

export const runtime = 'nodejs';

function getRpId(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  return host.split(':')[0];
}

function getExpectedOrigin(req: NextRequest) {
  return req.headers.get('origin') ?? `https://${getRpId(req)}`;
}

type SignedChallenge = {
  challenge: string;
  rpID: string;
  expectedOrigin: string;
  iat: number;
  intent: 'login' | 'reauth';
  userId?: string;
};

function requireChallengeSecret() {
  const secret = process.env.PASSKEY_HMAC_SECRET;
  if (!secret) throw new Error('Missing required env var: PASSKEY_HMAC_SECRET');
  return secret;
}

function signPayload(payload: string) {
  return crypto.createHmac('sha256', requireChallengeSecret()).update(payload).digest('base64url');
}

function parseChallenge(challengeId: string): SignedChallenge | null {
  const [payloadBase64, signature] = challengeId.split('.');
  if (!payloadBase64 || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(payloadBase64, 'base64url').toString('utf8');
  } catch {
    log.warn('Failed to decode challenge payload from base64url');
    return null;
  }

  const expected = signPayload(payload);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (signatureBytes.length !== expectedBytes.length) return null;
  if (!crypto.timingSafeEqual(signatureBytes, expectedBytes)) return null;

  let parsed: SignedChallenge;
  try {
    parsed = JSON.parse(payload) as SignedChallenge;
  } catch {
    log.warn('Failed to parse challenge payload JSON');
    return null;
  }

  if (
    !parsed.challenge ||
    !parsed.rpID ||
    !parsed.expectedOrigin ||
    typeof parsed.iat !== 'number' ||
    (parsed.intent !== 'login' && parsed.intent !== 'reauth')
  ) {
    return null;
  }

  if (parsed.intent === 'reauth' && typeof parsed.userId !== 'string') {
    return null;
  }

  // 5 minute challenge validity window
  if (Date.now() - parsed.iat > 5 * 60 * 1000) {
    return null;
  }

  return parsed;
}

function userHandleToUserId(userHandle?: string | null) {
  if (!userHandle) return null;
  try {
    return Buffer.from(userHandle, 'base64url').toString('utf8');
  } catch {
    log.warn('Failed to decode user handle from base64url');
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    validateCSRF(req);
    const { challengeId, authentication } = await req.json() as {
      challengeId?: string;
      authentication?: AuthenticationResponseJSON;
    };

    if (!challengeId || !authentication) {
      return NextResponse.json({ error: 'Missing challengeId/authentication' }, { status: 400 });
    }

    const parsedChallenge = parseChallenge(challengeId);
    if (!parsedChallenge) {
      return NextResponse.json({ error: 'INVALID_CHALLENGE' }, { status: 400 });
    }

    const rpID = getRpId(req);
    const expectedOrigin = getExpectedOrigin(req);
    if (rpID !== parsedChallenge.rpID || expectedOrigin !== parsedChallenge.expectedOrigin) {
      return NextResponse.json({ error: 'ORIGIN_MISMATCH' }, { status: 400 });
    }

    const signedInUser =
      parsedChallenge.intent === 'reauth' ? await getSignedInUserFromRequest(req) : null;
    if (parsedChallenge.intent === 'reauth' && !signedInUser) {
      return NextResponse.json({ error: 'NOT_SIGNED_IN' }, { status: 401 });
    }

    const userIdFromHandle = userHandleToUserId(authentication.response.userHandle);
    const userId = userIdFromHandle ?? await findUserIdByCredentialId(authentication.id);
    if (!userId) {
      return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
    }

    if (parsedChallenge.intent === 'reauth') {
      if (userId !== parsedChallenge.userId || signedInUser?.$id !== userId) {
        return NextResponse.json({ error: 'NOT_ALLOWED' }, { status: 403 });
      }
    }

    const credentials = await getCredentials(userId);
    if (!credentials.length) {
      return NextResponse.json({ error: 'NO_PASSKEY' }, { status: 404 });
    }

    const credentialIdBase64URLFromStored = (storedIdHex: string) => {
      const bytes = SimpleWebAuthnServerHelpers.isoUint8Array.fromHex(storedIdHex);
      return SimpleWebAuthnServerHelpers.isoBase64URL.fromBuffer(bytes, 'base64url');
    };

    const authenticationId = authentication.id;
    const matchedCredential = credentials.find(
      (c) => credentialIdBase64URLFromStored(c.credentialID) === authenticationId
    );

    if (!matchedCredential) {
      return NextResponse.json({ error: 'INCORRECT_PASSKEY' }, { status: 400 });
    }

    const verification = await SimpleWebAuthnServer.verifyAuthenticationResponse({
      response: authentication,
      expectedChallenge: parsedChallenge.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: authenticationId,
        publicKey: SimpleWebAuthnServerHelpers.isoUint8Array.fromHex(matchedCredential.credentialPublicKey),
        counter: matchedCredential.counter,
        transports: matchedCredential.transports,
      },
    });

    const { verified, authenticationInfo } = verification;
    if (!verified) {
      return NextResponse.json({ error: 'INCORRECT_PASSKEY' }, { status: 400 });
    }

    // Update the stored counter to prevent replay.
    await updateCredentialCounter(userId, matchedCredential.credentialID, authenticationInfo.newCounter);

    if (parsedChallenge.intent === 'reauth') {
      return NextResponse.json({
        ok: true,
        userId,
        reauthenticatedAt: Date.now(),
      });
    }

    const token = await createSessionToken(userId);

    // Set the session secret as an HttpOnly cookie ONLY (not returned in body — prevents XSS theft)
    const response = NextResponse.json({
      userId,
      ok: true,
    });
    response.cookies.set('appwrite-session', token.secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return response;
  } catch (err) {
    return handleError(err);
  }
}

