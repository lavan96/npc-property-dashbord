import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

/**
 * Hash a password using bcrypt
 * @param password - The plaintext password to hash
 * @returns The hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

/**
 * Verify a password against a hash
 * Handles both bcrypt hashes and legacy plaintext passwords for migration
 * @param password - The plaintext password to verify
 * @param hash - The stored hash (or plaintext for legacy)
 * @returns True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Check if it's a bcrypt hash (starts with $2a$, $2b$, or $2y$)
  const isBcryptHash = /^\$2[aby]\$\d+\$/.test(hash);
  
  if (isBcryptHash) {
    return await bcrypt.compare(password, hash);
  }
  
  // Legacy plaintext comparison for migration period
  // This allows existing users to login with their old passwords
  // On successful login, the password should be re-hashed
  return password === hash;
}

/**
 * Check if a hash is a legacy plaintext password
 * @param hash - The stored hash
 * @returns True if this is a legacy plaintext (not bcrypt)
 */
export function isLegacyPassword(hash: string): boolean {
  return !/^\$2[aby]\$\d+\$/.test(hash);
}
