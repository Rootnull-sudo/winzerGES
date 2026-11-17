import type { NextConfig } from 'next';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Un solo .env en la raíz del monorepo.
config({ path: resolve(process.cwd(), '../../.env') });

const nextConfig: NextConfig = {
  transpilePackages: ['@winzer/domain', '@winzer/db'],
  serverExternalPackages: ['postgres'],
  typedRoutes: false
};
export default nextConfig;
