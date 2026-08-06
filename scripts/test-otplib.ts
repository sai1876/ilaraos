import { authenticator } from 'otplib';

const secret = authenticator.generateSecret();
// Generate a token for 45 seconds ago (which is 1-2 steps skew)
const time = Date.now() - 45000;
const token = authenticator.generate(secret); // current token
// Let's generate a token specifically for 45 seconds ago
// In otplib, we can get token for a specific time by setting options or using the underlying hotp/totp engine
// Wait, we can use authenticator.check(token, secret) or totp
import { totp } from 'otplib';

// Let's check with a time shift using verify:
const pastToken = totp.generate(secret); 
// Wait, let's verify if we can set window: 2 on authenticator.options
authenticator.options = { window: 2 };
console.log("Verify current token:", authenticator.verify({ token, secret }));
// Let's test with a different window parameter
// We can just set authenticator.options = { window: 2 } or passing window in options.
// Let's verify if that works when we do verify:
console.log("Verify options config:", authenticator.options);
