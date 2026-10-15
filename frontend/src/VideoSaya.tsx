import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import './VideoSaya.css';

type VideoStatus = 'draft' | 'published' | 'archived';

type VideoItem = {
  id: string;
  user_id: string;
  title: string;
  tiktok_url: string;
  notes: string | null;
  status: VideoStatus;
  created_at: string;
  updated_at: string;
};

type VideoForm = {
  title: string;
  tiktok_url: string;
  notes: string;
  status: VideoStatus;
};

type PreviewResponse = {
  status?: string;
  message?: string;
  error?: string;
  imageUrl?: string;
};

const emptyForm: VideoForm = {
  title: '',
  tiktok_url: '',
  notes: '',
  status: 'draft',
};

function isTikTokUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      (url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'))
    );
  } catch {
    return false;
  }
}

function statusLabel(status: VideoStatus) {
  if (status === 'published') return 'Siap digunakan';
  if (status === 'archived') return 'Arsip';
  return 'Draft';
}

/**
 * Mengambil URL thumbnail melalui backend Go. Gambar tidak diunduh atau disimpan
 * ke Supabase; hanya URL-nya yang dipakai sementara di state React.
 */
async function fetchTikTokThumbnail(tiktokUrl: string): Promise<string | null> {
  const apiBase = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  if (!apiBase) throw new Error('VITE_API_URL belum diatur di frontend/.env');

  const endpoint = `${apiBase}/api/affiliate/preview-image?url=${encodeURIComponent(tiktokUrl)}`;
  const response = await fetch(endpoint);
  const result: PreviewResponse = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || result.message || `Backend merespons HTTP ${response.status}`);
  }

  if (result.imageUrl && /^https?:\/\//i.test(result.imageUrl)) return result.imageUrl;
  return null;
}

function TikTokEmbed({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoId = url.match(/\/video\/(\d+)/)?.[1];

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

    // Script resmi TikTok memproses blockquote yang sudah dibuat di atas.
    const script = document.createElement('script');
    script.src = 'https://www.tiktok.com/embed.js';
    script.async = true;
    container.appendChild(script);

    return () => container.replaceChildren();
  }, [url, videoId]);

  if (!videoId) {
    return (
      <div className="videos-embed-fallback">
        <p>URL ini belum memiliki ID video yang dapat dibaca untuk embed. Gunakan URL video TikTok lengkap.</p>
        <a href={url} target="_blank" rel="noopener noreferrer">Buka video di TikTok ↗</a>
      </div>
    );
  }

  return <div ref={containerRef} className="videos-embed-container" />;
}

