const crypto = require('crypto');
const { AE } = require('./constants.js');

/**
 * Encrypts data using AES-128-CBC with PKCS7 padding.
 * @param {Buffer} buffer - The data to encrypt
 * @returns {Buffer} Encrypted data
 */
function encrypt(buffer) {
    const cipher = crypto.createCipheriv('aes-128-cbc', AE.MAIN_KEY, AE.MAIN_IV);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return encrypted;
}

/**
 * Decrypts AES-128-CBC payloads produced by encrypt().
 * @param {Buffer} buffer - The encrypted data
 * @returns {Buffer} Decrypted data
 */
function decrypt(buffer) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', AE.MAIN_KEY, AE.MAIN_IV);
    const decrypted = Buffer.concat([decipher.update(buffer), decipher.final()]);
    return decrypted;
}

module.exports = { encrypt, decrypt };
