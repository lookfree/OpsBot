//! Cryptographic services for config file encryption/decryption
//!
//! Uses AES-256-GCM for authenticated encryption with PBKDF2 key derivation.
//! Storage encryption supports V1 (hardcoded key) and V2 (OS keyring key).

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ring::{
    aead::{self, Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM},
    pbkdf2,
    rand::{SecureRandom, SystemRandom},
};
use std::num::NonZeroU32;

/// Configuration file magic header for identifying encrypted files
const MAGIC_HEADER: &[u8] = b"ZWDCFG01";

/// Storage encryption magic header (V1 - hardcoded key, kept for migration)
const STORAGE_MAGIC_V1: &[u8] = b"ZWDST01";

/// Storage encryption magic header (V2 - OS keyring key)
const STORAGE_MAGIC_V2: &[u8] = b"ZWDST02";

/// Fixed application key for V1 storage decryption (migration only)
const STORAGE_KEY_PASSPHRASE: &str =
    "ZWD#OpsBo7!S3cur3$K3y@2024_Pr0t3ct10n&V1.0^Encrypt10n*Stor@ge~Migr@t10n";

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
    /// OS keyring storage key (32 bytes). None = V1 fallback only.
    storage_key: Option<[u8; 32]>,
}

impl CryptoService {
    /// Create a new CryptoService instance (V1 mode, no keyring key)
    pub fn new() -> Self {
        Self {
            rng: SystemRandom::new(),
            storage_key: None,
        }
    }

