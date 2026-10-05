const EMAIL_IN_TEXT_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export function containsEmailAddress(value: string) {
  return EMAIL_IN_TEXT_PATTERN.test(value.trim());
}
