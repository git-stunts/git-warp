import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "EmptyGraph",
  description: "A graph database that lives inside Git",
  head: [
    ['meta', { property: 'og:image', content: '/images/empty-graph-social.jpg' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: '/images/empty-graph-social.jpg' }],
  ],
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'Guide', link: '/guide/what-is-this' },
      { text: 'API', link: '/api/' },
      { text: 'Stunts', link: '/stunts/' },
      { text: 'GitHub', link: 'https://github.com/git-stunts/empty-graph' }
    ],
    sidebar: [
      {
        text: 'The Guide',
        items: [
          { text: 'What is this?', link: '/guide/what-is-this' },
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Core Concepts', link: '/guide/core-concepts' },
          { text: 'Operations & Safety', link: '/guide/operations' },
          { text: 'Comparison', link: '/guide/comparison' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          { text: 'Roadmap', link: '/guide/roadmap' },
          { text: 'Architecture', link: '/guide/architecture' },
          { text: 'Interactive Demo', link: '/guide/interactive-demo' },
        ]
      },
      {
        text: 'The Stunts',
        items: [
          { text: 'Event Sourcing', link: '/stunts/event-sourcing' },
          { text: 'Resource-Aware Routing', link: '/stunts/lagrangian-routing' },
          { text: 'Infinite Memory Streaming', link: '/stunts/streaming' },
          { text: 'Invisible Metadata', link: '/stunts/invisible-storage' },
        ]
      },
      {
        text: 'API Reference',
        items: [
          { text: 'EmptyGraph Facade', link: '/api/empty-graph' },
          { text: 'GraphService', link: '/api/graph-service' },
          { text: 'TraversalService', link: '/api/traversal-service' },
          { text: 'BitmapIndex', link: '/api/bitmap-index' },
        ]
      },
      {
        text: 'Internals',
        items: [
          { text: 'The Bitmap Index', link: '/internals/bitmap-index' },
          { text: 'Binary Plumbing', link: '/internals/plumbing' },
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/git-stunts/empty-graph' }
    ],
    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © 2026-present James Ross'
    }
  }
})
