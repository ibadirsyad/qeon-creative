import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './lib/supabase';
import AuthPage from './AuthPage';
import AffiliateProducts from './AffiliateProducts';
import Artikel from './Artikel';
import PublicArticle from './PublicArticle';
import QeonCompanyLanding from './QeonCompanyLanding';
import QeonCompanyCategoryPage from './QeonCompanyCategoryPage';
import WebsiteSettings from './WebsiteSettings';
import './App.css';

type UserProfile = {
  display_name: string;
  avatar_url: string | null;
  role: 'admin' | 'affiliator';
};

type WebsiteBranding = {
  site_name: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  footer_text: string;
};

const defaultBranding: WebsiteBranding = {
  site_name: 'Qeon Company',
  tagline: 'Technology Education',
  logo_url: '',
  favicon_url: '',
  footer_text: 'Edukasi teknologi untuk semua.',
};

type RecentProduct = {
  id: string;
  name: string;
  created_at: string;
};

const menuItems = [
  { icon: '⌂', label: 'Dashboard' },
  { icon: '↗', label: 'Link Affiliate' },
  { icon: '▤', label: 'Artikel' },
  { icon: '▷', label: 'Video Saya' },
  { icon: '▧', label: 'Media Library' },
  { icon: '⚙', label: 'Pengaturan Website' },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activePage, setActivePage] = useState('Dashboard');
  const [websiteBranding, setWebsiteBranding] = useState<WebsiteBranding>(defaultBranding);
  const [isAdminPath, setIsAdminPath] = useState(() => window.location.pathname.replace(/\/$/, '') === '/admin');
  const [categorySlug, setCategorySlug] = useState<string | null>(() => { const match = window.location.pathname.match(/^\/kategori\/([^/]+)\/?$/); return match ? decodeURIComponent(match[1]) : null; });
  const [publicSlug, setPublicSlug] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/artikel\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  useEffect(() => {
    const syncPublicRoute = () => {
      const pathname = window.location.pathname;
      const match = pathname.match(/^\/artikel\/([^/]+)\/?$/);
      setPublicSlug(match ? decodeURIComponent(match[1]) : null);
      const categoryMatch = pathname.match(/^\/kategori\/([^/]+)\/?$/);
      setCategorySlug(categoryMatch ? decodeURIComponent(categoryMatch[1]) : null);
      setIsAdminPath(pathname.replace(/\/$/, '') === '/admin');
    };
    window.addEventListener('popstate', syncPublicRoute);
    return () => window.removeEventListener('popstate', syncPublicRoute);
  }, []);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [apiStatus, setApiStatus] = useState<
    'checking' | 'connected' | 'error'
  >('checking');
  const [apiMessage, setApiMessage] = useState('Memeriksa koneksi backend...');

  // Statistik dashboard
  const [productCount, setProductCount] = useState<number | null>(null);
  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  // Memuat identitas website untuk branding dashboard admin.
  useEffect(() => {
    let active = true;
    const loadWebsiteBranding = async () => {
      const { data, error } = await supabase
        .from('website_settings')
        .select('site_name, tagline, logo_url, favicon_url, footer_text')
        .eq('id', 'main')
        .maybeSingle();
      if (!active) return;
      if (error) {
        // Pengaturan belum dibuat atau belum dapat dibaca: gunakan nilai default.
        console.warn('Pengaturan branding website belum dapat dimuat:', error.message);
        return;
      }
      if (data) {
        const next = { ...defaultBranding, ...data } as WebsiteBranding;
        setWebsiteBranding(next);
        if (next.favicon_url) {
          let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = next.favicon_url;
        }
      }
    };
    void loadWebsiteBranding();
    const refresh = () => { void loadWebsiteBranding(); };
    window.addEventListener('qeon-site-settings-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      active = false;
      window.removeEventListener('qeon-site-settings-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Memeriksa sesi login Supabase.
  useEffect(() => {
    let active = true;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        console.error('Gagal membaca sesi:', error.message);
      }

      setSession(data.session);
      setAuthReady(true);
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Memeriksa koneksi backend Go.
  useEffect(() => {
    const controller = new AbortController();

    async function checkBackend() {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error('VITE_API_URL belum diatur');

        const response = await fetch(`${apiUrl}/api/health`, {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data: { status: string; message: string } =
          await response.json();

        if (data.status !== 'ok') {
          throw new Error('Status backend tidak valid');
        }

        setApiStatus('connected');
        setApiMessage(data.message);
      } catch (error) {
        if (controller.signal.aborted) return;

        setApiStatus('error');
        setApiMessage(
          error instanceof Error
            ? error.message
            : 'Backend tidak dapat dihubungi',
        );
      }
    }

    void checkBackend();
    return () => controller.abort();
  }, []);

  // Mengambil profil pengguna yang sedang login.
  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!session?.user) {
        setProfile(null);
        setProfileError('');
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      setProfileError('');

      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setProfile(null);
        setProfileError(error.message);
      } else {
        setProfile(data as UserProfile | null);
      }

      setProfileLoading(false);
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [session?.user.id]);

  // Mengambil statistik dan produk terbaru milik pengguna yang login.
  useEffect(() => {
    let active = true;

    async function loadDashboardStats() {
      if (!session?.user?.id) {
        setProductCount(null);
        setRecentProducts([]);
        setStatsError('');
        setStatsLoading(false);
        return;
      }

      setStatsLoading(true);
      setStatsError('');

      const { count, error: countError } = await supabase
        .from('affiliate_products')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id);

      if (!active) return;

      if (countError) {
        setProductCount(null);
        setStatsError(countError.message);
        setRecentProducts([]);
        setStatsLoading(false);
        return;
      }

      setProductCount(count ?? 0);

      const { data, error: recentError } = await supabase
        .from('affiliate_products')
        .select('id, name, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!active) return;

      if (recentError) {
        setStatsError(recentError.message);
        setRecentProducts([]);
      } else {
        setRecentProducts((data ?? []) as RecentProduct[]);
      }

      setStatsLoading(false);
    }

    void loadDashboardStats();

    return () => {
      active = false;
    };
  }, [session?.user.id, activePage]);

  
  // Sinkronisasi judul tab dan favicon dari pengaturan website
  useEffect(() => {
    let active = true;

    async function applyWebsiteSettings() {
      const { data, error } = await supabase
        .from('website_settings')
        .select('site_name, favicon_url')
        .eq('id', 'main')
        .maybeSingle();

      if (!active || error || !data) return;

      document.title = data.site_name?.trim() || 'Qeon Company';

      if (data.favicon_url?.trim()) {
        let favicon = document.querySelector<HTMLLinkElement>(
          'link[rel="icon"]'
        );

        if (!favicon) {
          favicon = document.createElement('link');
          favicon.rel = 'icon';
          document.head.appendChild(favicon);
        }

        favicon.href = data.favicon_url;
      }
    }

    void applyWebsiteSettings();

    const handleSettingsUpdated = () => {
      void applyWebsiteSettings();
    };

    window.addEventListener(
      'website-settings-updated',
      handleSettingsUpdated
    );

    return () => {
      active = false;
      window.removeEventListener(
        'website-settings-updated',
        handleSettingsUpdated
      );
    };
  }, []);

  if (publicSlug) {
    return <PublicArticle slug={publicSlug} />;
  }

  if (categorySlug) {
    return <QeonCompanyCategoryPage slug={categorySlug} />;
  }

  // Halaman publik Qeon Company ditampilkan di root (/).
  // Dashboard dan login admin tetap tersedia melalui (/admin).
  if (!isAdminPath) {
    return <QeonCompanyLanding />;
  }

  if (!authReady) {
    return <div className="auth-loading">Memeriksa sesi login...</div>;
  }

  if (!session) {
    return <AuthPage />;
  }

  const displayName =
    profile?.display_name?.trim() || session.user.email || 'Affiliator';
  const avatarInitial = displayName.charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
        >
          {websiteBranding.logo_url ? (
            <img className="admin-brand-logo" src={websiteBranding.logo_url} alt={websiteBranding.site_name} />
          ) : (
            <span className="brand-icon">{websiteBranding.site_name.trim().charAt(0).toUpperCase() || 'Q'}</span>
          )}
          <span className="admin-brand-copy">
            <span className="admin-brand-name">{websiteBranding.site_name || 'Qeon Company'}</span>
            <span className="admin-brand-tagline">{websiteBranding.tagline || 'Technology Education'}</span>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <a className="nav-item" href="/" style={{ margin: "0 12px 12px" }}>↗ <span>Lihat Website Publik</span></a>

        <nav className="navigation">
          {menuItems.filter((item) => item.label !== 'Pengaturan Website' || profile?.role === 'admin').map((item) => (
            <a
              href={`#${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              key={item.label}
              className={`nav-item ${activePage === item.label ? 'active' : ''}`}
              onClick={(event) => {
                event.preventDefault();
                setActivePage(item.label);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-avatar">{avatarInitial}</div>
          <div className="profile-info">
            <strong>{profileLoading ? 'Memuat profil...' : displayName}</strong>
            <span>{session.user.email}</span>
          </div>
          <span className="profile-menu">···</span>
        </div>
      </aside>

      {/* AREA KONTEN */}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace / {activePage}</div>
          <div className="topbar-right">
            <span
              className={`status-dot ${apiStatus === 'error' ? 'status-error' : ''}`}
            />
            <span title={apiMessage}>
              {apiStatus === 'checking'
                ? 'Memeriksa backend...'
                : apiStatus === 'connected'
                  ? 'Backend terhubung'
                  : 'Backend terputus'}
            </span>
            <button
              type="button"
              className="logout-button"
              onClick={async () => {
                const { error } = await supabase.auth.signOut();
                if (error) console.error('Gagal logout:', error.message);
              }}
            >
              Keluar
            </button>
          </div>
        </header>

        <div className="page-content">
          {activePage === 'Pengaturan Website' && profile?.role !== 'admin' ? (
            <section className="panel coming-soon">
              <h2>Akses dibatasi</h2>
              <p>Pengaturan Website hanya tersedia untuk akun admin. Pastikan role akunmu di tabel profiles adalah admin, lalu login kembali.</p>
              <button type="button" className="primary-button" onClick={() => setActivePage('Dashboard')}>Kembali ke Dashboard</button>
            </section>
          ) : activePage === 'Pengaturan Website' ? (
            <WebsiteSettings />
          ) : activePage === 'Link Affiliate' ? (
            <AffiliateProducts userId={session.user.id} />
          ) : activePage === 'Artikel' ? (
            <Artikel userId={session.user.id} />
          ) : activePage === 'Dashboard' ? (
            <>
              <section className="welcome-section">
                <div>
                  <p className="eyebrow">{websiteBranding.site_name.toUpperCase()} WORKSPACE</p>
                  <h1>Selamat datang! 👋</h1>
                  <p className="welcome-description">
                    Kelola produk affiliate dan buat kontenmu dari satu tempat.
                  </p>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setActivePage('Artikel')}
                >
                  + Buat Artikel
                </button>
              </section>

              {profileError && (
                <div role="alert" className="profile-error">
                  Profil gagal dimuat: {profileError}
                </div>
              )}

              {statsError && (
                <div role="alert" className="profile-error">
                  Statistik gagal dimuat: {statsError}
                </div>
              )}

              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Link Affiliate</span>
                    <span className="stat-icon purple">↗</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActivePage('Link Affiliate')}
                  >
                    Kelola Produk
                  </button>
                  <strong className="stat-number">
                    {statsLoading ? '…' : productCount ?? '—'}
                  </strong>
                  <span className="stat-caption">Produk tersimpan</span>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Total Artikel</span>
                    <span className="stat-icon blue">▤</span>
                  </div>
                  <strong className="stat-number">0</strong>
                  <span className="stat-caption">Draft dan publikasi</span>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Video Saya</span>
                    <span className="stat-icon orange">▷</span>
                  </div>
                  <strong className="stat-number">0</strong>
                  <span className="stat-caption">Video tersimpan</span>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Artikel Terbit</span>
                    <span className="stat-icon green">✓</span>
                  </div>
                  <strong className="stat-number">0</strong>
                  <span className="stat-caption">Artikel publik</span>
                </div>
              </section>

              <section className="content-grid">
                <div className="panel quick-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Mulai dari sini</h2>
                      <p>Siapkan ruang kerja affiliate kamu.</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="quick-item"
                    onClick={() => setActivePage('Link Affiliate')}
                  >
                    <div className="quick-icon purple">↗</div>
                    <div className="quick-text">
                      <strong>Tambahkan link affiliate</strong>
                      <span>
                        Simpan link produk TikTok untuk digunakan dalam artikel.
                      </span>
                    </div>
                    <span className="quick-arrow">→</span>
                  </button>

                  <button
                    type="button"
                    className="quick-item"
                    onClick={() => setActivePage('Artikel')}
                  >
                    <div className="quick-icon blue">▤</div>
                    <div className="quick-text">
                      <strong>Buat artikel pertama</strong>
                      <span>Susun teks, gambar, video, dan produk affiliate.</span>
                    </div>
                    <span className="quick-arrow">→</span>
                  </button>

                  <button
                    type="button"
                    className="quick-item"
                    onClick={() => setActivePage('Video Saya')}
                  >
                    <div className="quick-icon orange">▷</div>
                    <div className="quick-text">
                      <strong>Kelola video</strong>
                      <span>Siapkan video promosi untuk konten kamu.</span>
                    </div>
                    <span className="quick-arrow">→</span>
                  </button>
                </div>

                <div className="panel activity-panel">
                  <h2>Aktivitas terbaru</h2>
                  <p>Produk affiliate yang terakhir kamu tambahkan.</p>

                  {statsLoading ? (
                    <div className="empty-state">
                      <span>Memuat aktivitas...</span>
                    </div>
                  ) : recentProducts.length > 0 ? (
                    <div className="recent-products-list">
                      {recentProducts.map((product) => (
                        <div className="recent-product-item" key={product.id}>
                          <div className="empty-icon">↗</div>
                          <div className="quick-text">
                            <strong>{product.name}</strong>
                            <span>
                              Ditambahkan{' '}
                              {new Date(product.created_at).toLocaleDateString(
                                'id-ID',
                                {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                },
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => setActivePage('Link Affiliate')}
                      >
                        Lihat semua produk
                      </button>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">▤</div>
                      <strong>Belum ada aktivitas</strong>
                      <span>Mulai dengan menambahkan link affiliate.</span>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => setActivePage('Link Affiliate')}
                      >
                        Tambahkan produk
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <footer className="page-footer">
                {websiteBranding.footer_text || websiteBranding.site_name} <span>•</span> Dashboard Admin
              </footer>
            </>
          ) : (
            <section className="panel coming-soon">
              <h2>{activePage}</h2>
              <p>
                Fitur ini belum dibuat. Kita akan membangunnya pada tahap
                pengembangan berikutnya.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={() => setActivePage('Dashboard')}
              >
                Kembali ke Dashboard
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
