import { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

/* ─── Floating orb component ─────────────────────────────────────────────── */
const Orb = ({ style }) => <div className="orb" style={style} />;

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [focused, setFocused] = useState('');
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const { login } = useContext(AuthContext);

    useEffect(() => {
        setTimeout(() => setMounted(true), 50);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await login(username, password);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #060610;
          font-family: 'Sora', sans-serif;
          position: relative;
          overflow: hidden;
        }

        /* ── background grid ── */
        .login-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(99,102,241,.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,.07) 1px, transparent 1px);
          background-size: 45px 45px;
          pointer-events: none;
        }

        /* ── floating orbs ── */
        .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          animation: drift 12s ease-in-out infinite alternate;
        }
        @keyframes drift {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(30px, -40px) scale(1.08); }
        }

        /* ── card ── */
        .card {
          position: relative;
          width: 400px;
          padding: 34px 30px;
          background: rgba(255,255,255,.035);
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 24px;
          backdrop-filter: blur(24px);
          box-shadow:
            0 0 0 1px rgba(99,102,241,.15),
            0 32px 80px rgba(0,0,0,.6),
            inset 0 1px 0 rgba(255,255,255,.08);
          opacity: 0;
          transform: translateY(28px);
          transition: opacity .6s ease, transform .6s ease;
        }
        .card.in {
          opacity: 1;
          transform: translateY(0);
        }

        /* top accent line */
        .card::before {
          content: '';
          position: absolute;
          top: 0; left: 24px; right: 24px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(139,92,246,.8), rgba(99,102,241,.8), transparent);
          border-radius: 2px;
        }

        /* ── logo mark ── */
        .logo-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 32px;
        }
        .logo-mark {
          width: 52px; height: 52px;
          border-radius: 16px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 32px rgba(99,102,241,.45);
          position: relative;
        }
        .logo-mark::after {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: 17px;
          background: linear-gradient(135deg, rgba(99,102,241,.6), rgba(139,92,246,.6));
          z-index: -1;
          filter: blur(8px);
        }
        .logo-mark svg { width: 26px; height: 26px; }

        /* ── headings ── */
        .heading {
          text-align: center;
          margin-bottom: 8px;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -.4px;
          color: #f1f5f9;
        }
        .sub {
          text-align: center;
          font-size: 13px;
          color: rgba(148,163,184,.65);
          margin-bottom: 36px;
          letter-spacing: .2px;
        }

        /* ── field ── */
        .field {
          margin-bottom: 16px;
          position: relative;
        }
        .field label {
          display: block;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: .8px;
          text-transform: uppercase;
          color: rgba(148,163,184,.7);
          margin-bottom: 8px;
          transition: color .2s;
        }
        .field.active label { color: #a5b4fc; }

        .input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-icon {
          position: absolute;
          left: 14px;
          color: rgba(148,163,184,.4);
          transition: color .2s;
          pointer-events: none;
          display: flex;
        }
        .field.active .input-icon { color: #818cf8; }

        .field input {
          width: 100%;
          padding: 13px 14px 13px 42px;
          background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 12px;
          color: #e2e8f0;
          font-size: 14px;
          font-family: 'Sora', sans-serif;
          outline: none;
          transition: border-color .2s, background .2s, box-shadow .2s;
        }
        .field input::placeholder { color: rgba(148,163,184,.3); }
        .field input:focus {
          border-color: rgba(99,102,241,.5);
          background: rgba(99,102,241,.06);
          box-shadow: 0 0 0 3px rgba(99,102,241,.12);
        }

        .toggle-pass {
          position: absolute;
          right: 14px;
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(148,163,184,.4);
          display: flex;
          padding: 4px;
          transition: color .2s;
        }
        .toggle-pass:hover { color: #a5b4fc; }

        /* ── submit ── */
        .btn-submit {
          width: 100%;
          margin-top: 8px;
          padding: 14px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Sora', sans-serif;
          letter-spacing: .3px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: opacity .2s, transform .15s, box-shadow .2s;
          box-shadow: 0 4px 24px rgba(99,102,241,.35);
        }
        .btn-submit::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,.15), transparent);
          opacity: 0;
          transition: opacity .2s;
        }
        .btn-submit:hover::before { opacity: 1; }
        .btn-submit:hover { box-shadow: 0 8px 32px rgba(99,102,241,.5); transform: translateY(-1px); }
        .btn-submit:active { transform: translateY(0); }
        .btn-submit:disabled { opacity: .6; cursor: not-allowed; transform: none; }

        .btn-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        /* spinner */
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── divider ── */
        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 24px 0;
        }
        .divider::before, .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,.07);
        }
        .divider span {
          font-size: 11px;
          color: rgba(148,163,184,.35);
          letter-spacing: .5px;
          font-weight: 500;
        }

        /* ── footer ── */
        .card-footer {
          text-align: center;
          font-size: 13px;
          color: rgba(148,163,184,.5);
        }
        .card-footer a {
          color: #818cf8;
          text-decoration: none;
          font-weight: 600;
          transition: color .2s;
        }
        .card-footer a:hover { color: #a5b4fc; }

        /* ── tag ── */
        .tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          position: absolute;
          top: -12px;
          right: 20px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 20px;
          box-shadow: 0 4px 12px rgba(99,102,241,.4);
        }
      `}</style>

            <div className="login-root">
                {/* Orbs */}
                <Orb style={{ width: 500, height: 500, background: 'radial-gradient(circle, rgba(99,102,241,.18), transparent 70%)', top: '-120px', left: '-160px', animationDuration: '14s' }} />
                <Orb style={{ width: 420, height: 420, background: 'radial-gradient(circle, rgba(139,92,246,.14), transparent 70%)', bottom: '-80px', right: '-100px', animationDuration: '10s', animationDelay: '-5s' }} />
                <Orb style={{ width: 280, height: 280, background: 'radial-gradient(circle, rgba(236,72,153,.08), transparent 70%)', top: '40%', right: '10%', animationDuration: '16s', animationDelay: '-8s' }} />

                <div className={`card${mounted ? ' in' : ''}`}>
                    <span className="tag">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>
                        Chat App
                    </span>

                    {/* Logo */}
                    <div className="logo-wrap">
                        <div className="logo-mark">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                        </div>
                    </div>

                    <h1 className="heading">Chào mừng trở lại</h1>
                    <p className="sub">Đăng nhập để tiếp tục cuộc trò chuyện</p>

                    <form onSubmit={handleSubmit}>
                        {/* Username */}
                        <div className={`field${focused === 'username' ? ' active' : ''}`}>
                            <label>Tên đăng nhập</label>
                            <div className="input-wrap">
                                <span className="input-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="username"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    onFocus={() => setFocused('username')}
                                    onBlur={() => setFocused('')}
                                    autoComplete="username"
                                    required
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className={`field${focused === 'password' ? ' active' : ''}`}>
                            <label>Mật khẩu</label>
                            <div className="input-wrap">
                                <span className="input-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                </span>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onFocus={() => setFocused('password')}
                                    onBlur={() => setFocused('')}
                                    autoComplete="current-password"
                                    required
                                />
                                <button type="button" className="toggle-pass" onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                                    {showPass ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                            <line x1="1" y1="1" x2="23" y2="23" />
                                        </svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <button type="submit" className="btn-submit" disabled={loading}>
                            <span className="btn-inner">
                                {loading ? (
                                    <><div className="spinner" /> Đang đăng nhập...</>
                                ) : (
                                    <>
                                        Đăng nhập
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="5" y1="12" x2="19" y2="12" />
                                            <polyline points="12 5 19 12 12 19" />
                                        </svg>
                                    </>
                                )}
                            </span>
                        </button>
                    </form>

                    <div className="divider"><span>CHƯA CÓ TÀI KHOẢN?</span></div>

                    <p className="card-footer">
                        <Link to="/register">Tạo tài khoản mới →</Link>
                    </p>
                </div>
            </div>
        </>
    );
}
