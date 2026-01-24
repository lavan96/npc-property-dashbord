// Common weak passwords to check against
const COMMON_PASSWORDS = [
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'qwertyuiop', 'abc12345', 'abcd1234', 'admin123',
  'letmein', 'welcome', 'welcome1', 'iloveyou', 'sunshine', 'princess',
  'football', 'baseball', 'dragon', 'master', 'monkey', 'shadow', 'ashley',
  'michael', 'trustno1', 'passw0rd', 'starwars', 'batman', 'superman'
];

export interface PasswordValidationResult {
  isValid: boolean;
  error: string | null;
  isLeaked?: boolean; // Indicates if password was found in data breaches
  leakCount?: number; // Number of times password was found in breaches
}

/**
 * Validates password strength for server-side validation
 * @param password - The password to validate
 * @param checkLeaked - Whether to check if password has been leaked (default: true)
 * @returns Validation result with error message if invalid
 */
export async function validatePasswordStrength(
  password: string,
  checkLeaked: boolean = true
): Promise<PasswordValidationResult> {
  // Check minimum length (8 characters per industry standards)
  if (password.length < 8) {
    return {
      isValid: false,
      error: 'Password must be at least 8 characters'
    };
  }

  // Check against common passwords
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    return {
      isValid: false,
      error: 'Password is too common. Please choose a stronger password'
    };
  }

  // Calculate character types present
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const characterTypes = [hasLowercase, hasUppercase, hasNumber, hasSpecial].filter(Boolean).length;

  // Require at least 2 character types for minimum security
  if (characterTypes < 2) {
    return {
      isValid: false,
      error: 'Password must include at least 2 of: lowercase, uppercase, numbers, or special characters'
    };
  }

  // Check against leaked passwords if enabled
  if (checkLeaked) {
    try {
      const { checkLeakedPasswordWithTimeout } = await import('./leakedPasswordCheck.ts');
      const leakedResult = await checkLeakedPasswordWithTimeout(password, 3000);
      
      if (leakedResult.isLeaked) {
        const count = leakedResult.count || 0;
        return {
          isValid: false,
          error: `This password has been found in ${count.toLocaleString()} data breaches. Please choose a different password.`,
          isLeaked: true,
          leakCount: count
        };
      }
    } catch (error) {
      // If leaked password check fails, log but don't block password (fail open)
      // This ensures availability even if the service is down
      console.warn('[Password Validation] Leaked password check failed:', error);
      // Continue with validation - password passes other checks
    }
  }

  return {
    isValid: true,
    error: null
  };
}
