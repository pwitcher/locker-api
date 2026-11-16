import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
    integrations: [
        starlight({
            title: 'Smart Locker Portal',
            // Updated social syntax: link is now href
            social: [
                { label: 'GitHub', href: 'https://github.com/pwitcher/locker-api', icon: 'github' }
            ],
            sidebar: [
                { label: 'Quickstart', slug: 'quickstart' },
                {
                    label: 'Concepts',
                    autogenerate: { directory: 'concepts' },
                },
                {
                    label: 'Reference',
                    autogenerate: { directory: 'reference' },
                },
            ],
        }),
    ],
});