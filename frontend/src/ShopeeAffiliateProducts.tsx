
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from './lib/supabase';
import './AffiliateProducts.css';

const BUCKET_NAME = 'shopee-affiliate-product-images';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
];

type AffiliateProduct = {
    id: string;
    user_id: string;
    name: string;
    affiliate_url: string;
    image_url: string | null;
    description: string | null;
    price: number | null;
    currency: string;
    created_at: string;
};

type ProductForm = {
    name: string;
    affiliate_url: string;
    image_url: string;
    description: string;
    price: string;
};

const emptyForm: ProductForm = {
    name: '',
    affiliate_url: '',
    image_url: '',
    description: '',
    price: '',
};

type AffiliateProductsProps = {
    userId: string;
};

export default function AffiliateProducts({
    userId,
}: AffiliateProductsProps) {
    const [products, setProducts] = useState<AffiliateProduct[]>([]);
    const [form, setForm] = useState<ProductForm>(emptyForm);
    const [search, setSearch] = useState('');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [fetchingImage, setFetchingImage] = useState(false);
    const [imageFetchMessage, setImageFetchMessage] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadProducts = useCallback(async () => {
        setLoading(true);
        setError('');

        const { data, error: fetchError } = await supabase
            .from('shopee_affiliate_products')
            .select(
                'id, user_id, name, affiliate_url, image_url, description, price, currency, created_at',
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (fetchError) {
            setError(`Gagal memuat produk Shopee: ${fetchError.message}`);
            setProducts([]);
        } else {
            setProducts((data ?? []) as AffiliateProduct[]);
        }

        setLoading(false);
    }, [userId]);

    useEffect(() => {
        void loadProducts();
    }, [loadProducts]);

    // Membersihkan URL preview lokal saat file berubah atau halaman ditutup.
    useEffect(() => {
        if (!selectedFile) {
            setPreviewUrl('');
            return;
        }

        const objectUrl = URL.createObjectURL(selectedFile);
        setPreviewUrl(objectUrl);

        return () => URL.revokeObjectURL(objectUrl);
    }, [selectedFile]);

    function updateField(field: keyof ProductForm, value: string) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    function resetForm() {
        setEditingId(null);
        setForm(emptyForm);
        setSelectedFile(null);
        setError('');
        setSuccess('');
    }

    function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];

        if (!file) return;

        setError('');
        setSuccess('');

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setSelectedFile(null);
            event.target.value = '';
            setError('Format gambar harus JPG, PNG, atau WebP.');
            return;
        }

        if (file.size > MAX_IMAGE_SIZE) {
            setSelectedFile(null);
            event.target.value = '';
            setError('Ukuran gambar maksimal 5 MB.');
            return;
        }

        setSelectedFile(file);
    }

    function startEdit(product: AffiliateProduct) {
        setEditingId(product.id);

        setForm({
            name: product.name,
            affiliate_url: product.affiliate_url,
            image_url: product.image_url ?? '',
            description: product.description ?? '',
            price: product.price === null ? '' : String(product.price),
        });

        setSelectedFile(null);
        setError('');
        setSuccess('');

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function isValidHttpUrl(value: string) {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' || url.protocol === 'http:';
        } catch {
            return false;
        }
    }
    console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
    async function uploadProductImage(file: File): Promise<string> {
        const extensionByType: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
        };

        const extension = extensionByType[file.type];

        if (!extension) {
            throw new Error('Format gambar tidak didukung.');
        }

        // Folder pertama harus merupakan ID pengguna sesuai kebijakan RLS.
        const filePath =
            `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, file, {
                contentType: file.type,
                upsert: false,
            });

        if (uploadError) {
            throw new Error(`Upload gambar gagal: ${uploadError.message}`);
        }

        const { data } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        return data.publicUrl;
    }


    async function fetchImageFromAffiliate() {
        const affiliateUrl = form.affiliate_url.trim();

        if (!affiliateUrl) {
            setError('Masukkan link affiliate terlebih dahulu.');
            return;
        }

        setError('');
        setSuccess('');
        setImageFetchMessage('');
        setFetchingImage(true);

        try {
            const apiUrl = import.meta.env.VITE_API_URL;

            if (!apiUrl) {
                throw new Error('VITE_API_URL belum diatur di file .env.');
            }

            const endpoint = new URL(
                '/api/shopee/preview-image',
                apiUrl,
            );

            endpoint.searchParams.set('url', affiliateUrl);

            const response = await fetch(endpoint.toString());
            const result: {
                status: string;
                message?: string;
                error?: string;
                imageUrl?: string;
            } = await response.json();

            if (!response.ok || result.status !== 'ok' || !result.imageUrl) {
                throw new Error(
                    result.error || 'Gambar produk tidak berhasil ditemukan.',
                );
            }

            setSelectedFile(null);

            setForm((current) => ({
                ...current,
                image_url: result.imageUrl!,
            }));

            setImageFetchMessage(
                'Gambar ditemukan. Periksa preview sebelum menyimpan produk.',
            );
        } catch (err) {
            setImageFetchMessage(
                err instanceof Error
                    ? err.message
                    : 'Gagal mengambil gambar otomatis.',
            );
        } finally {
            setFetchingImage(false);
        }
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setSuccess('');

        const name = form.name.trim();
        const affiliateUrl = form.affiliate_url.trim();
        const imageUrl = form.image_url.trim();

        if (!name || !affiliateUrl) {
            setError('Nama produk dan link affiliate wajib diisi.');
            return;
        }

        if (!isValidHttpUrl(affiliateUrl)) {
            setError('Link affiliate Shopee harus berupa URL HTTP atau HTTPS yang valid.');
            return;
        }

        try {
            const host = new URL(affiliateUrl).hostname.toLowerCase();
            if (!(host === 'shopee.co.id' || host.endsWith('.shopee.co.id') || host === 'shopee.com' || host.endsWith('.shopee.com'))) {
                setError('Gunakan link dari domain Shopee, misalnya shopee.co.id atau s.shopee.co.id.');
                return;
            }
        } catch {
            setError('Link Shopee tidak valid.');
            return;
        }

        if (imageUrl && !isValidHttpUrl(imageUrl)) {
            setError('URL gambar harus berupa URL HTTP atau HTTPS yang valid.');
            return;
        }

        let price: number | null = null;

        if (form.price.trim() !== '') {
            price = Number(form.price);

            if (!Number.isFinite(price) || price < 0) {
                setError('Harga harus berupa angka nol atau lebih.');
                return;
            }
        }

        setSaving(true);

        try {
            let finalImageUrl = imageUrl || null;

            // Jika memilih file baru, upload dahulu sebelum menyimpan produk.
            if (selectedFile) {
                finalImageUrl = await uploadProductImage(selectedFile);
            }

            const productData = {
                name,
                affiliate_url: affiliateUrl,
                image_url: finalImageUrl,
                description: form.description.trim() || null,
                price,
                currency: 'IDR',
            };

            if (editingId) {
                const { error: updateError } = await supabase
                    .from('shopee_affiliate_products')
                    .update({
                        ...productData,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', editingId)
                    .eq('user_id', userId);

                if (updateError) {
                    throw new Error(`Gagal memperbarui produk Shopee: ${updateError.message}`);
                }

                setSuccess('Produk Shopee berhasil diperbarui!');
            } else {
                const { error: insertError } = await supabase
                    .from('shopee_affiliate_products')
                    .insert({
                        ...productData,
                        user_id: userId,
                    });

                if (insertError) {
                    throw new Error(`Gagal menyimpan produk Shopee: ${insertError.message}`);
                }

                setSuccess('Produk Shopee berhasil ditambahkan!');
            }

            setEditingId(null);
            setForm(emptyForm);
            setSelectedFile(null);

            await loadProducts();
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : 'Terjadi kesalahan saat menyimpan produk.',
            );
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(product: AffiliateProduct) {
        const confirmed = window.confirm(
            `Hapus produk "${product.name}"? Tindakan ini tidak bisa dibatalkan.`,
        );

        if (!confirmed) return;

        setError('');
        setSuccess('');
        setDeletingId(product.id);

        try {
            const { error: deleteError } = await supabase
                .from('shopee_affiliate_products')
                .delete()
                .eq('id', product.id)
                .eq('user_id', userId);

            if (deleteError) {
                throw new Error(`Gagal menghapus produk: ${deleteError.message}`);
            }

            if (editingId === product.id) {
                resetForm();
            }

            setSuccess('Produk Shopee berhasil dihapus.');
            await loadProducts();
        } catch (deleteError) {
            setError(
                deleteError instanceof Error
                    ? deleteError.message
                    : 'Terjadi kesalahan saat menghapus produk.',
            );
        } finally {
            setDeletingId(null);
        }
    }

    const filteredProducts = products.filter((product) =>
        product.name.toLowerCase().includes(search.trim().toLowerCase()),
    );

    const rupiah = (price: number | null) =>
        price === null
            ? 'Harga belum diisi'
            : new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                maximumFractionDigits: 0,
            }).format(price);

    return (
        <section className="affiliate-page">
            <div className="affiliate-heading">
                <div>
                    <p className="affiliate-eyebrow">MANAJEMEN KONTEN</p>
                    <h1>Link Affiliate Shopee</h1>
                    <p>Kelola produk dan tautan affiliate Shopee milikmu.</p>
                </div>

                <div className="affiliate-total">
                    <span>Total produk</span>
                    <strong>{products.length}</strong>
                </div>
            </div>

            {error && (
                <div className="affiliate-alert affiliate-alert-error" role="alert">
                    {error}
                </div>
            )}

            {success && (
                <div className="affiliate-alert affiliate-alert-success" role="status">
                    {success}
                </div>
            )}

            <div className="affiliate-panel" id="product-form">
                <div className="affiliate-form-heading">
                    <div>
                        <h2>{editingId ? 'Edit Produk' : 'Tambah Produk'}</h2>
                        <p className="affiliate-muted">
                            {editingId
                                ? 'Ubah informasi produk dan gambar jika diperlukan.'
                                : 'Isi informasi produk dan pilih gambar dari komputer.'}
                        </p>
                    </div>

                    {editingId && (
                        <button
                            className="affiliate-cancel-button"
                            type="button"
                            onClick={resetForm}
                            disabled={saving}
                        >
                            Batal edit
                        </button>
                    )}
                </div>

                <form className="affiliate-form" onSubmit={handleSubmit}>
                    <label>
                        Nama produk <span>*</span>
                        <input
                            value={form.name}
                            onChange={(event) => updateField('name', event.target.value)}
                            placeholder="Contoh: SSD NVMe 1TB"
                            maxLength={200}
                            required
                        />
                    </label>


                    <label>
                        Link affiliate <span>*</span>
                        <input
                            type="url"
                            value={form.affiliate_url}
                            onChange={(event) =>
                                updateField('affiliate_url', event.target.value)
                            }
                            placeholder="Tempel link affiliate Shopee..."
                            required
                        />
                    </label>

                    <div className="affiliate-full-width affiliate-auto-image">
                        <button
                            type="button"
                            className="affiliate-auto-image-button"
                            onClick={() => void fetchImageFromAffiliate()}
                            disabled={fetchingImage || saving}
                        >
                            {fetchingImage
                                ? 'Sedang mencari gambar...'
                                : '↗ Ambil Gambar dari Link'}
                        </button>

                        {imageFetchMessage && (
                            <p
                                className="affiliate-auto-image-message"
                                role="status"
                            >
                                {imageFetchMessage}
                            </p>
                        )}
                    </div>


                    <label className="affiliate-full-width">
                        Gambar produk
                        <input
                            id="product-image-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageChange}
                            disabled={saving}
                        />
                        <span className="affiliate-file-help">
                            JPG, PNG, atau WebP. Maksimal 5 MB.
                        </span>
                    </label>

                    {(previewUrl || form.image_url) && (
                        <div className="affiliate-image-preview affiliate-full-width">
                            <img
                                src={previewUrl || form.image_url}
                                alt="Preview gambar produk"
                            />
                            <div>
                                <strong>
                                    {selectedFile ? 'Gambar baru' : 'Gambar saat ini'}
                                </strong>
                                <p>
                                    {selectedFile
                                        ? selectedFile.name
                                        : 'Pilih file baru jika ingin mengganti gambar.'}
                                </p>

                                {selectedFile && (
                                    <button
                                        type="button"
                                        className="affiliate-cancel-button"
                                        onClick={() => {
                                            setSelectedFile(null);

                                            const input = document.getElementById(
                                                'product-image-input',
                                            ) as HTMLInputElement | null;

                                            if (input) input.value = '';
                                        }}
                                    >
                                        Batalkan pilihan gambar
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <label>
                        URL gambar eksternal (opsional)
                        <input
                            type="url"
                            value={form.image_url}
                            onChange={(event) => updateField('image_url', event.target.value)}
                            placeholder="https://..."
                            disabled={Boolean(selectedFile) || saving}
                        />
                    </label>

                    <label>
                        Harga produk (rupiah)
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={form.price}
                            onChange={(event) => updateField('price', event.target.value)}
                            placeholder="Contoh: 350000"
                        />
                    </label>

                    <label className="affiliate-full-width">
                        Deskripsi
                        <textarea
                            value={form.description}
                            onChange={(event) =>
                                updateField('description', event.target.value)
                            }
                            placeholder="Catatan atau informasi produk..."
                            rows={3}
                        />
                    </label>

                    <div className="affiliate-form-actions affiliate-full-width">
                        <button
                            className="affiliate-primary-button"
                            type="submit"
                            disabled={saving}
                        >
                            {saving
                                ? 'Menyimpan...'
                                : editingId
                                    ? 'Simpan Perubahan'
                                    : 'Simpan Produk'}
                        </button>

                        {editingId && (
                            <button
                                className="affiliate-cancel-button"
                                type="button"
                                onClick={resetForm}
                                disabled={saving}
                            >
                                Batal
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <div className="affiliate-panel">
                <div className="affiliate-list-heading">
                    <div>
                        <h2>Produk Saya</h2>
                        <p className="affiliate-muted">
                            {products.length} produk tersimpan di akunmu.
                        </p>
                    </div>

                    <input
                        className="affiliate-search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Cari nama produk..."
                        aria-label="Cari produk"
                    />
                </div>

                {loading ? (
                    <p className="affiliate-loading">Memuat produk...</p>
                ) : filteredProducts.length === 0 ? (
                    <div className="affiliate-empty">
                        <strong>
                            {search ? 'Produk tidak ditemukan' : 'Belum ada produk'}
                        </strong>
                        <p>
                            {search
                                ? 'Coba gunakan kata kunci lain.'
                                : 'Tambahkan produk pertamamu melalui formulir di atas.'}
                        </p>
                    </div>
                ) : (
                    <div className="affiliate-product-list">
                        {filteredProducts.map((product) => (
                            <article className="affiliate-product" key={product.id}>
                                <div className="affiliate-product-image">
                                    {product.image_url ? (
                                        <>
                                            <img
                                                src={product.image_url}
                                                alt={product.name}
                                                loading="lazy"
                                                onError={(event) => {
                                                    event.currentTarget.style.display = 'none';
                                                    const fallback = event.currentTarget
                                                        .nextElementSibling as HTMLElement | null;

                                                    if (fallback) {
                                                        fallback.style.display = 'inline';
                                                    }
                                                }}
                                            />
                                            <span style={{ display: 'none' }}>
                                                Gambar tidak dapat dimuat
                                            </span>
                                        </>
                                    ) : (
                                        <span>Foto produk</span>
                                    )}
                                </div>

                                <div className="affiliate-product-info">
                                    <h3>{product.name}</h3>
                                    <div className="affiliate-product-price">
                                        {rupiah(product.price)}
                                    </div>

                                    {product.description && (
                                        <p className="affiliate-product-description">
                                            {product.description}
                                        </p>
                                    )}

                                    <a
                                        className="affiliate-product-link"
                                        href={product.affiliate_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Buka link affiliate <span>↗</span>
                                    </a>
                                </div>

                                <div className="affiliate-product-actions">
                                    <button
                                        className="affiliate-edit-button"
                                        type="button"
                                        onClick={() => startEdit(product)}
                                    >
                                        Edit
                                    </button>

                                    <button
                                        className="affiliate-delete-button"
                                        type="button"
                                        disabled={deletingId === product.id}
                                        onClick={() => void handleDelete(product)}
                                    >
                                        {deletingId === product.id ? 'Menghapus...' : 'Hapus'}
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
