// "Médiamegjelenések" (media.html): the articles written from the site's data.
//
// The headline, outlet, author and date are the article's own (lib/media.json);
// the short review under each is ours, in the i18n files, and says what the
// article took from the site — its numbers are the ones valid when it ran.
// A broadcast (medium "tv") carries its air time and where in the recording
// the report starts; its link jumps there.
import { useState } from 'react';
import { t, locale } from '../lib/i18n';
import media from '../lib/media.json';
import { PageNav } from './PageNav';
import { Footer } from './Footer';

const dateOf = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(
  locale === 'en' ? 'en-GB' : 'hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });

/** A broadcast's recording, small, loaded only on a click: until then nothing
 *  is fetched from YouTube (the privacy notice promises it), and then from
 *  the cookieless youtube-nocookie.com, starting where the report begins. */
function Video({ id, start, title }: { id: string; start: number; title: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="media__video">
      {on ? (
        <iframe src={`https://www.youtube-nocookie.com/embed/${id}?start=${start}&autoplay=1&rel=0`}
          title={title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <button type="button" className="media__videoPlay" onClick={() => setOn(true)}>
          <svg viewBox="0 0 68 48" aria-hidden="true"><rect width="68" height="48" rx="12" /><path d="M27 15v18l16-9z" /></svg>
          <span>{t('media.play')}</span>
        </button>
      )}
      <p className="media__videoNote">{t('media.videoNote')}</p>
    </div>
  );
}

export function MediaPage() {
  const articles = [...media.articles].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageNav />
      <section className="section container" id="media">
        <h1 className="section__heading">{t('media.heading')}</h1>
        <p className="section__lead">{t('media.lead')}</p>

        <ol className="media__list">
          {articles.map((a) => (
            <li key={a.id} className="media__item">
              <p className="media__meta">
                {a.medium === 'tv' && <span className="media__tag">{t('media.tv')}</span>}
                <strong>{a.outlet}</strong> · {dateOf(a.date)}{a.time && ` ${a.time}`}
                {a.author && ` · ${a.author}`}
                {a.start && ` · ${t('media.start', { time: a.start })}`}
              </p>
              <h2 className="media__title">
                <a href={a.url} rel="noopener" target="_blank" lang="hu">{a.title}</a>
              </h2>
              <p className="media__summary">{t(`media.items.${a.id}`)}</p>
              {a.youtube && <Video id={a.youtube} start={a.startSeconds ?? 0} title={`${a.outlet} — ${a.title}`} />}
            </li>
          ))}
        </ol>

        <p className="media__follow">
          {t('media.follow')}{' '}
          <a href={media.facebook} rel="noopener" target="_blank">{t('media.facebook')}</a>
        </p>
      </section>
      <Footer />
    </>
  );
}
