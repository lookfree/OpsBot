//! Cryptographic services for config file encryption/decryption
//!
//! Uses AES-256-GCM for authenticated encryption with PBKDF2 key derivation.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ring::{
    aead::{self, Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM},
    pbkdf2,
    rand::{SecureRandom, SystemRandom},
};
use std::num::NonZeroU32;

/// Configuration file magic header for identifying encrypted files
const MAGIC_HEADER: &[u8] = b"ZWDCFG01";

/// Storage encryption magic header
const STORAGE_MAGIC: &[u8] = b"ZWDST01";

/// Fixed application key for storage encryption (enables cross-device migration)
/// Complex passphrase with mixed characters for enhanced security
const STORAGE_KEY_PASSPHRASE: &str = "ZWD#OpsBo7!S3cur3$K3y@2024_Pr0t3ct10n&V1.0^Encrypt10n*Stor@ge~Migr@t10n";

/// Number of PBKDF2 iterations for key derivation
const PBKDF2_ITERATIONS: u32 = 100_000;

/// Salt length in bytes
const SALT_LENGTH: usize = 32;

/// Nonce length for AES-256-GCM (96 bits = 12 bytes)
const NONCE_LENGTH: usize = 12;

/// Error types for crypto operations
#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Invalid password")]
    InvalidPassword,

    #[error("Invalid file format")]
    InvalidFormat,

    #[error("Base64 decode error: {0}")]
    Base64Error(String),

    #[error("Random generation failed")]
    RandomFailed,
}

/// Result type for crypto operations
pub type CryptoResult<T> = Result<T, CryptoError>;

/// Crypto service for encrypting and decrypting config files
pub struct CryptoService {
    rng: SystemRandom,
}

impl CryptoService {
    /// Create a new CryptoService instance
    pub fn new() -> Self {
        Self {
            rng: SystemRandom::new(),
        }
    }

    /// Derive a 256-bit key from password using PBKDF2-HMAC-SHA256
    fn derive_key(&self, password: &str, salt: &[u8]) -> [u8; 32] {
        let mut key = [0u8; 32];
        pbkdf2::derive(
            pbkdf2::PBKDF2_HMAC_SHA256,
            NonZeroU32::new(PBKDF2_ITERATIONS).unwrap(),
            salt,
            password.as_bytes(),
            &mut key,
        );
        key
    }

    /// Generate random bytes
    fn random_bytes(&self, len: usize) -> CryptoResult<Vec<u8>> {
        let mut bytes = vec![0u8; len];
        self.rng
            .fill(&mut bytes)
            .map_err(|_| CryptoError::RandomFailed)?;
        Ok(bytes)
    }

    /// Encrypt plaintext data with password
    ///
    /// Output format (Base64 encoded):
    /// [MAGIC_HEADER (8 bytes)][SALT (32 bytes)][NONCE (12 bytes)][CIPHERTEXT + TAG]
    pub fn encrypt(&self, plaintext: &str, password: &str) -> CryptoResult<String> {
        // Generate random salt and nonce
        let salt = self.random_bytes(SALT_LENGTH)?;
        let nonce_bytes = self.random_bytes(NONCE_LENGTH)?;

        // Derive key from password
        let key_bytes = self.derive_key(password, &salt);

        // Create AES-256-GCM key
        let unbound_key = UnboundKey::new(&AES_256_GCM, &key_bytes)
            .map_err(|e| CryptoError::EncryptionFailed(format!("Key creation failed: {:?}", e)))?;
        let key = LessSafeKey::new(unbound_key);

        // Create nonce
        let nonce = Nonce::try_assume_unique_for_key(&nonce_bytes)
            .map_err(|_| CryptoError::EncryptionFailed("Invalid nonce".into()))?;

        // Encrypt (in-place)
        let mut ciphertext = plaintext.as_bytes().to_vec();
        key.seal_in_place_append_tag(nonce, Aad::empty(), &mut ciphertext)
            .map_err(|e| CryptoError::EncryptionFailed(format!("Encryption failed: {:?}", e)))?;

        // Combine: magic + salt + nonce + ciphertext
        let mut output = Vec::with_capacity(MAGIC_HEADER.len() + SALT_LENGTH + NONCE_LENGTH + ciphertext.len());
        output.extend_from_slice(MAGIC_HEADER);
        output.extend_from_slice(&salt);
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        // Encode to base64
        Ok(BASE64.encode(&output))
    }

