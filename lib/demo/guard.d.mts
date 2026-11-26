export declare const LIVE_PROJECT_REFS: string[];
export declare function isDemoMode(env?: Record<string, string | undefined>): boolean;
export declare function demoGuardProblems(env?: Record<string, string | undefined>): string[];
export declare function assertDemoModeSafe(env?: Record<string, string | undefined>): void;
export declare function isLoopbackHost(hostname: string): boolean;
export declare function isBlockedHost(hostname: string): boolean;
export declare function installDemoFetchGuard(log?: (line: string) => void): { original: typeof fetch; guarded: typeof fetch };
export declare function installDemoDnsGuard(dns: unknown, log?: (line: string) => void): void;
