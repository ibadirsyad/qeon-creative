
import { useEffect, useRef } from 'react';

type TikTokEmbedProps = {
  url: string;
};

export default function TikTokEmbed({ url }: TikTokEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const match = url.match(/\/video\/(\d+)/);
  const videoId = match?.[1];

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !videoId) return;

    container.replaceChildren();

    const blockquote = document.createElement('blockquote');
    blockquote.className = 'tiktok-embed';
    blockquote.setAttribute('cite', url);
    blockquote.setAttribute('data-video-id', videoId);
    blockquote.style.maxWidth = '605px';
    blockquote.style.minWidth = '325px';
    blockquote.style.width = '100%';

    const section = document.createElement('section');
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Tonton video di TikTok';

    section.appendChild(link);
    blockquote.appendChild(section);
    container.appendChild(blockquote);

    const script = document.createElement('script');
    script.src = 'https://www.tiktok.com/embed.js';
    script.async = true;
    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, [url, videoId]);

  if (!videoId) {
    return <p>URL harus berupa tautan video TikTok yang valid.</p>;
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        maxWidth: 605,
        margin: '0 auto',
        overflow: 'hidden',
      }}
    />
  );
}