    /// Decrypt encrypted data with password
    pub fn decrypt(&self, encrypted: &str, password: &str) -> CryptoResult<String> {
        // Decode from base64
        let data = BASE64
            .decode(encrypted.trim())
            .map_err(|e| CryptoError::Base64Error(e.to_string()))?;

        // Check minimum length
        let min_len = MAGIC_HEADER.len() + SALT_LENGTH + NONCE_LENGTH + aead::AES_256_GCM.tag_len();
        if data.len() < min_len {
            return Err(CryptoError::InvalidFormat);
        }

        // Verify magic header
        if &data[..MAGIC_HEADER.len()] != MAGIC_HEADER {
            return Err(CryptoError::InvalidFormat);
        }

        // Extract components
        let offset = MAGIC_HEADER.len();
        let salt = &data[offset..offset + SALT_LENGTH];
        let nonce_bytes = &data[offset + SALT_LENGTH..offset + SALT_LENGTH + NONCE_LENGTH];
        let ciphertext = &data[offset + SALT_LENGTH + NONCE_LENGTH..];

        // Derive key from password
        let key_bytes = self.derive_key(password, salt);

        // Create AES-256-GCM key
        let unbound_key = UnboundKey::new(&AES_256_GCM, &key_bytes)
            .map_err(|e| CryptoError::DecryptionFailed(format!("Key creation failed: {:?}", e)))?;
        let key = LessSafeKey::new(unbound_key);

        // Create nonce
        let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
            .map_err(|_| CryptoError::DecryptionFailed("Invalid nonce".into()))?;

        // Decrypt (in-place) - open_in_place returns slice without tag
        let mut buffer = ciphertext.to_vec();
        let plaintext = key.open_in_place(nonce, Aad::empty(), &mut buffer)
            .map_err(|_| CryptoError::InvalidPassword)?;

        // Convert to string
        String::from_utf8(plaintext.to_vec())
            .map_err(|e| CryptoError::DecryptionFailed(format!("Invalid UTF-8: {}", e)))
    }

    /// Check if data is encrypted (has valid magic header)
    pub fn is_encrypted(&self, data: &str) -> bool {
        if let Ok(decoded) = BASE64.decode(data.trim()) {
            decoded.len() >= MAGIC_HEADER.len() && &decoded[..MAGIC_HEADER.len()] == MAGIC_HEADER
        } else {
            false
        }
    }

    /// Encrypt data using fixed application key (for storage)
    /// This enables seamless cross-device migration
    pub fn encrypt_storage(&self, plaintext: &str) -> CryptoResult<String> {
        // Use fixed salt (32 bytes) for deterministic key derivation across devices
        let salt = b"ZWD@S@lt#2024!F1x3d$Cr0ss%D3v1c";
        let nonce_bytes = self.random_bytes(NONCE_LENGTH)?;

        // Derive key from fixed passphrase
        let key_bytes = self.derive_key(STORAGE_KEY_PASSPHRASE, salt);

        // Create AES-256-GCM key
        let unbound_key = UnboundKey::new(&AES_256_GCM, &key_bytes)
            .map_err(|e| CryptoError::EncryptionFailed(format!("Key creation failed: {:?}", e)))?;
        let key = LessSafeKey::new(unbound_key);

        // Create nonce
        let nonce = Nonce::try_assume_unique_for_key(&nonce_bytes)
            .map_err(|_| CryptoError::EncryptionFailed("Invalid nonce".into()))?;

        // Encrypt (in-place)
        let mut ciphertext = plaintext.as_bytes().to_vec();
        key.seal_in_place_append_tag(nonce, Aad::empty(), &mut ciphertext)
            .map_err(|e| CryptoError::EncryptionFailed(format!("Encryption failed: {:?}", e)))?;

        // Combine: magic + nonce + ciphertext (no salt needed since it's fixed)
        let mut output = Vec::with_capacity(STORAGE_MAGIC.len() + NONCE_LENGTH + ciphertext.len());
        output.extend_from_slice(STORAGE_MAGIC);
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        Ok(BASE64.encode(&output))
    }

