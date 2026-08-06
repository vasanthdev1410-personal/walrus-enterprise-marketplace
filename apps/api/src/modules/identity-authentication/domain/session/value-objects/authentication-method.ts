export const AUTHENTICATION_METHODS = [
  'PASSWORD',
  'EMAIL_OTP',
  'SMS_OTP',
  'TOTP_AUTHENTICATOR',
] as const;
export type AuthenticationMethod = (typeof AUTHENTICATION_METHODS)[number];
