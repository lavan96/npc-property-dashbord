import { useRef, useCallback, KeyboardEvent, ClipboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

export function OtpInput({ value, onChange, length = 6, disabled = false }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, '').split('').slice(0, length);

  const focusInput = (index: number) => {
    const clamped = Math.max(0, Math.min(index, length - 1));
    inputsRef.current[clamped]?.focus();
  };

  const handleChange = useCallback((index: number, char: string) => {
    const digit = char.replace(/\D/g, '').slice(0, 1);
    if (!digit) return;

    const arr = value.padEnd(length, ' ').split('').slice(0, length);
    arr[index] = digit;
    const newVal = arr.join('').replace(/ /g, '');
    onChange(newVal.slice(0, length));

    if (index < length - 1) {
      focusInput(index + 1);
    }
  }, [value, length, onChange]);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = value.padEnd(length, ' ').split('').slice(0, length);
      if (arr[index] && arr[index] !== ' ') {
        arr[index] = ' ';
        onChange(arr.join('').replace(/ /g, ''));
      } else if (index > 0) {
        arr[index - 1] = ' ';
        onChange(arr.join('').replace(/ /g, ''));
        focusInput(index - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusInput(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusInput(index + 1);
    }
  }, [value, length, onChange]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted) {
      onChange(pasted);
      focusInput(Math.min(pasted.length, length - 1));
    }
  }, [length, onChange]);

  return (
    <div
      className="flex items-center justify-center gap-2"
      role="group"
      aria-label={`${length}-digit verification code`}
    >
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={el => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digits[i]?.trim() || ''}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
          className={cn(
            'w-11 h-13 text-center text-xl font-mono font-semibold rounded-xl border border-border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            'transition-all duration-150',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            digits[i]?.trim() ? 'border-primary/40' : ''
          )}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
        />
      ))}
    </div>
  );
}
