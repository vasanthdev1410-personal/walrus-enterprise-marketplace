export const SESSION_CLASSES = ['INTERACTIVE_WEB', 'INTERACTIVE_MOBILE', 'RECOVERY'] as const;
export type SessionClass = (typeof SESSION_CLASSES)[number];
