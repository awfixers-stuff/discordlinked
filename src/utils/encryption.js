const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const iv = crypto.randomBytes(16); // Initialization vector

// Ensure your encryption key is a 32-byte (256-bit) buffer
// In a real application, this key should be securely managed (e.g., KMS, Vault)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex') : null;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  console.error('CRITICAL ERROR: ENCRYPTION_KEY is not set or is not 32 bytes long. Data will not be securely encrypted/decrypted.');
  // In a production environment, you might want to exit the process here.
}

function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not set. Cannot encrypt.');
  }
  const cipher = crypto.createCipheriv(algorithm, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not set. Cannot decrypt.');
  }
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(algorithm, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

module.exports = { encrypt, decrypt };
