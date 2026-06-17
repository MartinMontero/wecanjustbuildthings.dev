/**
 * One-time setup: generate the ES256 keypair that signs "Sign in with Bluesky"
 * private_key_jwt client assertions. Prints the PRIVATE JWK to stdout — set it as a
 * Worker secret; the public half is derived and published automatically.
 *
 *   npx tsx scripts/gen-bluesky-key.ts [kid]
 *   npx wrangler secret put BLUESKY_PRIVATE_KEY_JWK   # paste the printed JSON line
 *
 * For local dev, add the same value to .dev.vars:
 *   BLUESKY_PRIVATE_KEY_JWK={"kty":"EC",...}
 */
import { JoseKey } from '@atproto/jwk-jose';

const kid = process.argv[2] || `bsky-${new Date().toISOString().slice(0, 10)}`;
const key = await JoseKey.generate(['ES256'], kid);

// stdout = the secret (machine-readable, one line). Guidance goes to stderr.
process.stdout.write(JSON.stringify(key.privateJwk) + '\n');
process.stderr.write(
  `\nES256 signing key generated (kid="${kid}").\n` +
  `The JSON line above is the PRIVATE key — keep it secret. Install it with:\n` +
  `  npx wrangler secret put BLUESKY_PRIVATE_KEY_JWK\n` +
  `The matching public key is derived at runtime and published at\n` +
  `  /api/auth/bluesky/client-metadata.json\n\n`,
);
