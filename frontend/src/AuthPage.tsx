
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import './AuthPage.css'

type AuthMode = 'login' | 'register'
type WebsiteBrand = { site_name: string; tagline: string; logo_url: string }

const defaultBrand: WebsiteBrand = {
  site_name: 'Qeon Company',
  tagline: 'Technology Education',
  logo_url: '',
}

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [brand, setBrand] = useState<WebsiteBrand>(defaultBrand)

  useEffect(() => {
    let active = true

    async function loadWebsiteBrand() {
      const { data, error } = await supabase
        .from('website_settings')
        .select('site_name, tagline, logo_url')
        .eq('id', 'main')
        .maybeSingle()

      if (!active) return

      if (error) {
        // Pengaturan branding tidak boleh menghalangi pengguna login.
        console.warn('Pengaturan branding website tidak dapat dimuat:', error.message)
        return
      }

      if (data) {
        setBrand({
          site_name: data.site_name?.trim() || defaultBrand.site_name,
          tagline: data.tagline?.trim() || defaultBrand.tagline,
          logo_url: data.logo_url?.trim() || '',
        })
      }
    }

    void loadWebsiteBrand()
    return () => { active = false }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')

    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name.trim(),
            },
          },
        })

        if (error) throw error

        if (data.session) {
          setMessage('Registrasi berhasil. Selamat datang!')
        } else {
          setMessage(
            'Registrasi berhasil. Periksa email untuk konfirmasi sebelum login.'
          )
          setMode('login')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        setMessage('Login berhasil.')
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan. Silakan coba lagi.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-brand" href="/" aria-label={`${brand.site_name} - Beranda`}>
          {brand.logo_url ? (
            <img className="auth-brand-logo" src={brand.logo_url} alt={`Logo ${brand.site_name}`} />
          ) : (
            <span className="auth-brand-icon" aria-hidden="true">
              {brand.site_name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="auth-brand-name">{brand.site_name}</span>
        </a>

        <p className="auth-eyebrow">{brand.tagline || 'AFFILIATE WORKSPACE'}</p>

        <h1>
          {mode === 'login'
            ? 'Selamat datang kembali'
            : 'Buat akun affiliator'}
        </h1>

        <p className="auth-description">
          {mode === 'login'
            ? 'Login untuk mengelola produk dan artikel affiliate kamu.'
            : 'Daftar untuk mulai mengelola link affiliate dan membuat artikel.'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'selected' : ''}
            onClick={() => {
              setMode('login')
              setMessage('')
              setError('')
            }}
          >
            Login
          </button>

          <button
            type="button"
            className={mode === 'register' ? 'selected' : ''}
            onClick={() => {
              setMode('register')
              setMessage('')
              setError('')
            }}
          >
            Daftar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <label>
              Nama lengkap
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nama kamu"
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@email.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimal 8 karakter"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              minLength={8}
              required
            />
          </label>

          {error && (
            <p className="auth-message auth-error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p className="auth-message auth-success" role="status">
              {message}
            </p>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? 'Memproses...'
              : mode === 'login'
                ? 'Login ke Dashboard'
                : 'Buat Akun'}
          </button>
        </form>

        <p className="auth-note">
          Akun baru akan mendapatkan role affiliator secara otomatis.
        </p>
      </section>
    </main>
  )
}