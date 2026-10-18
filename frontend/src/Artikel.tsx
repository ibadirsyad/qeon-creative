import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import './Artikel.css';

type ArticleStatus = 'draft' | 'published';
type BlockType = 'heading' | 'text' | 'list' | 'affiliate' | 'image' | 'tiktok' | 'quote' | 'divider';

type ArticleBlock = {
  id: string;
  type: BlockType;
  text?: string;
  level?: 2 | 3;
  items?: string[];
  productIds?: string[];
  url?: string;
  caption?: string;
  imageSize?: 'small' | 'medium' | 'large' | 'full';
  imageAlign?: 'left' | 'center' | 'right';
};

type Article = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  status: ArticleStatus;
  created_at: string;
  updated_at: string;
};


type Product = {
  id: string;
  name: string;
  affiliate_url: string;
  image_url: string | null;
  price: number | null;
  currency: string | null;
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const emptyBlocks = (): ArticleBlock[] => [{ id: newId(), type: 'text', text: '' }];

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

function parseBlocks(content: string): ArticleBlock[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every((b) => b && typeof b === 'object' && 'type' in b)) {
      return parsed as ArticleBlock[];
    }
  } catch {
    // Artikel lama berisi teks biasa, tampilkan sebagai blok teks.
  }
  return content ? [{ id: newId(), type: 'text', text: content }] : emptyBlocks();
}

function blockLabel(type: BlockType) {
  const labels: Record<BlockType, string> = {
    heading: 'Heading', text: 'Teks', list: 'List', affiliate: 'Produk Affiliate',
    image: 'Gambar', tiktok: 'Video TikTok', quote: 'Kutipan', divider: 'Pemisah',
  };
  return labels[type];
}


function getTikTokEmbedUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/\/video\/(\d+)/);
    if (match) return `https://www.tiktok.com/embed/v2/${match[1]}`;
    const embedMatch = parsed.pathname.match(/\/embed\/v2\/(\d+)/);
    if (embedMatch) return `https://www.tiktok.com/embed/v2/${embedMatch[1]}`;
    return null;
  } catch {
    return null;
  }
}

function InlineFormattedText({ text }: { text: string }) {
  // Supports safe inline **bold**, *italic*, and [label](https://url) syntax.
  const pattern = /(\\*\\*.+?\\*\\*|\\*[^*\\n]+\\*|\\[[^\]]+\\]\(https?:\/\/[^)\s]+\))/g;
  const parts = text.split(pattern);
  return <>{parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return <span key={index}>{part}</span>;
  })}</>;
}

