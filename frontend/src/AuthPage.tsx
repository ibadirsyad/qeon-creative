
import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import './AuthPage.css'

type AuthMode = 'login' | 'register'

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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
        <a className="auth-brand" href="/">
          <span className="auth-brand-icon">A</span>
          <span>
            Affili<span>CMS</span>
          </span>
        </a>

        <p className="auth-eyebrow">AFFILIATE WORKSPACE</p>

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
