import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './WebsiteSettings.css';

type Settings = {
  id: string;
  site_name: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  meta_description: string;
  contact_email: string;
  whatsapp: string;
  instagram_url: string;
  youtube_url: string;
  footer_text: string;
};

const defaults: Settings = {
  id: 'main', site_name: 'Qeon Company', tagline: 'Technology Education', logo_url: '', favicon_url: '',
  meta_description: 'Panduan rakit PC, edukasi komponen komputer, dan teknologi untuk semua.',
  contact_email: 'hello@qeoncompany.com', whatsapp: '', instagram_url: '', youtube_url: '',
  footer_text: 'Edukasi teknologi untuk semua.'
};

export default function WebsiteSettings() {
  const [form, setForm] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo_url' | 'favicon_url' | null>(null);
  const [notice, setNotice] = useState<{type:'success'|'error'; text:string} | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('website_settings').select('*').eq('id', 'main').maybeSingle();
      if (!active) return;
      if (data) {
        const settings = { ...defaults, ...data } as Settings;
        setForm(settings);
        applyBrowserSettings(settings);
      }
      if (error && !/does not exist|schema cache/i.test(error.message)) setNotice({type:'error', text:`Gagal memuat pengaturan: ${error.message}`});
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  function applyBrowserSettings(settings: Settings) {
    document.title = settings.site_name?.trim() || 'Qeon Company';

    if (settings.meta_description?.trim()) {
      let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!description) {
        description = document.createElement('meta');
        description.name = 'description';
        document.head.appendChild(description);
      }
      description.content = settings.meta_description.trim();
    }

    if (settings.favicon_url?.trim()) {
      let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = settings.favicon_url.trim();
    }
  }

  const update = (key: keyof Settings, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  async function uploadImage(key: 'logo_url' | 'favicon_url', file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setNotice({type:'error', text:'Pilih file gambar.'}); return; }
    if (file.size > 3 * 1024 * 1024) { setNotice({type:'error', text:'Ukuran gambar maksimal 3 MB.'}); return; }
    setUploading(key); setNotice(null);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${key === 'logo_url' ? 'logo' : 'favicon'}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('website-assets').upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setNotice({type:'error', text:`Upload gagal: ${error.message}. Pastikan bucket website-assets dan policy storage sudah dibuat.`});
    } else {
      const { data } = supabase.storage.from('website-assets').getPublicUrl(path);
      setForm(prev => ({ ...prev, [key]: data.publicUrl }));
      setNotice({type:'success', text:'Gambar berhasil diunggah. Klik Simpan Pengaturan untuk menerapkan perubahan.'});
    }
    setUploading(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(null);
    const payload = { ...form, id: 'main', updated_at: new Date().toISOString() };
    const { error } = await supabase.from('website_settings').upsert(payload, { onConflict: 'id' });
    if (error) setNotice({type:'error', text:`Pengaturan belum tersimpan: ${error.message}. Pastikan SQL website_settings sudah dijalankan.`});
    else {
      applyBrowserSettings(form);
      localStorage.setItem('qeon-site-settings-updated', String(Date.now()));
      window.dispatchEvent(new Event('qeon-site-settings-updated'));
      window.dispatchEvent(new Event('website-settings-updated'));
      setNotice({type:'success', text:'Pengaturan website berhasil disimpan.'});
    }
    setSaving(false);
  }

  if (loading) return <div className="ws-page"><p>Memuat pengaturan website...</p></div>;
  return <div className="ws-page">
    <div className="ws-heading"><div><p className="ws-eyebrow">KONFIGURASI WEBSITE</p><h1>Pengaturan Website</h1><p>Atur identitas, logo, informasi kontak, dan tampilan dasar website publik.</p></div><span className="ws-heading-icon">⚙</span></div>
    {notice && <div className={`ws-notice ${notice.type}`} role="status">{notice.text}</div>}
    <form onSubmit={save} className="ws-form">
      <section className="ws-card"><div className="ws-card-title"><span>01</span><div><h2>Identitas Website</h2><p>Nama dan informasi utama yang dikenali pengunjung.</p></div></div>
        <label>Nama website<input required value={form.site_name} onChange={e=>update('site_name',e.target.value)} placeholder="Qeon Company" /></label>
        <label>Slogan / tagline<input value={form.tagline} onChange={e=>update('tagline',e.target.value)} placeholder="Technology Education" /></label>
        <label>Deskripsi website<textarea rows={3} value={form.meta_description} onChange={e=>update('meta_description',e.target.value)} placeholder="Deskripsi singkat website" /></label>
      </section>
      <section className="ws-card"><div className="ws-card-title"><span>02</span><div><h2>Logo dan Favicon</h2><p>Gunakan gambar PNG, JPG, WEBP, atau SVG. Maksimal 3 MB.</p></div></div>
        <div className="ws-assets-grid">
          <div className="ws-asset"><strong>Logo website</strong><div className="ws-preview logo-preview">{form.logo_url ? <img src={form.logo_url} alt="Pratinjau logo website"/> : <span>Logo belum diatur</span>}</div><label className="ws-upload">{uploading==='logo_url'?'Mengunggah...':'Pilih logo'}<input type="file" accept="image/*" disabled={!!uploading} onChange={e=>void uploadImage('logo_url',e.target.files?.[0])}/></label><label>URL logo<input value={form.logo_url} onChange={e=>update('logo_url',e.target.value)} placeholder="https://..." /></label></div>
          <div className="ws-asset"><strong>Favicon / ikon tab</strong><div className="ws-preview favicon-preview">{form.favicon_url ? <img src={form.favicon_url} alt="Pratinjau favicon"/> : <span>Ikon</span>}</div><label className="ws-upload">{uploading==='favicon_url'?'Mengunggah...':'Pilih favicon'}<input type="file" accept="image/*" disabled={!!uploading} onChange={e=>void uploadImage('favicon_url',e.target.files?.[0])}/></label><label>URL favicon<input value={form.favicon_url} onChange={e=>update('favicon_url',e.target.value)} placeholder="https://..." /></label></div>
        </div>
        <p className="ws-help">Jika upload ditolak, jalankan SQL yang disertakan di paket lalu pastikan bucket <code>website-assets</code> tersedia di Supabase Storage.</p>
      </section>
      <section className="ws-card"><div className="ws-card-title"><span>03</span><div><h2>Kontak dan Media Sosial</h2><p>Kontak yang ditampilkan atau digunakan website.</p></div></div>
        <div className="ws-two-col"><label>Email kontak<input type="email" value={form.contact_email} onChange={e=>update('contact_email',e.target.value)} placeholder="halo@domain.com" /></label><label>WhatsApp<input value={form.whatsapp} onChange={e=>update('whatsapp',e.target.value)} placeholder="6281234567890" /></label><label>Instagram URL<input type="url" value={form.instagram_url} onChange={e=>update('instagram_url',e.target.value)} placeholder="https://instagram.com/..." /></label><label>YouTube URL<input type="url" value={form.youtube_url} onChange={e=>update('youtube_url',e.target.value)} placeholder="https://youtube.com/@..." /></label></div>
      </section>
      <section className="ws-card"><div className="ws-card-title"><span>04</span><div><h2>Footer Website</h2><p>Teks singkat yang digunakan pada bagian bawah website.</p></div></div><label>Teks footer<input value={form.footer_text} onChange={e=>update('footer_text',e.target.value)} placeholder="Edukasi teknologi untuk semua." /></label></section>
      <div className="ws-actions"><span>Perubahan tersimpan di database Supabase.</span><button type="submit" disabled={saving || !!uploading}>{saving?'Menyimpan...':'Simpan Pengaturan'}</button></div>
    </form>
  </div>;
}