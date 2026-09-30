import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const app = express();
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "test-key-1";
jwk.alg = "RS256";
jwk.use = "sig";

const ISSUER = "http://host.docker.internal:9099";

app.get("/.well-known/openid-configuration", (_req, res) => {
  res.json({ issuer: ISSUER, jwks_uri: `${ISSUER}/jwks` });
});
app.get("/jwks", (_req, res) => res.json({ keys: [jwk] }));

app.get("/token", async (req, res) => {
  const jwt = await new SignJWT({ aut: "APPLICATION" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
    .setIssuer(ISSUER)
    .setSubject("some-client-id")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
  res.json({ access_token: jwt });
});

app.listen(9099, () => console.log("mock idp on :9099"));
