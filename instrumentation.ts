// Runs once when the Next.js server starts. Only does anything in local demo mode.
export async function register() {
  if (process.env.DEMO_MODE !== '1') return;
  const guard = await import('./lib/demo/guard.mjs');
  guard.assertDemoModeSafe();
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installDemoNetworkGuards } = await import('./lib/demo/network-node');
    installDemoNetworkGuards();
  } else {
    guard.installDemoFetchGuard((line) => console.warn(`[demo-network] ${line}`));
  }
}