    /// Create a CryptoService with an OS keyring storage key (V2 mode)
    pub fn new_with_storage_key(key: [u8; 32]) -> Self {
        Self {
            rng: SystemRandom::new(),
            storage_key: Some(key),
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

    /// AES-256-GCM encrypt with given key bytes
    fn aes_encrypt(&self, key_bytes: &[u8; 32], plaintext: &[u8]) -> CryptoResult<(Vec<u8>, Vec<u8>)> {
        let nonce_bytes = self.random_bytes(NONCE_LENGTH)?;
        let unbound_key = UnboundKey::new(&AES_256_GCM, key_bytes)
            .map_err(|e| CryptoError::EncryptionFailed(format!("Key creation failed: {:?}", e)))?;
        let key = LessSafeKey::new(unbound_key);
        let nonce = Nonce::try_assume_unique_for_key(&nonce_bytes)
            .map_err(|_| CryptoError::EncryptionFailed("Invalid nonce".into()))?;
        let mut ciphertext = plaintext.to_vec();
        key.seal_in_place_append_tag(nonce, Aad::empty(), &mut ciphertext)
            .map_err(|e| CryptoError::EncryptionFailed(format!("{:?}", e)))?;
        Ok((nonce_bytes, ciphertext))
    }

    /// AES-256-GCM decrypt with given key bytes
    fn aes_decrypt(&self, key_bytes: &[u8; 32], nonce_bytes: &[u8], ciphertext: &[u8]) -> CryptoResult<Vec<u8>> {
        let unbound_key = UnboundKey::new(&AES_256_GCM, key_bytes)
            .map_err(|e| CryptoError::DecryptionFailed(format!("Key creation failed: {:?}", e)))?;
        let key = LessSafeKey::new(unbound_key);
        let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
            .map_err(|_| CryptoError::DecryptionFailed("Invalid nonce".into()))?;
        let mut buffer = ciphertext.to_vec();
        let plaintext = key
            .open_in_place(nonce, Aad::empty(), &mut buffer)
            .map_err(|_| CryptoError::DecryptionFailed("Decryption failed".into()))?;
        Ok(plaintext.to_vec())
    }

    /// Encrypt plaintext data with password
    ///
    /// Output format (Base64 encoded):
    /// [MAGIC_HEADER (8 bytes)][SALT (32 bytes)][NONCE (12 bytes)][CIPHERTEXT + TAG]
    pub fn encrypt(&self, plaintext: &str, password: &str) -> CryptoResult<String> {
        let salt = self.random_bytes(SALT_LENGTH)?;
        let key_bytes = self.derive_key(password, &salt);
        let (nonce_bytes, ciphertext) = self.aes_encrypt(&key_bytes, plaintext.as_bytes())?;

        let mut output = Vec::with_capacity(
            MAGIC_HEADER.len() + SALT_LENGTH + NONCE_LENGTH + ciphertext.len(),
        );
        output.extend_from_slice(MAGIC_HEADER);
        output.extend_from_slice(&salt);
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        Ok(BASE64.encode(&output))
    }

    /// Decrypt encrypted data with password
    pub fn decrypt(&self, encrypted: &str, password: &str) -> CryptoResult<String> {
        let data = BASE64
            .decode(encrypted.trim())
            .map_err(|e| CryptoError::Base64Error(e.to_string()))?;

        let min_len =
            MAGIC_HEADER.len() + SALT_LENGTH + NONCE_LENGTH + aead::AES_256_GCM.tag_len();
        if data.len() < min_len {
            return Err(CryptoError::InvalidFormat);
        }
        if &data[..MAGIC_HEADER.len()] != MAGIC_HEADER {
            return Err(CryptoError::InvalidFormat);
        }

        let offset = MAGIC_HEADER.len();
        let salt = &data[offset..offset + SALT_LENGTH];
        let nonce_bytes = &data[offset + SALT_LENGTH..offset + SALT_LENGTH + NONCE_LENGTH];
        let ciphertext = &data[offset + SALT_LENGTH + NONCE_LENGTH..];

        let key_bytes = self.derive_key(password, salt);
        let plaintext = self.aes_decrypt(&key_bytes, nonce_bytes, ciphertext)
            .map_err(|_| CryptoError::InvalidPassword)?;

        String::from_utf8(plaintext)
            .map_err(|e| CryptoError::DecryptionFailed(format!("Invalid UTF-8: {}", e)))
    }

    /// Check if data is encrypted (has valid magic header)
    pub fn is_encrypted(&self, data: &str) -> bool {
        if let Ok(decoded) = BASE64.decode(data.trim()) {
            decoded.len() >= MAGIC_HEADER.len()
                && &decoded[..MAGIC_HEADER.len()] == MAGIC_HEADER
        } else {
            false
        }
    }

    /// Encrypt data for local storage using OS keyring key (V2).
    /// Falls back to V1 (hardcoded key) if no keyring key is set.
    ///
    /// V2 format: [ZWDST02 (7 bytes)][NONCE (12 bytes)][CIPHERTEXT + TAG]
    pub fn encrypt_storage(&self, plaintext: &str) -> CryptoResult<String> {
        if let Some(ref key) = self.storage_key {
            return self.encrypt_storage_v2(plaintext, key);
        }
        self.encrypt_storage_v1(plaintext)
    }

    /// V2 encryption: uses raw 256-bit keyring key directly (no PBKDF2)
    fn encrypt_storage_v2(&self, plaintext: &str, key: &[u8; 32]) -> CryptoResult<String> {
        let (nonce_bytes, ciphertext) = self.aes_encrypt(key, plaintext.as_bytes())?;

        let mut output =
            Vec::with_capacity(STORAGE_MAGIC_V2.len() + NONCE_LENGTH + ciphertext.len());
        output.extend_from_slice(STORAGE_MAGIC_V2);
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        Ok(BASE64.encode(&output))
    }

    /// V1 encryption: hardcoded passphrase + fixed salt (legacy, for migration)
    fn encrypt_storage_v1(&self, plaintext: &str) -> CryptoResult<String> {
        let salt = b"ZWD@S@lt#2024!F1x3d$Cr0ss%D3v1c";
        let key_bytes = self.derive_key(STORAGE_KEY_PASSPHRASE, salt);
        let (nonce_bytes, ciphertext) = self.aes_encrypt(&key_bytes, plaintext.as_bytes())?;

        let mut output =
            Vec::with_capacity(STORAGE_MAGIC_V1.len() + NONCE_LENGTH + ciphertext.len());
        output.extend_from_slice(STORAGE_MAGIC_V1);
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        Ok(BASE64.encode(&output))
    }

    /// Decrypt storage data. Supports both V1 (ZWDST01) and V2 (ZWDST02) formats.
    /// V1 data is decrypted with the hardcoded key for backward compatibility.
    pub fn decrypt_storage(&self, encrypted: &str) -> CryptoResult<String> {
        let data = BASE64
            .decode(encrypted.trim())
            .map_err(|e| CryptoError::Base64Error(e.to_string()))?;

        // Minimum: header (7) + nonce (12) + tag (16)
        let min_len = 7 + NONCE_LENGTH + aead::AES_256_GCM.tag_len();
        if data.len() < min_len {
            return Err(CryptoError::InvalidFormat);
        }

        if data.starts_with(STORAGE_MAGIC_V2) {
            self.decrypt_storage_v2(&data)
        } else if data.starts_with(STORAGE_MAGIC_V1) {
            self.decrypt_storage_v1(&data)
        } else {
            Err(CryptoError::InvalidFormat)
        }
    }

    /// Decrypt V2 storage data using keyring key
    fn decrypt_storage_v2(&self, data: &[u8]) -> CryptoResult<String> {
        let key = self.storage_key.as_ref().ok_or_else(|| {
            CryptoError::DecryptionFailed("No keyring key available for V2 decryption".into())
        })?;

        let offset = STORAGE_MAGIC_V2.len();
        let nonce_bytes = &data[offset..offset + NONCE_LENGTH];
        let ciphertext = &data[offset + NONCE_LENGTH..];

        let plaintext = self.aes_decrypt(key, nonce_bytes, ciphertext)?;
        String::from_utf8(plaintext)
            .map_err(|e| CryptoError::DecryptionFailed(format!("Invalid UTF-8: {}", e)))
    }

    /// Decrypt V1 storage data using hardcoded key (backward compatibility)
    fn decrypt_storage_v1(&self, data: &[u8]) -> CryptoResult<String> {
        let offset = STORAGE_MAGIC_V1.len();
        let nonce_bytes = &data[offset..offset + NONCE_LENGTH];
        let ciphertext = &data[offset + NONCE_LENGTH..];

        let salt = b"ZWD@S@lt#2024!F1x3d$Cr0ss%D3v1c";
        let key_bytes = self.derive_key(STORAGE_KEY_PASSPHRASE, salt);

        let plaintext = self.aes_decrypt(&key_bytes, nonce_bytes, ciphertext)?;
        String::from_utf8(plaintext)
            .map_err(|e| CryptoError::DecryptionFailed(format!("Invalid UTF-8: {}", e)))
    }

    /// Check if data is storage encrypted (V1 or V2)
    pub fn is_storage_encrypted(&self, data: &str) -> bool {
        if let Ok(decoded) = BASE64.decode(data.trim()) {
            decoded.starts_with(STORAGE_MAGIC_V1) || decoded.starts_with(STORAGE_MAGIC_V2)
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

    #[test]
    fn test_storage_v1_roundtrip() {
        let service = CryptoService::new();
        let plaintext = r#"{"key":"value"}"#;

        let encrypted = service.encrypt_storage(plaintext).unwrap();
        let decrypted = service.decrypt_storage(&encrypted).unwrap();

        assert_eq!(plaintext, decrypted);
        assert!(service.is_storage_encrypted(&encrypted));
    }

    #[test]
    fn test_storage_v2_roundtrip() {
        let key = [42u8; 32];
        let service = CryptoService::new_with_storage_key(key);
        let plaintext = r#"{"key":"value"}"#;

        let encrypted = service.encrypt_storage(plaintext).unwrap();
        let decrypted = service.decrypt_storage(&encrypted).unwrap();

        assert_eq!(plaintext, decrypted);
        assert!(service.is_storage_encrypted(&encrypted));
    }

    #[test]
    fn test_v2_service_reads_v1_data() {
        // V1 service encrypts
        let v1_service = CryptoService::new();
        let plaintext = "migration test data";
        let v1_encrypted = v1_service.encrypt_storage(plaintext).unwrap();

        // V2 service can still decrypt V1 data
        let key = [99u8; 32];
        let v2_service = CryptoService::new_with_storage_key(key);
        let decrypted = v2_service.decrypt_storage(&v1_encrypted).unwrap();

        assert_eq!(plaintext, decrypted);
    }
}