    /// Decrypt data using fixed application key (for storage)
    pub fn decrypt_storage(&self, encrypted: &str) -> CryptoResult<String> {
        let data = BASE64
            .decode(encrypted.trim())
            .map_err(|e| CryptoError::Base64Error(e.to_string()))?;

        let min_len = STORAGE_MAGIC.len() + NONCE_LENGTH + aead::AES_256_GCM.tag_len();
        if data.len() < min_len {
            return Err(CryptoError::InvalidFormat);
        }

        // Verify magic header
        if &data[..STORAGE_MAGIC.len()] != STORAGE_MAGIC {
            return Err(CryptoError::InvalidFormat);
        }

        // Extract components
        let offset = STORAGE_MAGIC.len();
        let nonce_bytes = &data[offset..offset + NONCE_LENGTH];
        let ciphertext = &data[offset + NONCE_LENGTH..];

        // Use fixed salt (must match encrypt_storage)
        let salt = b"ZWD@S@lt#2024!F1x3d$Cr0ss%D3v1c";
        let key_bytes = self.derive_key(STORAGE_KEY_PASSPHRASE, salt);

        // Create AES-256-GCM key
        let unbound_key = UnboundKey::new(&AES_256_GCM, &key_bytes)
            .map_err(|e| CryptoError::DecryptionFailed(format!("Key creation failed: {:?}", e)))?;
        let key = LessSafeKey::new(unbound_key);

        // Create nonce
        let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
            .map_err(|_| CryptoError::DecryptionFailed("Invalid nonce".into()))?;

        // Decrypt - open_in_place returns slice without tag
        let mut buffer = ciphertext.to_vec();
        let plaintext = key.open_in_place(nonce, Aad::empty(), &mut buffer)
            .map_err(|_| CryptoError::DecryptionFailed("Decryption failed".into()))?;

        String::from_utf8(plaintext.to_vec())
            .map_err(|e| CryptoError::DecryptionFailed(format!("Invalid UTF-8: {}", e)))
    }

    /// Check if data is storage encrypted
    pub fn is_storage_encrypted(&self, data: &str) -> bool {
        if let Ok(decoded) = BASE64.decode(data.trim()) {
            decoded.len() >= STORAGE_MAGIC.len() && &decoded[..STORAGE_MAGIC.len()] == STORAGE_MAGIC
        } else {
            false
        }
    }
}

impl Default for CryptoService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let service = CryptoService::new();
        let plaintext = r#"{"version":"1.0","data":"test"}"#;
        let password = "test_password_123";

        let encrypted = service.encrypt(plaintext, password).unwrap();
        let decrypted = service.decrypt(&encrypted, password).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_wrong_password() {
        let service = CryptoService::new();
        let plaintext = "secret data";
        let password = "correct_password";

        let encrypted = service.encrypt(plaintext, password).unwrap();
        let result = service.decrypt(&encrypted, "wrong_password");

        assert!(matches!(result, Err(CryptoError::InvalidPassword)));
    }

    #[test]
    fn test_is_encrypted() {
        let service = CryptoService::new();
        let plaintext = "test";
        let password = "pass";

        let encrypted = service.encrypt(plaintext, password).unwrap();

        assert!(service.is_encrypted(&encrypted));
        assert!(!service.is_encrypted(plaintext));
        assert!(!service.is_encrypted("not base64!!!"));
    }
}
