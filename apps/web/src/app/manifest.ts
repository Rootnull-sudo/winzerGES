import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Winzer — gestión de viñas',
    short_name: 'Winzer',
    description: 'Catastro, vendimia, bodega, ventas y tributario de tu viña. Funciona en el campo sin señal.',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf8f4',
    theme_color: '#161412',
    lang: 'es-CL',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
    ]
  };
}
