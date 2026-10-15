import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './QeonCompanyLanding.css';

const categoryRoutes: Record<string, string> = {
  'Panduan Rakit PC': 'panduan-rakit-pc',
  'Komponen PC': 'komponen-pc',
  'Rekomendasi Rakitan': 'rekomendasi-rakitan',
  'Troubleshooting': 'troubleshooting',
  'Artikel': 'artikel',
};

export default function QeonCompanyNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [siteSettings, setSiteSettings] = useState<{site_name:string;tagline:string;logo_url:string;favicon_url:string}>({site_name:'Qeon Company',tagline:'Technology Education',logo_url:'',favicon_url:''});
  useEffect(() => { let active = true; supabase.from('website_settings').select('site_name,tagline,logo_url,favicon_url').eq('id','main').maybeSingle().then(({data}) => { if (active && data) setSiteSettings(prev => ({...prev,...data})); }); return () => { active = false; }; }, []);
  useEffect(() => { if (siteSettings.site_name) document.title = siteSettings.site_name; if (siteSettings.favicon_url) { let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]'); if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); } link.href = siteSettings.favicon_url; } }, [siteSettings]);
  const closeMenu = () => setMobileMenuOpen(false);
  // On category/article pages, section links must return to the homepage first.
  const homeHref = (section: string) => window.location.pathname === '/' ? `#${section}` : `/#${section}`;

  return (
    <header className="qco-header">
        <a className="qco-brand" href={homeHref('beranda')} onClick={closeMenu} aria-label="Qeon Company beranda">
          <span className="qco-brand-mark">{siteSettings.logo_url ? <img src={siteSettings.logo_url} alt="" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:8}} /> : (siteSettings.site_name.trim().charAt(0).toUpperCase() || "Q")}</span><span className="qco-brand-name">{siteSettings.site_name.split(" ")[0] || "Qeon"}<span>{siteSettings.site_name.split(" ").slice(1).join(" ")}</span><small>{siteSettings.tagline}</small></span>
        </a>
        <button className="qco-menu-toggle" type="button" aria-label="Buka navigasi" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(v => !v)}><span /><span /><span /></button>
        <nav className={`qco-nav ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Navigasi utama">
          <a href={homeHref('beranda')} onClick={closeMenu}>Beranda</a>
          <div className="qco-nav-dropdown">
            <button className="qco-nav-dropdown-trigger" type="button" aria-haspopup="true">
              Rakit PC <span className="qco-chevron">⌄</span>
            </button>
            <div className="qco-dropdown-panel">
              {([
                { tag: 'Panduan Rakit PC', description: 'Tutorial lengkap' },
                { tag: 'Komponen PC', description: 'Kenali hardware' },
                { tag: 'Rekomendasi Rakitan', description: 'Sesuai budget' },
                { tag: 'Troubleshooting', description: 'Solusi masalah PC' },
                { tag: 'Artikel', description: 'Tips dan berita' },
              ] as const).map((category) => (
                <div className="qco-dropdown-category" key={category.tag}>
                  <a className="qco-dropdown-category-link" href={`/kategori/${categoryRoutes[category.tag]}`} onClick={closeMenu}>
                    <span><b>{category.tag}</b><small>{category.description}</small></span>
                    {(category.tag === 'Rekomendasi Rakitan' || category.tag === 'Troubleshooting') ? <span className="qco-coming-soon">Segera hadir</span> : <span className="qco-dropdown-arrow">↗</span>}
                  </a>
                </div>
              ))}
            </div>
          </div>
          <a href={homeHref('segera-hadir')} onClick={closeMenu}>Segera hadir</a>
          <a href={homeHref('tentang')} onClick={closeMenu}>Tentang Kami</a>
          <a className="qco-nav-contact" href={homeHref('kontak')} onClick={closeMenu}>Kontak <span>↗</span></a>
        </nav>
      </header>
  );
}