export default function Artikel({ userId }: { userId: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [cover, setCover] = useState('');
  const [status, setStatus] = useState<ArticleStatus>('draft');
  const [blocks, setBlocks] = useState<ArticleBlock[]>(emptyBlocks);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadProgressMessage, setUploadProgressMessage] = useState('');
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    const [a, p] = await Promise.all([
      supabase.from('articles')
        .select('id,title,slug,excerpt,content,cover_image_url,status,created_at,updated_at')
        .eq('user_id', userId).order('updated_at', { ascending: false }),
      supabase.from('affiliate_products')
        .select('id,name,affiliate_url,image_url,price,currency')
        .eq('user_id', userId).order('created_at', { ascending: false }),
    ]);
    if (a.error) setError(`Gagal memuat artikel: ${a.error.message}`);
    setArticles((a.data ?? []) as Article[]);
    if (p.error) setError((current) => current ? `${current} | Produk: ${p.error.message}` : `Gagal memuat produk: ${p.error.message}`);
    setProducts((p.data ?? []) as Product[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void loadData(); }, [loadData]);

  function resetEditor() {
    setEditingId(null); setTitle(''); setSlug(''); setExcerpt(''); setCover('');
    setStatus('draft'); setBlocks(emptyBlocks()); setPreview(false);
  }

  function newArticle() {
    resetEditor(); setError(''); setNotice(''); setShowEditor(true);
  }

  function updateBlock(id: string, patch: Partial<ArticleBlock>) {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } : block));
  }

  function addBlock(type: BlockType) {
    const block: ArticleBlock = { id: newId(), type };
    if (type === 'text' || type === 'heading' || type === 'quote') block.text = '';
    if (type === 'list') block.items = [''];
    if (type === 'affiliate') block.productIds = [];
    if (type === 'image' || type === 'tiktok') block.url = '';
    setBlocks((current) => [...current, block]);
  }

  function removeBlock(id: string) {
    setBlocks((current) => current.filter((block) => block.id !== id));
  }

  function moveBlock(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setBlocks((current) => {
      const from = current.findIndex((b) => b.id === sourceId);
      const to = current.findIndex((b) => b.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function openEdit(article: Article) {
    setError(''); setNotice('');
    setEditingId(article.id);
    setTitle(article.title); setSlug(article.slug);
    setExcerpt(article.excerpt ?? ''); setCover(article.cover_image_url ?? '');
    setStatus(article.status); setBlocks(parseBlocks(article.content));
    setPreview(false); setShowEditor(true);
  }


  async function uploadBlockImage(blockId: string, file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran gambar maksimal 5 MB.');
      return;
    }

    setError('');
    setUploadProgressMessage('');
    setUploadingBlockId(blockId);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : 'jpg';
    const path = `${userId}/${Date.now()}-${newId()}.${safeExtension}`;
    const { error: uploadError } = await supabase.storage
      .from('article-media')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });

    if (uploadError) {
      setError(`Upload gambar gagal: ${uploadError.message}. Periksa bucket article-media dan policy Storage.`);
      setUploadingBlockId(null);
      return;
    }

    const { data } = supabase.storage.from('article-media').getPublicUrl(path);
    updateBlock(blockId, { url: data.publicUrl });
    setUploadProgressMessage('Gambar berhasil diunggah.');
    setUploadingBlockId(null);
  }


  async function uploadCoverImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('File sampul harus berupa gambar.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran gambar sampul maksimal 5 MB.');
      return;
    }

    setError('');
    setUploadProgressMessage('');
    setUploadingCover(true);

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : 'jpg';
    const path = `${userId}/covers/${Date.now()}-${newId()}.${safeExtension}`;

    const { error: uploadError } = await supabase.storage
      .from('article-media')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      setError(`Upload gambar sampul gagal: ${uploadError.message}. Periksa bucket article-media dan policy Storage.`);
      setUploadingCover(false);
      return;
    }

    const { data } = supabase.storage.from('article-media').getPublicUrl(path);
    setCover(data.publicUrl);
    setUploadProgressMessage('Gambar sampul berhasil diunggah.');
    setUploadingCover(false);
  }

  function wrapSelectedText(blockId: string, prefix: string, suffix = prefix) {
    const textarea = textareas.current[blockId];
    const block = blocks.find((item) => item.id === blockId);
    if (!textarea || !block) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = block.text ?? '';
    const selected = current.slice(start, end) || 'teks';
    const next = current.slice(0, start) + prefix + selected + suffix + current.slice(end);
    updateBlock(blockId, { text: next });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  async function saveArticle(nextStatus: ArticleStatus = status) {
    const cleanTitle = title.trim();
    const cleanSlug = slugify(slug || title);
    if (!cleanTitle) return setError('Judul artikel wajib diisi.');
    if (!cleanSlug) return setError('Slug artikel tidak valid.');
    if (blocks.some((b) => ['text', 'heading', 'quote'].includes(b.type) && !b.text?.trim())) {
      return setError('Isi blok teks, heading, atau kutipan yang masih kosong, atau hapus blok tersebut.');
    }
    if (blocks.some((b) => b.type === 'affiliate' && !(b.productIds?.length))) {
      return setError('Pilih minimal satu produk pada setiap blok Produk Affiliate, atau hapus blok tersebut.');
    }

    setSaving(true); setError(''); setNotice('');
    const now = new Date().toISOString();
    const payload = {
      user_id: userId,
      title: cleanTitle,
      slug: cleanSlug,
      excerpt: excerpt.trim() || null,
      content: JSON.stringify(blocks),
      cover_image_url: cover.trim() || null,
      status: nextStatus,
      published_at: nextStatus === 'published' ? now : null,
      updated_at: now,
    };

    let id = editingId;
    if (id) {
      const { error: updateError } = await supabase.from('articles')
        .update(payload).eq('id', id).eq('user_id', userId);
      if (updateError) {
        setError(`Artikel gagal diperbarui: ${updateError.message}`); setSaving(false); return;
      }
    } else {
      const { data, error: insertError } = await supabase.from('articles')
        .insert(payload).select('id').single();
      if (insertError || !data) {
        setError(`Artikel gagal disimpan: ${insertError?.message ?? 'ID artikel tidak ditemukan'}`);
        setSaving(false); return;
      }
      id = data.id;
    }

    // Simpan relasi produk sebagai ID terpisah; URL/harga tetap bersumber dari tabel produk.
    const productIds = [...new Set(blocks.filter((b) => b.type === 'affiliate').flatMap((b) => b.productIds ?? []))];
    const { error: deleteError } = await supabase.from('article_products').delete().eq('article_id', id);
    if (deleteError) {
      setError(`Artikel tersimpan, tetapi relasi produk gagal diperbarui: ${deleteError.message}`);
      setSaving(false); await loadData(); return;
    }
    if (productIds.length) {
      const { error: relationError } = await supabase.from('article_products')
        .insert(productIds.map((product_id) => ({ article_id: id, product_id })));
      if (relationError) {
        setError(`Artikel tersimpan, tetapi produk gagal ditautkan: ${relationError.message}`);
        setSaving(false); await loadData(); return;
      }
    }

    setSaving(false);
    setNotice(nextStatus === 'published' ? 'Artikel berhasil diterbitkan.' : 'Draft artikel berhasil disimpan.');
    setShowEditor(false); resetEditor(); await loadData();
  }

  async function deleteArticle(article: Article) {
    if (!window.confirm(`Hapus artikel "${article.title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    const { error: deleteError } = await supabase.from('articles').delete()
      .eq('id', article.id).eq('user_id', userId);
    if (deleteError) setError(`Artikel gagal dihapus: ${deleteError.message}`);
    else { setNotice('Artikel berhasil dihapus.'); await loadData(); }
  }

  const filteredArticles = articles.filter((a) =>
    `${a.title} ${a.slug} ${a.excerpt ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()));

  function renderBlock(block: ArticleBlock) {
    if (block.type === 'divider') return <hr className="block-preview-divider" />;
    if (block.type === 'heading') return <h2>{block.text}</h2>;
    if (block.type === 'text') return <p className="formatted-paragraph">{(block.text ?? '').split('\n').map((line, i) => <span key={i}>{i > 0 && <br />}<InlineFormattedText text={line} /></span>)}</p>;
    if (block.type === 'quote') return <blockquote><InlineFormattedText text={block.text ?? ''} /></blockquote>;
    if (block.type === 'list') return <ul>{(block.items ?? []).filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}</ul>;
    if (block.type === 'image') return block.url ? <figure className={`preview-image preview-image-size-${block.imageSize ?? 'full'} preview-image-align-${block.imageAlign ?? 'center'}`}><img src={block.url} alt={block.caption ?? ''} /><figcaption>{block.caption}</figcaption></figure> : null;
    if (block.type === 'tiktok') {
      const embedUrl = block.url ? getTikTokEmbedUrl(block.url) : null;
      return block.url ? <div className="article-tiktok-embed">
        {embedUrl ? <iframe src={embedUrl} title="Video TikTok" loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen /> :
          <p>URL TikTok belum dikenali. Gunakan tautan video yang memiliki format <code>tiktok.com/@akun/video/ID</code>.</p>}
        <a href={block.url} target="_blank" rel="noreferrer">Buka video asli di TikTok</a>
      </div> : null;
    }
    if (block.type === 'affiliate') {
      const selected = products.filter((p) => (block.productIds ?? []).includes(p.id));
      return <div className="article-preview-products">{selected.map((p) => <div className="article-preview-product" key={p.id}>
        {p.image_url && <img src={p.image_url} alt="" />}
        <div><strong>{p.name}</strong>{p.price != null && <p>{p.currency ?? 'IDR'} {Number(p.price).toLocaleString('id-ID')}</p>}
        <a href={p.affiliate_url} target="_blank" rel="noreferrer">Lihat Produk</a></div>
      </div>)}</div>;
    }
    return null;
  }

  return <section className="articles-page">
    <div className="articles-heading">
      <div><p className="eyebrow">CONTENT WORKSPACE</p><h1>Manajemen Artikel</h1>
        <p className="articles-description">Susun artikel dari blok teks, produk, gambar, dan video.</p></div>
      <button className="primary-button" type="button" onClick={newArticle}>+ Artikel Baru</button>
    </div>

    {error && <div className="article-alert article-alert-error" role="alert">{error}</div>}
    {notice && <div className="article-alert article-alert-success" role="status">{notice}</div>}{uploadProgressMessage && <div className="article-alert article-alert-success" role="status">{uploadProgressMessage}</div>}

    {showEditor && <section className="article-editor panel">
      <div className="article-editor-heading"><div><h2>{editingId ? 'Edit Artikel' : 'Buat Artikel'}</h2>
        <p>Tambahkan blok, lalu seret blok untuk mengubah urutannya.</p></div>
        <div className="article-heading-actions">
          <button className="article-secondary-button" type="button" onClick={() => setPreview(!preview)}>{preview ? 'Kembali ke Editor' : 'Pratinjau'}</button>
          <button className="article-secondary-button" type="button" onClick={() => { setShowEditor(false); resetEditor(); }}>Tutup</button>
        </div>
      </div>

      {!preview ? <>
        <div className="article-form-grid">
          <label className="article-field article-field-full"><span>Judul artikel *</span>
            <input value={title} maxLength={180} onChange={(e) => { const v = e.target.value; setTitle(v); if (!slug || slug === slugify(title)) setSlug(slugify(v)); }} placeholder="Contoh: Rekomendasi SSD Gaming" />
          </label>
          <label className="article-field article-field-full"><span>Slug *</span>
            <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="rekomendasi-ssd-gaming" />
          </label>
          <label className="article-field article-field-full"><span>Ringkasan</span>
            <textarea rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Ringkasan artikel..." /></label>
          <div className="article-field article-field-full">
            <span>Gambar sampul (opsional)</span>

            <label className="article-upload-button article-cover-upload-button">
              {uploadingCover ? 'Mengunggah sampul...' : 'Pilih gambar sampul dari komputer'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={uploadingCover}
                onChange={(e) => {
                  void uploadCoverImage(e.target.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <small>Format JPG, PNG, WebP, atau GIF. Maksimal 5 MB.</small>
            <input
              aria-label="URL gambar sampul"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              placeholder="Atau masukkan URL gambar https://..."
            />
            {cover && (
              <div className="article-cover-upload-preview">
                <img src={cover} alt="Preview gambar sampul artikel" />
                <button
                  type="button"
                  className="article-delete-button"
                  onClick={() => setCover('')}
                >
                  Hapus sampul
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="block-editor-heading"><div><h3>Isi Artikel</h3><p>{blocks.length} blok konten</p></div></div>
        <div className="article-blocks">
          {blocks.map((block, index) => <div className={`article-block ${draggingId === block.id ? 'article-block-dragging' : ''}`} key={block.id}
            draggable onDragStart={(e) => { setDraggingId(block.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', block.id); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const source = e.dataTransfer.getData('text/plain') || draggingId; if (source) moveBlock(source, block.id); setDraggingId(null); }}
            onDragEnd={() => setDraggingId(null)}>
            <div className="article-block-top"><div className="article-block-label"><span className="drag-handle">⠿</span><strong>{index + 1}. {blockLabel(block.type)}</strong></div>
              <button type="button" className="article-delete-button" onClick={() => removeBlock(block.id)}>Hapus blok</button></div>
            {block.type === 'heading' && <div className="article-block-fields"><select value={block.level ?? 2} onChange={(e) => updateBlock(block.id, { level: Number(e.target.value) as 2 | 3 })}><option value={2}>Heading H2</option><option value={3}>Heading H3</option></select><input value={block.text ?? ''} onChange={(e) => updateBlock(block.id, { text: e.target.value })} placeholder="Tulis subjudul..." /></div>}
            {(block.type === 'text' || block.type === 'quote') && <div className="block-richtext-editor">
              <div className="richtext-toolbar" aria-label="Format teks">
                <button type="button" title="Tebal" onClick={() => wrapSelectedText(block.id, '**')}>B</button>
                <button type="button" title="Miring" onClick={() => wrapSelectedText(block.id, '*')}><em>I</em></button>
                <button type="button" title="Sisipkan tautan" onClick={() => wrapSelectedText(block.id, '[', '](https://contoh.com)')}>Link</button>
                <span>Pilih teks lalu gunakan format. Tautan memakai format [teks](https://alamat).</span>
              </div>
              <textarea ref={(node) => { textareas.current[block.id] = node; }} rows={block.type === 'text' ? 4 : 3} value={block.text ?? ''} onChange={(e) => updateBlock(block.id, { text: e.target.value })} placeholder={block.type === 'text' ? 'Tulis paragraf...' : 'Tulis kutipan...'} />
            </div>}
            {block.type === 'list' && <div className="block-list-editor">{(block.items ?? ['']).map((item, i) => <div className="block-list-row" key={i}><input value={item} onChange={(e) => updateBlock(block.id, { items: (block.items ?? []).map((v, n) => n === i ? e.target.value : v) })} placeholder={`Item ${i + 1}`} /><button type="button" onClick={() => updateBlock(block.id, { items: (block.items ?? []).filter((_, n) => n !== i) })}>×</button></div>)}<button type="button" className="article-secondary-button" onClick={() => updateBlock(block.id, { items: [...(block.items ?? []), ''] })}>+ Tambah item</button></div>}
            {block.type === 'affiliate' && <div className="block-affiliate-editor">
              <input type="search" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Cari produk affiliate..." />
              {products.length === 0 ? <p>Belum ada produk. Tambahkan melalui menu Link Affiliate.</p> : <>
                <label className="article-field"><span>Pilih produk affiliate</span>
                  <select value={(block.productIds ?? [])[0] ?? ''} onChange={(e) => updateBlock(block.id, { productIds: e.target.value ? [e.target.value] : [] })}>
                    <option value="">-- Pilih produk --</option>
                    {filteredProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price != null ? ` — ${p.currency ?? 'IDR'} ${Number(p.price).toLocaleString('id-ID')}` : ''}</option>)}
                  </select>
                </label>
                {(block.productIds ?? []).map((id) => products.find((p) => p.id === id)).filter(Boolean).map((p) => <div className="block-product-selected" key={p!.id}>{p!.image_url ? <img src={p!.image_url} alt="" /> : <span className="block-product-placeholder">↗</span>}<span><strong>{p!.name}</strong><small>{p!.price != null ? `${p!.currency ?? 'IDR'} ${Number(p!.price).toLocaleString('id-ID')}` : 'Harga tidak diisi'}</small></span></div>)}
              </>}
            </div>}
            {block.type === 'image' && <div className="article-block-fields">
              <label className="article-upload-button"> {uploadingBlockId === block.id ? 'Mengunggah gambar...' : 'Pilih gambar dari komputer'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploadingBlockId === block.id} onChange={(e) => { void uploadBlockImage(block.id, e.target.files?.[0]); e.currentTarget.value = ''; }} />
              </label>
              <small>PNG, JPG, WebP, atau GIF. Maksimal 5 MB. File disimpan ke Supabase Storage.</small>
              <input value={block.url ?? ''} onChange={(e) => updateBlock(block.id, { url: e.target.value })} placeholder="Atau tempel URL gambar publik" />
              <input value={block.caption ?? ''} onChange={(e) => updateBlock(block.id, { caption: e.target.value })} placeholder="Keterangan gambar (opsional)" />
              <label className="article-image-size-field">Ukuran gambar
                <select value={block.imageSize ?? 'full'} onChange={(e) => updateBlock(block.id, { imageSize: e.target.value as ArticleBlock['imageSize'] })}>
                  <option value="small">Kecil — 25%</option>
                  <option value="medium">Sedang — 50%</option>
                  <option value="large">Besar — 75%</option>
                  <option value="full">Penuh — 100%</option>
                </select>
              </label>
              <label className="article-image-size-field">Posisi gambar
                <select value={block.imageAlign ?? 'center'} onChange={(e) => updateBlock(block.id, { imageAlign: e.target.value as ArticleBlock['imageAlign'] })}>
                  <option value="left">Rata kiri</option><option value="center">Tengah</option><option value="right">Rata kanan</option>
                </select>
              </label>
              {block.url && <img className={`block-image-preview block-image-preview-${block.imageSize ?? 'full'} block-image-align-${block.imageAlign ?? 'center'}`} src={block.url} alt={block.caption ?? ''} />}
            </div>}
            {block.type === 'tiktok' && <div className="article-block-fields"><input value={block.url ?? ''} onChange={(e) => updateBlock(block.id, { url: e.target.value })} placeholder="https://www.tiktok.com/@akun/video/..." /><small>Masukkan URL video TikTok publik. Embed akan disiapkan untuk halaman artikel publik.</small></div>}
            {block.type === 'divider' && <p className="block-divider-help">Garis pemisah akan tampil di antara bagian artikel.</p>}
          </div>)}
        </div>
        <div className="add-block-panel"><strong>Tambah blok berdasarkan kategori</strong>
          <div className="add-block-category"><h4>Teks & Konten</h4><div className="add-block-buttons">{(['heading', 'text', 'list', 'quote', 'divider'] as BlockType[]).map((type) => <button type="button" key={type} className="add-block-button" onClick={() => addBlock(type)}>＋ {blockLabel(type)}</button>)}</div></div>
          <div className="add-block-category"><h4>Media</h4><div className="add-block-buttons">{(['image', 'tiktok'] as BlockType[]).map((type) => <button type="button" key={type} className="add-block-button" onClick={() => addBlock(type)}>＋ {blockLabel(type)}</button>)}</div></div>
          <div className="add-block-category"><h4>Produk</h4><div className="add-block-buttons"><button type="button" className="add-block-button" onClick={() => addBlock('affiliate')}>＋ {blockLabel('affiliate')}</button></div></div>
        </div>
      </> : <div className="article-preview">
        <h1>{title || 'Judul Artikel'}</h1>{excerpt && <p className="article-preview-excerpt">{excerpt}</p>}
        {cover && <img className="article-preview-cover" src={cover} alt="" />}
        {blocks.map((block) => <div className={`preview-block preview-${block.type}`} key={block.id}>{renderBlock(block)}</div>)}
      </div>}

      <div className="article-form-actions"><label className="article-field article-status-field"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value as ArticleStatus)}><option value="draft">Draft</option><option value="published">Terbit</option></select></label>
        <button type="button" className="article-secondary-button" disabled={saving || uploadingCover || uploadingBlockId !== null} onClick={() => void saveArticle('draft')}>{saving ? 'Menyimpan...' : 'Simpan Draft'}</button>
        <button type="button" className="primary-button" disabled={saving || uploadingCover || uploadingBlockId !== null} onClick={() => void saveArticle('published')}>{saving ? 'Menyimpan...' : 'Terbitkan Artikel'}</button>
      </div>
    </section>}

    <section className="articles-list-panel panel"><div className="articles-list-heading"><div><h2>Daftar Artikel</h2><p>{articles.length} artikel tersimpan</p></div>
      <input className="article-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari artikel..." /></div>
      {loading ? <div className="article-list-empty">Memuat artikel...</div> : filteredArticles.length === 0 ? <div className="article-list-empty"><strong>{search ? 'Artikel tidak ditemukan' : 'Belum ada artikel'}</strong><span>{search ? 'Coba kata kunci lain.' : 'Buat artikel pertama kamu dari tombol Artikel Baru.'}</span></div> :
        <div className="article-list">{filteredArticles.map((a) => <article className="article-list-item" key={a.id}>
          {a.cover_image_url ? <img className="article-list-cover" src={a.cover_image_url} alt="" /> : <div className="article-list-cover article-list-cover-placeholder">▤</div>}
          <div className="article-list-main"><div className="article-list-title-row"><h3>{a.title}</h3><span className={`article-status article-status-${a.status}`}>{a.status === 'published' ? 'Terbit' : 'Draft'}</span></div>
            <p>{a.excerpt || parseBlocks(a.content).map((b) => b.text ?? '').join(' ').slice(0, 150)}</p><div className="article-list-meta"><span>/{a.slug}</span><span>Diperbarui {new Date(a.updated_at).toLocaleDateString('id-ID')}</span></div></div>
          <div className="article-list-actions"><button type="button" className="article-secondary-button" onClick={() => void openEdit(a)}>Edit</button><button type="button" className="article-delete-button" onClick={() => void deleteArticle(a)}>Hapus</button></div>
        </article>)}</div>}
    </section>
  </section>;
}