export default function VideoSaya({ userId }: { userId: string }) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | VideoStatus>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VideoForm>(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [thumbnailLoading, setThumbnailLoading] = useState(false);
  const [thumbnailMessage, setThumbnailMessage] = useState('');
  const [formThumbnail, setFormThumbnail] = useState<string | null>(null);
  const [thumbnailByVideoId, setThumbnailByVideoId] = useState<Record<string, string>>({});
  const [embedVideo, setEmbedVideo] = useState<VideoItem | null>(null);
  const previewRequestRef = useRef(0);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('affiliate_videos')
      .select('id,user_id,title,tiktok_url,notes,status,created_at,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (queryError) {
      setError(`Gagal memuat video: ${queryError.message}. Pastikan SQL video_library.sql sudah dijalankan di Supabase.`);
      setVideos([]);
    } else {
      setVideos((data ?? []) as VideoItem[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  // Thumbnail kartu diambil satu per satu agar setiap kartu langsung diperbarui
  // ketika hasilnya tersedia. URL hanya disimpan sementara di state React.
  useEffect(() => {
    let cancelled = false;
    setThumbnailByVideoId({});

    async function loadCardThumbnail(video: VideoItem) {
      try {
        const thumbnail = await fetchTikTokThumbnail(video.tiktok_url);
        if (!cancelled && thumbnail) {
          setThumbnailByVideoId((current) => ({ ...current, [video.id]: thumbnail }));
        }
      } catch {
        // Kartu memakai placeholder jika thumbnail tidak tersedia.
      }
    }

    videos.forEach((video) => void loadCardThumbnail(video));

    return () => {
      cancelled = true;
    };
  }, [videos]);

  // Saat URL pada form berubah, ambil thumbnail untuk pratinjau saja.
  useEffect(() => {
    const tiktokUrl = form.tiktok_url.trim();
    const requestId = ++previewRequestRef.current;
    setFormThumbnail(null);
    setThumbnailMessage('');

    if (!showForm || !isTikTokUrl(tiktokUrl)) {
      setThumbnailLoading(false);
      return;
    }

    setThumbnailLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const thumbnail = await fetchTikTokThumbnail(tiktokUrl);
        if (requestId !== previewRequestRef.current) return;
        if (thumbnail) {
          setFormThumbnail(thumbnail);
          setThumbnailMessage('Thumbnail berhasil diambil untuk pratinjau. Tidak disimpan ke Supabase.');
        } else {
          setThumbnailMessage('Thumbnail tidak tersedia dari TikTok. Video tetap bisa dibuka melalui embed.');
        }
      } catch (previewError) {
        if (requestId !== previewRequestRef.current) return;
        const message = previewError instanceof Error ? previewError.message : 'Terjadi kesalahan';
        setThumbnailMessage(`Thumbnail tidak dapat diambil: ${message}`);
      } finally {
        if (requestId === previewRequestRef.current) setThumbnailLoading(false);
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [form.tiktok_url, showForm]);

  const filteredVideos = useMemo(() => {
    const term = search.trim().toLowerCase();
    return videos.filter((video) => {
      const matchesSearch = `${video.title} ${video.tiktok_url} ${video.notes ?? ''}`.toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'all' || video.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [videos, search, statusFilter]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormThumbnail(null);
    setThumbnailMessage('');
    setError('');
    setNotice('');
    setShowForm(true);
  }

  function startEdit(video: VideoItem) {
    setEditingId(video.id);
    setForm({
      title: video.title,
      tiktok_url: video.tiktok_url,
      notes: video.notes ?? '',
      status: video.status,
    });
    setFormThumbnail(thumbnailByVideoId[video.id] ?? null);
    setThumbnailMessage('Thumbnail hanya untuk pratinjau dan tidak disimpan ke database.');
    setError('');
    setNotice('');
    setShowForm(true);
  }

  function closeForm() {
    previewRequestRef.current += 1;
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormThumbnail(null);
    setThumbnailLoading(false);
    setThumbnailMessage('');
  }

  async function saveVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    const title = form.title.trim();
    const tiktokUrl = form.tiktok_url.trim();

    if (!title) {
      setError('Judul video wajib diisi.');
      return;
    }
    if (!isTikTokUrl(tiktokUrl)) {
      setError('Masukkan URL TikTok yang valid, misalnya https://www.tiktok.com/@akun/video/ID.');
      return;
    }

    setSaving(true);
    // Sengaja tidak memasukkan thumbnail_url ke payload Supabase.
    const payload = {
      user_id: userId,
      title,
      tiktok_url: tiktokUrl,
      notes: form.notes.trim() || null,
      status: form.status,
      updated_at: new Date().toISOString(),
    };

    const result = editingId
      ? await supabase.from('affiliate_videos').update(payload).eq('id', editingId).eq('user_id', userId)
      : await supabase.from('affiliate_videos').insert(payload);

    if (result.error) {
      setError(`Video gagal disimpan: ${result.error.message}`);
      setSaving(false);
      return;
    }

    setNotice(editingId ? 'Video berhasil diperbarui.' : 'Video berhasil ditambahkan. Thumbnail tidak disimpan ke Supabase.');
    setSaving(false);
    closeForm();
    await loadVideos();
  }

  async function deleteVideo(video: VideoItem) {
    if (!window.confirm(`Hapus video "${video.title}" dari pustaka? Artikel yang sudah memiliki URL video tidak akan diubah.`)) return;

    setError('');
    setNotice('');
    const { error: deleteError } = await supabase
      .from('affiliate_videos')
      .delete()
      .eq('id', video.id)
      .eq('user_id', userId);

    if (deleteError) {
      setError(`Video gagal dihapus: ${deleteError.message}`);
      return;
    }
    setNotice('Video berhasil dihapus dari pustaka.');
    await loadVideos();
  }

  const counts = {
    all: videos.length,
    draft: videos.filter((video) => video.status === 'draft').length,
    published: videos.filter((video) => video.status === 'published').length,
    archived: videos.filter((video) => video.status === 'archived').length,
  };

  return (
    <section className="videos-page">
      <header className="videos-heading">
        <div>
          <p className="eyebrow">CONTENT WORKSPACE</p>
          <h1>Video Saya</h1>
          <p className="videos-description">Simpan dan kelola tautan video TikTok untuk digunakan kembali saat membuat konten affiliate.</p>
        </div>
        <button type="button" className="primary-button" onClick={startCreate}>+ Tambah Video</button>
      </header>

      {error && <div className="videos-alert videos-alert-error" role="alert">{error}</div>}
      {notice && <div className="videos-alert videos-alert-success" role="status">{notice}</div>}

      {embedVideo && (
        <div className="videos-embed-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEmbedVideo(null);
        }}>
          <section className="videos-embed-dialog" role="dialog" aria-modal="true" aria-label={`Embed ${embedVideo.title}`}>
            <div className="videos-embed-dialog-heading">
              <div>
                <h2>{embedVideo.title}</h2>
                <p>Video ditampilkan menggunakan embed resmi TikTok.</p>
              </div>
              <button type="button" className="videos-close" onClick={() => setEmbedVideo(null)} aria-label="Tutup embed">×</button>
            </div>
            <TikTokEmbed url={embedVideo.tiktok_url} />
            <div className="videos-embed-dialog-footer">
              <a href={embedVideo.tiktok_url} target="_blank" rel="noopener noreferrer">Buka di TikTok ↗</a>
              <button type="button" className="article-secondary-button" onClick={() => setEmbedVideo(null)}>Tutup</button>
            </div>
          </section>
        </div>
      )}

      <div className="videos-stats">
        <button type="button" className={statusFilter === 'all' ? 'video-stat active' : 'video-stat'} onClick={() => setStatusFilter('all')}><span>Total video</span><strong>{counts.all}</strong></button>
        <button type="button" className={statusFilter === 'published' ? 'video-stat active' : 'video-stat'} onClick={() => setStatusFilter('published')}><span>Siap digunakan</span><strong>{counts.published}</strong></button>
        <button type="button" className={statusFilter === 'draft' ? 'video-stat active' : 'video-stat'} onClick={() => setStatusFilter('draft')}><span>Draft</span><strong>{counts.draft}</strong></button>
        <button type="button" className={statusFilter === 'archived' ? 'video-stat active' : 'video-stat'} onClick={() => setStatusFilter('archived')}><span>Arsip</span><strong>{counts.archived}</strong></button>
      </div>

      {showForm && (
        <form className="videos-form" onSubmit={(event) => void saveVideo(event)}>
          <div className="videos-form-heading">
            <div>
              <h2>{editingId ? 'Edit video' : 'Tambah video baru'}</h2>
              <p>Thumbnail hanya pratinjau sementara. Yang disimpan hanya informasi video dan tautan TikTok.</p>
            </div>
            <button type="button" className="videos-close" onClick={closeForm} aria-label="Tutup form">×</button>
          </div>

          <label className="videos-field">
            <span>Judul video *</span>
            <input value={form.title} maxLength={180} required onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Contoh: Review RAM DDR5 untuk PC gaming" />
          </label>

          <label className="videos-field">
            <span>URL TikTok *</span>
            <input type="url" value={form.tiktok_url} required onChange={(event) => setForm((current) => ({ ...current, tiktok_url: event.target.value }))} placeholder="https://www.tiktok.com/@akun/video/..." />
            <small>Thumbnail dicoba diambil otomatis dan tidak disimpan ke Supabase.</small>
          </label>

          <div className="videos-thumbnail-preview-area">
            {thumbnailLoading && <p className="videos-thumbnail-message" role="status">Mengambil thumbnail dari TikTok...</p>}
            {!thumbnailLoading && thumbnailMessage && <p className="videos-thumbnail-message" role="status">{thumbnailMessage}</p>}
            {formThumbnail && <img className="videos-form-thumbnail" src={formThumbnail} alt="Pratinjau thumbnail TikTok" />}
          </div>

          <label className="videos-field">
            <span>Catatan (opsional)</span>
            <textarea rows={3} value={form.notes} maxLength={1000} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Catatan ide, produk yang dibahas, atau rencana konten..." />
          </label>

          <label className="videos-field">
            <span>Status</span>
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as VideoStatus }))}>
              <option value="draft">Draft</option>
              <option value="published">Siap digunakan</option>
              <option value="archived">Arsip</option>
            </select>
          </label>

          <div className="videos-form-actions">
            <button type="button" className="article-secondary-button" onClick={closeForm} disabled={saving}>Batal</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Video'}</button>
          </div>
        </form>
      )}

      <section className="videos-library panel">
        <div className="videos-library-heading">
          <div><h2>Pustaka video</h2><p>{filteredVideos.length} video ditampilkan</p></div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari judul atau URL..." aria-label="Cari video" />
        </div>

        {loading ? (
          <div className="videos-empty">Memuat pustaka video...</div>
        ) : filteredVideos.length === 0 ? (
          <div className="videos-empty">
            <div className="videos-empty-icon">▷</div>
            <strong>{search || statusFilter !== 'all' ? 'Video tidak ditemukan' : 'Belum ada video'}</strong>
            <span>{search || statusFilter !== 'all' ? 'Coba ubah kata kunci atau filter.' : 'Tambahkan tautan TikTok pertama untuk mulai membangun pustaka video.'}</span>
            {!search && statusFilter === 'all' && <button type="button" className="primary-button" onClick={startCreate}>+ Tambah Video</button>}
          </div>
        ) : (
          <div className="videos-grid">
            {filteredVideos.map((video) => (
              <article className="videos-card" key={video.id}>
                <button type="button" className="videos-card-media" onClick={() => setEmbedVideo(video)} aria-label={`Putar embed ${video.title}`}>
                  {thumbnailByVideoId[video.id] ? (
                    <img src={thumbnailByVideoId[video.id]} alt={`Thumbnail ${video.title}`} loading="lazy" onError={() => setThumbnailByVideoId((current) => {
                      const next = { ...current };
                      delete next[video.id];
                      return next;
                    })} />
                  ) : (
                    <div className="videos-thumbnail-placeholder"><span>♪</span><small>TIKTOK VIDEO</small></div>
                  )}
                  <span className="videos-play-badge">▶</span>
                </button>
                <div className="videos-card-content">
                  <div className={`videos-status status-${video.status}`}>{statusLabel(video.status)}</div>
                  <h3>{video.title}</h3>
                  {video.notes && <p className="videos-notes">{video.notes}</p>}
                  <time dateTime={video.updated_at}>Diperbarui {new Date(video.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
                  <div className="videos-card-actions">
                    <button type="button" className="video-action-primary" onClick={() => setEmbedVideo(video)}>
                      <span aria-hidden="true">▶</span> Lihat Video
                    </button>
                    <a className="video-action-external" href={video.tiktok_url} target="_blank" rel="noopener noreferrer">
                      <span aria-hidden="true">↗</span> TikTok
                    </a>
                    <button type="button" className="video-action-edit" onClick={() => startEdit(video)}>
                      <span aria-hidden="true">✎</span> Edit
                    </button>
                    <button type="button" className="video-action-delete" onClick={() => void deleteVideo(video)}>
                      <span aria-hidden="true">×</span> Hapus
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}