// The site's published address. Every absolute link the pages print — an
// embed snippet, a download example — uses this, never the host the page
// happens to be opened on: a preview or an old deployment address must not
// end up in someone else's page. VITE_SITE_URL overrides it, as it does for
// the sitemap.
export const SITE_URL: string = (import.meta.env.VITE_SITE_URL as string | undefined)
  ?.replace(/\/$/, '') || 'https://praxisterkep.hu';
