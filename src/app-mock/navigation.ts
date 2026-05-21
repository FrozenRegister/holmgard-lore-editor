// Mock for $app/navigation used in Vitest (jsdom environment)
export const goto = async (_url: string) => {};
export const invalidate = async (_url: string) => {};
export const prefetch = async (_url: string) => {};
export const beforeNavigate = (_fn: () => void) => {};
export const afterNavigate = (_fn: () => void) => {};
