import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './QeonCompanyLanding.css';

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

const categoryRoutes: Record<string, string> = {
  'Panduan Rakit PC': 'panduan-rakit-pc',
  'Komponen PC': 'komponen-pc',
  'Rekomendasi Rakitan': 'rekomendasi-rakitan',
  'Troubleshooting': 'troubleshooting',
  'Artikel': 'artikel',
};

const learningTracks = [
  { number: '01', icon: '▦', title: 'Kenali komponen PC', text: 'Pahami fungsi prosesor, motherboard, RAM, GPU, storage, PSU, dan casing sebelum memilih.' },
  { number: '02', icon: '⌘', title: 'Pilih komponen yang cocok', text: 'Belajar mencocokkan socket, generasi, ukuran, daya, dan kebutuhan penggunaan.' },
  { number: '03', icon: '↗', title: 'Rakit dengan aman', text: 'Ikuti langkah perakitan, manajemen kabel, pengecekan awal, dan proses boot pertama.' },
];

export default function QeonCompanyLanding() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [siteSettings, setSiteSettings] = useState<{site_name:string;tagline:string;logo_url:string;favicon_url:string;contact_email:string;footer_text:string}>({site_name:'Qeon Company',tagline:'Technology Education',logo_url:'',favicon_url:'',contact_email:'hello@qeoncompany.com',footer_text:'Edukasi teknologi.'});
  useEffect(() => { let active = true; supabase.from('website_settings').select('site_name,tagline,logo_url,favicon_url,contact_email,footer_text').eq('id','main').maybeSingle().then(({data}) => { if (active && data) setSiteSettings(prev => ({...prev,...data})); }); return () => { active = false; }; }, []);
  useEffect(() => { if (siteSettings.site_name) document.title = siteSettings.site_name; if (siteSettings.favicon_url) { let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]'); if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); } link.href = siteSettings.favicon_url; } }, [siteSettings]);

  useEffect(() => {
    let active = true;
    async function loadArticles() {
      const { data, error } = await supabase
        .from('articles')
        .select('id,title,slug,excerpt,tags,cover_image_url,published_at,created_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(6);
      if (!active) return;
      if (error) console.error('Gagal memuat artikel Qeon Company:', error.message);
      setArticles((data ?? []) as Article[]);
      setLoadingArticles(false);
    }
    void loadArticles();
    return () => { active = false; };
  }, []);

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <div className="qco-site">
      <header className="qco-header">
        <a className="qco-brand" href="#beranda" onClick={closeMenu} aria-label="Qeon Company beranda">
          <span className="qco-brand-mark">{siteSettings.logo_url ? <img src={siteSettings.logo_url} alt="" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:8}} /> : (siteSettings.site_name.trim().charAt(0).toUpperCase() || "Q")}</span><span className="qco-brand-name">{siteSettings.site_name.split(" ")[0] || "Qeon"}<span>{siteSettings.site_name.split(" ").slice(1).join(" ")}</span><small>{siteSettings.tagline}</small></span>
        </a>
        <button className="qco-menu-toggle" type="button" aria-label="Buka navigasi" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(v => !v)}><span /><span /><span /></button>
        <nav className={`qco-nav ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Navigasi utama">
          <a href="#beranda" onClick={closeMenu}>Beranda</a>
          <div className="qco-nav-dropdown">
            <button className="qco-nav-dropdown-trigger" type="button" aria-haspopup="true">
              Rakit PC <span className="qco-chevron">⌄</span>
            </button>
            <div className="qco-dropdown-panel">
              {([
                { tag: 'Panduan Rakit PC', description: 'Tutorial lengkap', fallback: '#belajar' },
                { tag: 'Komponen PC', description: 'Kenali hardware', fallback: '#topik' },
                { tag: 'Rekomendasi Rakitan', description: 'Sesuai budget', fallback: '#segera-hadir' },
                { tag: 'Troubleshooting', description: 'Solusi masalah PC', fallback: '#segera-hadir' },
                { tag: 'Artikel', description: 'Tips dan berita', fallback: '#artikel' },
              ] as const).map((category) => {
                const matching = articles.filter((article) => (article.tags ?? []).includes(category.tag)).slice(0, 3);
                return (
                  <div className="qco-dropdown-category" key={category.tag}>
                    <a className="qco-dropdown-category-link" href={`/kategori/${categoryRoutes[category.tag]}`} onClick={closeMenu}>
                      <span><b>{category.tag}</b><small>{category.description}</small></span>
                      {matching.length ? <span className="qco-dropdown-arrow">↗</span> : (category.tag === 'Rekomendasi Rakitan' || category.tag === 'Troubleshooting') ? <span className="qco-coming-soon">Segera hadir</span> : <span className="qco-dropdown-arrow">↗</span>}
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
          <a href="#segera-hadir" onClick={closeMenu}>Segera hadir</a>
          <a href="#tentang" onClick={closeMenu}>Tentang Kami</a>
          <a className="qco-nav-contact" href="#kontak" onClick={closeMenu}>Kontak <span>↗</span></a>
        </nav>
      </header>

      <main>
        <section className="qco-hero" id="beranda">
          <div className="qco-hero-grid" aria-hidden="true" />
          <div className="qco-hero-content">
            <div className="qco-eyebrow"><span className="qco-pulse" /> BELAJAR RAKIT PC DARI DASAR</div>
            <h1>Rakit PC dengan<br /><em>lebih percaya diri.</em></h1>
            <p>Mulai dari mengenal komponen, memilih part yang kompatibel, sampai merakit PC pertamamu. Panduan teknologi yang jelas untuk pemula maupun enthusiast.</p>
            <div className="qco-hero-actions"><a className="qco-button qco-button-primary" href="#belajar">Mulai Belajar <span>↘</span></a><a className="qco-button qco-button-quiet" href="#artikel">Baca Artikel <span>→</span></a></div>
            <div className="qco-hero-note"><span className="qco-note-line" /> Pahami komponennya. Rencanakan rakitannya. Bangun PC-mu.</div>
          </div>
          <div className="qco-hero-art" aria-label="Ilustrasi komputer rakitan">
            <div className="qco-orbit qco-orbit-one" /><div className="qco-orbit qco-orbit-two" />
            <div className="qco-pc-case"><div className="qco-case-top" /><div className="qco-case-glass"><div className="qco-fan qco-fan-one" /><div className="qco-fan qco-fan-two" /><div className="qco-fan qco-fan-three" /><div className="qco-gpu" /><div className="qco-board-line" /></div><div className="qco-case-front"><i /><i /><i /></div><div className="qco-case-foot" /></div>
            <div className="qco-float-card qco-card-top"><span className="qco-card-icon">⌘</span><span><b>PC Components</b><small>Know every part</small></span></div>
            <div className="qco-float-card qco-card-bottom"><span className="qco-card-icon qco-card-icon-green">✓</span><span><b>Build smart</b><small>Compatibility first</small></span></div>
          </div>
          <div className="qco-hero-bottom"><span>QEON / LEARN</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>

        <section className="qco-learning section-wrap" id="belajar">
          <div className="qco-section-heading"><div><div className="qco-section-kicker">JALUR BELAJAR</div><h2>Dari bingung jadi <em>paham.</em></h2></div><p>Ikuti langkah sederhana untuk memahami proses membangun PC, tanpa harus menguasai semuanya sejak hari pertama.</p></div>
          <div className="qco-track-grid">{learningTracks.map(track => <article className="qco-track-card" key={track.number}><div className="qco-track-top"><span>{track.number}</span><b>{track.icon}</b></div><h3>{track.title}</h3><p>{track.text}</p><a href="#artikel">Pelajari topik <span>↗</span></a></article>)}</div>
        </section>

        <section className="qco-topics" id="topik"><div className="qco-topics-inner"><div className="qco-section-kicker">MATERI UTAMA</div><h2>Kenali bagian penting<br />dari sebuah <em>PC.</em></h2><p>Temukan panduan seputar hardware dan proses perakitan yang disusun agar mudah dipahami.</p><div className="qco-topic-list"><span>01 / CPU & Motherboard</span><span>02 / RAM & Storage</span><span>03 / GPU & PSU</span><span>04 / Airflow & Cooling</span><span>05 / Perakitan & Troubleshooting</span></div></div><div className="qco-chip-board" aria-hidden="true"><div className="qco-chip"><span>QEON</span><b>PC</b><small>BUILD / LEARN / REPEAT</small></div><i className="qco-chip-node node-one"/><i className="qco-chip-node node-two"/><i className="qco-chip-node node-three"/><i className="qco-chip-node node-four"/></div></section>

        <section className="qco-articles section-wrap" id="artikel"><div className="qco-section-heading"><div><div className="qco-section-kicker">PANDUAN DAN WAWASAN</div><h2>Artikel <em>terbaru.</em></h2></div><p>Baca tips, tutorial, dan pembahasan komponen PC dari tim Qeon Company.</p></div>
          {loadingArticles ? <div className="qco-empty-state">Menyiapkan artikel…</div> : articles.length === 0 ? <div className="qco-empty-state"><span>⌘</span><h3>Materi baru segera hadir.</h3><p>Artikel yang sudah diterbitkan melalui dashboard admin akan muncul di sini.</p></div> : <div className="qco-article-grid">{articles.map((article, index) => <article className="qco-article-card" key={article.id}><a className="qco-article-image" href={`/artikel/${encodeURIComponent(article.slug)}`} aria-label={`Baca ${article.title}`}>{article.cover_image_url ? <img src={article.cover_image_url} alt={article.title} loading="lazy"/> : <div className={`qco-cover-placeholder tone-${index % 3}`}><span>Q.</span><small>QEON PC JOURNAL</small></div>}<span className="qco-article-number">0{index + 1}</span></a><div className="qco-article-meta"><span>PC EDUCATION</span><span>{new Date(article.published_at || article.created_at).toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric'})}</span></div><h3><a href={`/artikel/${encodeURIComponent(article.slug)}`}>{article.title}</a></h3>{article.excerpt && <p>{article.excerpt}</p>}<a className="qco-read-more" href={`/artikel/${encodeURIComponent(article.slug)}`}>Baca artikel <span>↗</span></a></article>)}</div>}
        </section>

        <section className="qco-coming-section" id="segera-hadir"><span className="qco-coming-label">BERIKUTNYA DI QEON COMPANY</span><h2>Lebih banyak panduan sedang <em>disiapkan.</em></h2><p>Rekomendasi rakitan sesuai budget dan panduan troubleshooting akan hadir bertahap.</p><span className="qco-coming-pill">SEGERA HADIR</span></section>

        <section className="qco-about" id="tentang"><div className="qco-about-symbol"><span>Q</span><i/><i/><i/></div><div className="qco-about-copy"><div className="qco-section-kicker">TENTANG QEON COMPANY</div><h2>Teknologi lebih mudah<br />saat kita <em>memahaminya.</em></h2><p>Qeon Company hadir untuk membantu lebih banyak orang memahami dunia PC dan teknologi. Kami menyajikan edukasi yang praktis, bertahap, dan ramah pemula agar siapa pun bisa belajar memilih komponen dan merakit komputer dengan lebih terarah.</p><a className="qco-text-link" href="#kontak">Kenali komunitas kami <span>↗</span></a></div><div className="qco-about-index">Q / 01</div></section>

        <section className="qco-contact section-wrap" id="kontak"><div className="qco-contact-copy"><div className="qco-section-kicker">TERHUBUNG DENGAN KAMI</div><h2>Punya pertanyaan<br />seputar <em>PC?</em></h2><p>Ingin mengusulkan topik, bertanya tentang materi, atau menjajaki kolaborasi edukasi teknologi? Hubungi Qeon Company.</p></div><div className="qco-contact-panel"><span className="qco-contact-mark">↗</span><small>LET'S BUILD KNOWLEDGE</small><h3>Belajar lebih jauh bersama Qeon</h3><p>Kirim pertanyaan atau ide materi melalui email resmi perusahaan.</p><a href={`mailto:${siteSettings.contact_email || "hello@qeoncompany.com"}`} className="qco-button qco-button-primary">Hubungi Qeon <span>↗</span></a><small className="qco-contact-hint">Ganti email contoh ini dengan kontak resmi Qeon Company.</small></div></section>
      </main>
      <footer className="qco-footer"><a className="qco-footer-brand" href="#beranda">QEON<span> COMPANY</span></a><span>© {new Date().getFullYear()} {siteSettings.site_name} · {siteSettings.footer_text}</span><a href="#beranda">Kembali ke atas ↑</a></footer>
    </div>
  );
}
