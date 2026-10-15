import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import './QeonCompanyCategoryPage.css';
import QeonCompanyNavbar from './QeonCompanyNavbar';

type Article = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  published_at: string | null;
  created_at: string;
};

const categories = [
  { tag: 'Panduan Rakit PC', slug: 'panduan-rakit-pc', description: 'Tutorial merakit PC dari persiapan komponen hingga komputer siap digunakan.' },
  { tag: 'Komponen PC', slug: 'komponen-pc', description: 'Kenali fungsi, spesifikasi, dan cara memilih komponen PC yang tepat.' },
  { tag: 'Rekomendasi Rakitan', slug: 'rekomendasi-rakitan', description: 'Inspirasi rakitan PC untuk kebutuhan dan anggaran yang berbeda.' },
  { tag: 'Troubleshooting', slug: 'troubleshooting', description: 'Panduan mendiagnosis dan menyelesaikan masalah pada PC.' },
  { tag: 'Artikel', slug: 'artikel', description: 'Tips, informasi, dan berita seputar teknologi serta komputer.' },
];

function formatDate(value: string | null) {
  if (!value) return 'Artikel Qeon Company';
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function QeonCompanyCategoryPage({ slug }: { slug: string }) {
  const category = categories.find((item) => item.slug === slug);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadArticles() {
      setLoading(true);
      setError('');
      const { data, error: queryError } = await supabase
        .from('articles')
        .select('id,title,slug,excerpt,tags,cover_image_url,published_at,created_at')
        .eq('status', 'published')
        .contains('tags', [category?.tag ?? ''])
        .order('published_at', { ascending: false })
        .limit(100);
      if (!active) return;
      if (queryError) {
        setError('Artikel belum dapat dimuat. Silakan coba lagi beberapa saat.');
        setArticles([]);
      } else {
        setArticles((data ?? []) as Article[]);
      }
      setLoading(false);
    }
    if (category) void loadArticles();
    else setLoading(false);
    return () => { active = false; };
  }, [slug, category?.tag]);

  const backHref = '/';
  const articleCountLabel = useMemo(() => `${articles.length} postingan`, [articles.length]);

  if (!category) {
    return <div className="qcc-page"><header className="qcc-header"><a className="qcc-brand" href="/">Q<span>eon</span> Company</a></header><main className="qcc-main"><div className="qcc-empty"><h1>Kategori tidak ditemukan</h1><p>Kategori yang Anda buka tidak tersedia.</p><a className="qcc-back" href="/">Kembali ke Beranda</a></div></main></div>;
  }

  return (
    <div className="qcc-page">
      <QeonCompanyNavbar />
      <main className="qcc-main">
        <div className="qcc-breadcrumb"><a href="/">Beranda</a><span>/</span><span>Rakit PC</span><span>/</span><strong>{category.tag}</strong></div>
        <section className="qcc-category-hero">
          <span className="qcc-eyebrow">QEON COMPANY / RAKIT PC</span>
          <h1>{category.tag}</h1>
          <p>{category.description}</p>
          <div className="qcc-category-meta"><span>{articleCountLabel}</span><span>•</span><span>Materi pilihan untuk belajar lebih terarah</span></div>
        </section>

        <section className="qcc-post-section">
          <div className="qcc-section-heading"><div><span>JELAJAHI MATERI</span><h2>Postingan <em>{category.tag}</em></h2></div><p>Pilih kartu postingan untuk membaca artikel lengkap.</p></div>
          {loading ? (
            <div className="qcc-state"><span className="qcc-spinner" /><p>Memuat postingan...</p></div>
          ) : error ? (
            <div className="qcc-state"><h3>Belum berhasil memuat artikel</h3><p>{error}</p></div>
          ) : articles.length === 0 ? (
            <div className="qcc-empty"><div className="qcc-empty-icon">▤</div><h3>Belum ada postingan di kategori ini</h3><p>Artikel akan muncul di halaman ini setelah diterbitkan dengan tag <strong>{category.tag}</strong> dari dashboard.</p><a className="qcc-back" href={backHref}>Kembali ke Beranda</a></div>
          ) : (
            <div className="qcc-post-grid">
              {articles.map((article) => (
                <a className="qcc-post-card" href={`/artikel/${encodeURIComponent(article.slug)}`} key={article.id}>
                  <div className="qcc-post-image">
                    {article.cover_image_url ? <img src={article.cover_image_url} alt="" loading="lazy" /> : <div className="qcc-post-image-placeholder"><span>QEON</span><b>PC</b><small>TECHNOLOGY EDUCATION</small></div>}
                    <span className="qcc-post-category">{category.tag}</span>
                  </div>
                  <div className="qcc-post-body">
                    <div className="qcc-post-date">{formatDate(article.published_at || article.created_at)}</div>
                    <h3>{article.title}</h3>
                    <p>{article.excerpt || 'Baca panduan dan informasi lengkap dalam postingan ini.'}</p>
                    <span className="qcc-read-more">Baca postingan <b>↗</b></span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
        <section className="qcc-other-categories"><span>LANJUTKAN BELAJAR</span><div>{categories.filter((item) => item.slug !== category.slug).map((item) => <a href={`/kategori/${item.slug}`} key={item.slug}>{item.tag}<b>↗</b></a>)}</div></section>
      </main>
      <footer className="qcc-footer"><a href="/">QEON COMPANY</a><span>Technology education for everyone.</span></footer>
    </div>
  );
}
