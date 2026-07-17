import type { NextConfig } from 'next';
import withExportImages from 'next-export-optimize-images';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
};

export default withExportImages(nextConfig);
