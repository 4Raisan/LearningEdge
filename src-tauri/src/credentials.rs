use anyhow::{anyhow, Result};

const KEYRING_SERVICE: &str = "learningedge";

pub fn store_secret(credential_ref: &str, secret: &str) -> Result<()> {
    if credential_ref.trim().is_empty() {
        return Err(anyhow!("credential_ref cannot be empty"));
    }
    if secret.trim().is_empty() {
        return Err(anyhow!("secret cannot be empty"));
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, credential_ref)
        .map_err(|e| anyhow!("Failed to initialize keyring entry: {e}"))?;
    entry
        .set_password(secret)
        .map_err(|e| anyhow!("Failed to store credential in OS store: {e}"))?;
    Ok(())
}

pub fn get_secret(credential_ref: &str) -> Result<String> {
    if credential_ref.trim().is_empty() {
        return Err(anyhow!("credential_ref cannot be empty"));
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, credential_ref)
        .map_err(|e| anyhow!("Failed to open keyring entry: {e}"))?;
    entry
        .get_password()
        .map_err(|e| anyhow!("Credential '{credential_ref}' unavailable in OS store: {e}"))
}

pub fn has_secret(credential_ref: &str) -> bool {
    if credential_ref.trim().is_empty() {
        return false;
    }
    keyring::Entry::new(KEYRING_SERVICE, credential_ref)
        .and_then(|e| e.get_password())
        .map(|s| !s.is_empty())
        .unwrap_or(false)
}

pub fn delete_secret(credential_ref: &str) -> Result<()> {
    if credential_ref.trim().is_empty() {
        return Ok(());
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, credential_ref)
        .map_err(|e| anyhow!("Failed to open keyring entry: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(anyhow!("Failed to delete credential '{credential_ref}': {e}")),
    }
}
