// What a search engine should take each app page for. The menu carries the
// reader's place from page to page (?m=, &tel=, &jar=, &k=, ?lang=), so a
// crawler finds every page under hundreds of addresses — Search Console
// counted 568 of them as duplicates. Each page names its one address here:
// the county page keeps its county (?m=), the járás page its járás (?jar=),
// every page its language; nothing else changes what a page is about.
//
// It is an inline <head> script, like THEME_BOOT (lib/theme.ts), because the
// county and the járás live in the query string, which a static tag cannot
// read; Google takes a canonical added by script as long as it is the only
// one. Kept free of imports — the html entries carry it verbatim, and
// seo.test.ts checks that they do and what it writes.
export const SITE_URL = 'https://praxisterkep.hu';

export const CANONICAL_BOOT = `(function(){try{var l=location,p=l.pathname.replace(/\\/index\\.html$/,'/'),q=new URLSearchParams(l.search),o=new URLSearchParams(),k=p==='/megye.html'?'m':p==='/jaras.html'?'jar':'';if(k&&q.get(k))o.set(k,q.get(k));var b='${SITE_URL}'+p,h=document.head,a=function(r,u,g){var e=document.createElement('link');e.rel=r;e.href=u;if(g)e.hreflang=g;h.appendChild(e);},s=o.toString(),hu=b+(s?'?'+s:'');o.set('lang','en');var en=b+'?'+o.toString();a('canonical',q.get('lang')==='en'?en:hu);a('alternate',hu,'hu');a('alternate',en,'en');a('alternate',hu,'x-default');}catch(e){}})();`;
