// @ts-check
// https://github.com/FormidableLabs/prism-react-renderer/tree/master/src/themes
const { themes } = require('prism-react-renderer');
const lightCodeTheme = themes.nightOwlLight;
const darkCodeTheme = themes.nightOwl;

const githubOrgUrl = 'https://github.com/nebari-dev';
const githubRepoUrl = `${githubOrgUrl}/nebari-mlflow-pack`;
const githubDocsUrl = `${githubRepoUrl}/tree/main/documentation`;

const customFields = {
  copyright: `Copyright © ${new Date().getFullYear()} | Nebari MLflow pack`,
  meta: {
    title: 'Nebari MLflow pack',
    description:
      'Deploy MLflow on Nebari with Keycloak authentication, PostgreSQL, and TLS.',
    keywords: ['Nebari', 'MLflow', 'Kubernetes', 'Helm', 'MLOps'],
  },
  githubOrgUrl,
  githubRepoUrl,
  githubDocsUrl,
};

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: customFields.meta.title,
  tagline: customFields.meta.description,
  url: 'https://nebari.dev',
  baseUrl: '/',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  themes: ['@docusaurus/theme-mermaid'],
  onBrokenLinks: 'throw',
  favicon: 'img/nebari-logo-square.svg',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'docs',
          routeBasePath: 'docs',
          sidebarPath: require.resolve('./sidebars.js'),
          sidebarCollapsible: true,
          editUrl: `${githubDocsUrl}/docs/`,
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  customFields: { ...customFields },

  /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
  themeConfig: {
    docs: {
      sidebar: {
        autoCollapseCategories: true,
        hideable: true,
      },
    },
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'MLflow pack',
      logo: {
        alt: 'Nebari logo',
        src: 'https://raw.githubusercontent.com/nebari-dev/nebari-design/main/logo-mark/horizontal/Nebari-Logo-Horizontal-Lockup-White-text.svg',
      },
      style: 'dark',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'sidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: githubRepoUrl,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: customFields.copyright,
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Introduction',
              to: '/docs/introduction',
            },
          ],
        },
        {
          title: 'Nebari',
          items: [
            {
              label: 'Nebari documentation',
              href: 'https://www.nebari.dev/docs/introduction',
            },
            {
              label: 'Nebari on GitHub',
              href: githubOrgUrl,
            },
          ],
        },
      ],
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
    },
  },
};

module.exports = config;
