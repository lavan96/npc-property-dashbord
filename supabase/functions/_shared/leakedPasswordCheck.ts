/**
 * Leaked Password Protection using Have I Been Pwned API
 * Uses k-anonymity method for privacy (only sends first 5 chars of SHA-1 hash)
 * 
 * Reference: https://haveibeenpwned.com/API/v3#PwnedPasswords
 * 
 * Note: Uses global crypto API available in Deno runtime
 */

export interface LeakedPasswordResult {
  isLeaked: boolean;
  count?: number; // Number of times password was found in breaches
  error?: string;
}

/**
 * Check if a password has been leaked using Have I Been Pwned API
 * Uses k-anonymity: only sends first 5 characters of SHA-1 hash
 * @param password - The password to check
 * @returns Result indicating if password was found in breaches
 */
export async function checkLeakedPassword(password: string): Promise<LeakedPasswordResult> {
  try {
    // Calculate SHA-1 hash of the password
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    // Extract first 5 characters (prefix) and remaining characters (suffix)
    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    // Call Have I Been Pwned API with only the prefix (k-anonymity)
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'NPC-Property-Dashboard-Security-Check/1.0',
        'Add-Padding': 'true' // Request padding to prevent timing attacks
      }
    });

    if (!response.ok) {
      // If API is unavailable, log but don't block password (fail open for availability)
      console.warn(`[Leaked Password Check] API unavailable: ${response.status}`);
      return { isLeaked: false, error: 'Password check service unavailable' };
    }

    const responseText = await response.text();
    const lines = responseText.split('\n');

    // Check if our suffix (remaining hash) is in the response
    // Format: SUFFIX:COUNT (e.g., 003D68EB55068C33ACE09247EE4C639306B:3)
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const [lineSuffix, countStr] = trimmedLine.split(':');
      if (lineSuffix === suffix) {
        const count = parseInt(countStr || '0', 10);
        return {
          isLeaked: true,
          count: count
        };
      }
    }

    // Password not found in breaches
    return { isLeaked: false };

  } catch (error) {
    // Fail open: if check fails, log but don't block password
    // This ensures availability even if the service is down
    console.error('[Leaked Password Check] Error:', error);
    return {
      isLeaked: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if password is leaked with timeout protection
 * @param password - The password to check
 * @param timeoutMs - Timeout in milliseconds (default: 3000ms)
 * @returns Result indicating if password was found in breaches
 */
export async function checkLeakedPasswordWithTimeout(
  password: string,
  timeoutMs: number = 3000
): Promise<LeakedPasswordResult> {
  try {
    const timeoutPromise = new Promise<LeakedPasswordResult>((resolve) => {
      setTimeout(() => {
        resolve({ isLeaked: false, error: 'Password check timed out' });
      }, timeoutMs);
    });

    const checkPromise = checkLeakedPassword(password);

    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (error) {
    console.error('[Leaked Password Check] Timeout error:', error);
    return { isLeaked: false, error: 'Check failed' };
  }
}

