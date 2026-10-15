import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './PublicArticle.css';

type Block = {
  id?: string;
  type: 'heading' | 'text' | 'list' | 'affiliate' | 'image' | 'tiktok' | 'quote' | 'divider';
  text?: string;
  level?: 2 | 3;
  items?: string[];
  productIds?: string[];
  url?: string;
  caption?: string;
};
type Article = {
  id: string; title: string; slug: string; excerpt: string | null; tags: string[] | null;
  content: string; cover_image_url: string | null; published_at: string | null;
  created_at: string; updated_at: string;
};
type Product = {
  id: string; name: string; affiliate_url: string; image_url: string | null;
  price: number | null; currency: string | null;
};

function parseBlocks(content: string): Block[] {
  try {
    const value: unknown = JSON.parse(content);
    if (Array.isArray(value) && value.every((b) => b && typeof b === 'object' && 'type' in b)) return value as Block[];
  } catch { /* compatibility with articles saved as plain text */ }
  return content ? [{ type: 'text', text: content }] : [];
}
function getTikTokEmbedUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)tiktok\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/\/video\/(\d+)/) ?? url.pathname.match(/\/embed\/v2\/(\d+)/);
    return match ? `https://www.tiktok.com/embed/v2/${match[1]}` : null;
  } catch { return null; }
}
function InlineText({ text }: { text: string }) {
  const pattern = /(\*\*.+?\*\*|\*[^*\n]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  return <>{text.split(pattern).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  })}</>;
}

export default function PublicArticle({ slug }: { slug: string }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError('');
      const previewToken = new URLSearchParams(window.location.search).get('preview');
      let articleData: Article | null = null;

      if (previewToken && /^[a-z0-9-]{10,100}$/i.test(previewToken)) {
        try {
          const rawPreview = localStorage.getItem(`affilicms_article_preview_${previewToken}`);
          if (rawPreview) {
            const parsed = JSON.parse(rawPreview) as { article?: Article };
            if (parsed.article?.slug === slug) articleData = parsed.article;
          }
        } catch {
          // Jika data pratinjau lokal tidak tersedia, lanjutkan ke artikel terbit.
        }
      }

      if (articleData) {
        setIsPreview(true);
      } else {
        const { data, error: articleError } = await supabase.from('articles')
          .select('id,title,slug,excerpt,tags,content,cover_image_url,published_at,created_at,updated_at')
          .eq('slug', slug).eq('status', 'published').maybeSingle();
        if (!active) return;
        if (articleError) {
          setError('Artikel tidak dapat dimuat. Periksa kebijakan akses publik Supabase.');
          setArticle(null); setLoading(false); return;
        }
        if (!data) { setArticle(null); setLoading(false); return; }
        articleData = data as Article;
        setIsPreview(false);
      }
      if (!active || !articleData) return;
      setArticle(articleData);
      const blocks = parseBlocks(articleData.content);
      const ids = [...new Set(blocks.filter((b) => b.type === 'affiliate').flatMap((b) => b.productIds ?? []))];
      if (ids.length) {
        const { data: productData } = await supabase.from('affiliate_products')
          .select('id,name,affiliate_url,image_url,price,currency').in('id', ids);
        if (active) setProducts((productData ?? []) as Product[]);
      } else if (active) setProducts([]);
      if (active) setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [slug]);

  if (loading) return <main className="public-article-shell"><p>Memuat artikel...</p></main>;
  if (error || !article) return <main className="public-article-shell"><a className="public-back-link" href="/">← AffiliCMS</a><section className="public-article-not-found"><h1>{error ? 'Terjadi kendala' : 'Artikel tidak ditemukan'}</h1><p>{error || 'Artikel ini tidak tersedia atau belum diterbitkan.'}</p></section></main>;

  const blocks = parseBlocks(article.content);
  const productMap = new Map(products.map((p) => [p.id, p]));

  return <main className="public-article-shell">
    <header className="public-article-header"><a className="public-brand" href="/">AffiliCMS</a><a className="public-back-link" href="/">Kembali ke beranda</a></header>
    <article className="public-article">
      {isPreview && <div className="public-article-preview-notice">PRATINJAU PENGUNJUNG · Artikel ini belum tentu sudah diterbitkan</div>}
      <div className="public-article-kicker">ARTIKEL</div>
      <h1>{article.title}</h1>
      {article.tags?.length ? <div className="public-article-tags">{article.tags.map((tag) => <a href={`/#artikel`} key={tag}>{tag}</a>)}</div> : null}
      {article.excerpt && <p className="public-article-excerpt">{article.excerpt}</p>}
      <p className="public-article-date">Diterbitkan {new Date(article.published_at || article.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      {article.cover_image_url && <img className="public-article-cover" src={article.cover_image_url} alt={article.title} />}
      <div className="public-article-body">
        {blocks.map((block, index) => {
          const key = block.id ?? `${block.type}-${index}`;
          if (block.type === 'heading') {
            const Heading = block.level === 3 ? 'h3' : 'h2';
            return <Heading key={key}><InlineText text={block.text ?? ''} /></Heading>;
          }
          if (block.type === 'text') return <p key={key} className="public-block-text"><InlineText text={block.text ?? ''} /></p>;
          if (block.type === 'quote') return <blockquote key={key}><InlineText text={block.text ?? ''} /></blockquote>;
          if (block.type === 'list') return <ul key={key}>{(block.items ?? []).filter(Boolean).map((item, i) => <li key={i}><InlineText text={item} /></li>)}</ul>;
          if (block.type === 'divider') return <hr key={key} />;
          if (block.type === 'image') return block.url ? <figure key={key} className="public-article-figure"><img src={block.url} alt={block.caption ?? ''} /><figcaption>{block.caption}</figcaption></figure> : null;
          if (block.type === 'tiktok') {
            const embed = block.url ? getTikTokEmbedUrl(block.url) : null;
            return <div key={key} className="public-tiktok-block">{embed ? <iframe src={embed} title="Video TikTok" loading="lazy" allow="fullscreen; encrypted-media; picture-in-picture" /> : <p>Video TikTok tidak dapat disematkan. <a href={block.url} target="_blank" rel="noreferrer">Tonton di TikTok</a></p>}</div>;
          }
          if (block.type === 'affiliate') {
            const selected = (block.productIds ?? []).map((id) => productMap.get(id)).filter((p): p is Product => Boolean(p));
            return <div key={key} className="public-product-grid">{selected.map((p) => <section className="public-product-card" key={p.id}>
              {p.image_url ? <img src={p.image_url} alt={p.name} /> : <div className="public-product-placeholder">Produk</div>}
              <div className="public-product-info"><h3>{p.name}</h3>{p.price != null && <p className="public-product-price">{p.currency ?? 'IDR'} {Number(p.price).toLocaleString('id-ID')}</p>}
                <a className="public-product-link" href={p.affiliate_url} target="_blank" rel="sponsored noreferrer">Lihat Produk</a></div>
            </section>)}</div>;
          }
          return null;
        })}
      </div>
    </article>
    <footer className="public-article-footer">Dikelola dengan AffiliCMS</footer>
  </main>;
}
