import type {NextConfig} from 'next';
import path from 'node:path';
const nextConfig:NextConfig={poweredByHeader:false,allowedDevOrigins:['127.0.0.1'],turbopack:{root:path.resolve(process.cwd(),'../..')},experimental:{proxyClientMaxBodySize:'26mb'}};
export default nextConfig;
