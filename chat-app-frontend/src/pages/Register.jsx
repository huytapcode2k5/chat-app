import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const Orb = ({ style }) => <div className="orb" style={style} />;

/* password strength helper */
function getStrength(pw) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s; // 0-4
}
const strengthLabel = ['', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];
const strengthColor = ['', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e'];

export default function Register() {
    const navigate = useNavigate();

    const [form, setForm] = useState({
        username: '',
        email: '',
        fullName: '',
        password: '',
        confirmPassword: '',
    });
    const [showPass, setShowPass] = useState(false);
    const [focused, setFocused] = useState('');
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        setTimeout(() => setMounted(true), 50);
    }, []);

    const set = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    };

    const validate = () => {
        const errs = {};
        if (!form.username.trim()) errs.username = 'Vui lòng nhập tên đăng nhập';
        else if (form.username.length < 3) errs.username = 'Tối thiểu 3 ký tự';
        else if (!/^[a-zA-Z0-9_]+$/.test(form.username)) errs.username = 'Chỉ dùng chữ, số, dấu _';

        if (!form.email.trim()) errs.email = 'Vui lòng nhập email';
        else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Email không hợp lệ';

        if (!form.password) errs.password = 'Vui lòng nhập mật khẩu';
        else if (form.password.length < 8) errs.password = 'Tối thiểu 8 ký tự';
        else if (!/[A-Z]/.test(form.password)) errs.password = 'Cần ít nhất 1 chữ hoa';
        else if (!/[0-9]/.test(form.password)) errs.password = 'Cần ít nhất 1 chữ số';

        if (!form.confirmPassword) errs.confirmPassword = 'Vui lòng xác nhận mật khẩu';
        else if (form.password !== form.confirmPassword) errs.confirmPassword = 'Mật khẩu không khớp';

        return errs;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }

        setLoading(true);
        try {
            await axios.post('/api/auth/register', {
                username: form.username.trim(),
                email: form.email.trim().toLowerCase(),
                password: form.password,
                fullName: form.fullName.trim() || null,
            });
            toast.success('Đăng ký thành công! Vui lòng đăng nhập.', { duration: 3000 });
            navigate('/login');
        } catch (err) {
            const msg = err.response?.data?.message || 'Đăng ký thất bại. Vui lòng thử lại.';
            toast.error(msg);
            if (msg.toLowerCase().includes('username') || msg.toLowerCase().includes('tên đăng nhập'))
                setErrors(prev => ({ ...prev, username: msg }));
            else if (msg.toLowerCase().includes('email'))
                setErrors(prev => ({ ...prev, email: msg }));
        } finally {
            setLoading(false);
        }
    };

    const pwStrength = getStrength(form.password);

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .reg-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #060610;
          font-family: 'Sora', sans-serif;
          position: relative;
          overflow: hidden;
          padding: 24px 0;
        }
        .reg-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(99,102,241,.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,.07) 1px, transparent 1px);
          background-size: 45px 45px;
          pointer-events: none;
        }
        .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          animation: drift 12s ease-in-out infinite alternate;
        }
        @keyframes drift {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(30px,-40px) scale(1.08); }
        }

        /* ── card ── */
        .card {
          position: relative;
          width: 420px;
          max-width: 90vw;
          padding: 34px 30px 28px;
          background: rgba(255,255,255,.035);
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 24px;
          backdrop-filter: blur(24px);
          box-shadow: 0 0 0 1px rgba(99,102,241,.15), 0 32px 80px rgba(0,0,0,.6),
                      inset 0 1px 0 rgba(255,255,255,.08);
          opacity: 0;
          transform: translateY(28px);
          transition: opacity .6s ease, transform .6s ease;
          z-index: 1;
        }
        .card.in { opacity: 1; transform: translateY(0); }
        .card::before {
          content: '';
          position: absolute;
          top: 0; left: 24px; right: 24px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(139,92,246,.8), rgba(99,102,241,.8), transparent);
        }

        /* ── tag ── */
        .tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          position: absolute;
          top: -12px; right: 20px;
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

        /* ── logo ── */
        .logo-wrap { display: flex; justify-content: center; margin-bottom: 24px; }
        .logo-mark {
          width: 52px; height: 52px;
          border-radius: 16px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 32px rgba(99,102,241,.45);
        }
        .logo-mark svg { width: 26px; height: 26px; }

        /* ── headings ── */
        .heading {
          text-align: center; margin-bottom: 6px;
          font-size: 22px; font-weight: 700;
          letter-spacing: -.4px; color: #f1f5f9;
        }
        .sub {
          text-align: center; font-size: 13px;
          color: rgba(148,163,184,.65); margin-bottom: 28px;
        }

        /* ── step pills ── */
        .steps {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 22px;
        }
        .step-pill {
          height: 4px;
          border-radius: 2px;
          transition: all .3s ease;
          background: rgba(255,255,255,.1);
        }
        .step-pill.done { background: #6366f1; }

        /* ── field ── */
        .field { margin-bottom: 14px; position: relative; }
        .field label {
          display: block;
          font-size: 11.5px; font-weight: 600;
          letter-spacing: .8px; text-transform: uppercase;
          color: rgba(148,163,184,.7);
          margin-bottom: 7px;
          transition: color .2s;
        }
        .field.active label { color: #a5b4fc; }
        .input-wrap { position: relative; display: flex; align-items: center; }
        .input-icon {
          position: absolute; left: 14px;
          color: rgba(148,163,184,.4);
          transition: color .2s;
          pointer-events: none;
          display: flex;
        }
        .field.active .input-icon { color: #818cf8; }
        .field input {
          width: 100%;
          padding: 12px 14px 12px 42px;
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
        .field input.has-error {
          border-color: rgba(239,68,68,.5);
          background: rgba(239,68,68,.04);
        }
        .field input.has-error:focus {
          box-shadow: 0 0 0 3px rgba(239,68,68,.1);
        }
        .err-msg {
          font-size: 11.5px;
          color: #f87171;
          margin-top: 5px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* toggle-pass */
        .toggle-pass {
          position: absolute; right: 14px;
          background: none; border: none;
          color: rgba(148,163,184,.4);
          cursor: pointer;
          display: flex;
          transition: color .2s;
          padding: 0;
        }
        .toggle-pass:hover { color: #a5b4fc; }

        /* ── password strength bar ── */
        .pw-strength {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pw-bars {
          display: flex;
          gap: 4px;
          flex: 1;
        }
        .pw-bar {
          height: 3px;
          flex: 1;
          border-radius: 2px;
          background: rgba(255,255,255,.08);
          transition: background .3s;
        }
        .pw-label {
          font-size: 11px;
          min-width: 60px;
          text-align: right;
          transition: color .3s;
        }

        /* ── optional badge ── */
        .optional {
          font-size: 10px;
          color: rgba(148,163,184,.4);
          margin-left: 6px;
          font-weight: 400;
          letter-spacing: 0;
          text-transform: none;
        }

        /* ── submit button ── */
        .btn-submit {
          width: 100%;
          padding: 14px;
          margin-top: 8px;
          border: none; border-radius: 12px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          font-size: 14.5px;
          font-weight: 600;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: opacity .2s, transform .15s, box-shadow .2s;
          box-shadow: 0 4px 24px rgba(99,102,241,.35);
        }
        .btn-submit::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,.15), transparent);
          opacity: 0;
          transition: opacity .2s;
        }
        .btn-submit:hover::before { opacity: 1; }
        .btn-submit:hover { box-shadow: 0 8px 32px rgba(99,102,241,.5); transform: translateY(-1px); }
        .btn-submit:active { transform: translateY(0); }
        .btn-submit:disabled { opacity: .6; cursor: not-allowed; transform: none; }
        .btn-inner {
          display: flex; align-items: center;
          justify-content: center; gap: 8px;
        }
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
          display: flex; align-items: center;
          gap: 12px; margin: 22px 0;
        }
        .divider::before, .divider::after {
          content: ''; flex: 1;
          height: 1px; background: rgba(255,255,255,.07);
        }
        .divider span {
          font-size: 11px;
          color: rgba(148,163,184,.35);
          letter-spacing: .5px; font-weight: 500;
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

        /* ── terms note ── */
        .terms-note {
          text-align: center;
          font-size: 11px;
          color: rgba(148,163,184,.35);
          margin-top: 14px;
          line-height: 1.6;
        }
        .terms-note a { color: rgba(129,140,248,.6); text-decoration: none; }
      `}</style>

            <div className="reg-root">
                <Orb style={{ width: 500, height: 500, background: 'radial-gradient(circle, rgba(99,102,241,.18), transparent 70%)', top: '-120px', left: '-160px', animationDuration: '14s' }} />
                <Orb style={{ width: 420, height: 420, background: 'radial-gradient(circle, rgba(139,92,246,.14), transparent 70%)', bottom: '-80px', right: '-100px', animationDuration: '10s', animationDelay: '-5s' }} />
                <Orb style={{ width: 280, height: 280, background: 'radial-gradient(circle, rgba(236,72,153,.08), transparent 70%)', top: '40%', right: '10%', animationDuration: '16s', animationDelay: '-8s' }} />

                <div className={`card${mounted ? ' in' : ''}`}>
                    <span className="tag">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>
                        Chat App
                    </span>

                    <div className="logo-wrap">
                        <div className="logo-mark">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <line x1="19" y1="8" x2="19" y2="14" />
                                <line x1="22" y1="11" x2="16" y2="11" />
                            </svg>
                        </div>
                    </div>

                    <h1 className="heading">Tạo tài khoản mới</h1>
                    <p className="sub">Tham gia hệ thống trò chuyện thông minh</p>

                    {/* progress pills - 4 fields */}
                    <div className="steps">
                        {[form.username, form.email, form.password, form.confirmPassword].map((v, i) => (
                            <div key={i} className={`step-pill${v ? ' done' : ''}`} style={{ width: 48 }} />
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} noValidate>

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
                                    placeholder="vd: nguyenvana123"
                                    value={form.username}
                                    onChange={set('username')}
                                    onFocus={() => setFocused('username')}
                                    onBlur={() => setFocused('')}
                                    className={errors.username ? 'has-error' : ''}
                                    autoComplete="username"
                                    required
                                />
                            </div>
                            {errors.username && (
                                <div className="err-msg">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    {errors.username}
                                </div>
                            )}
                        </div>

                        {/* Full Name (optional) */}
                        <div className={`field${focused === 'fullName' ? ' active' : ''}`}>
                            <label>Họ và tên <span className="optional">(tuỳ chọn)</span></label>
                            <div className="input-wrap">
                                <span className="input-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Nguyễn Văn A"
                                    value={form.fullName}
                                    onChange={set('fullName')}
                                    onFocus={() => setFocused('fullName')}
                                    onBlur={() => setFocused('')}
                                    autoComplete="name"
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div className={`field${focused === 'email' ? ' active' : ''}`}>
                            <label>Email</label>
                            <div className="input-wrap">
                                <span className="input-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                        <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                </span>
                                <input
                                    type="email"
                                    placeholder="example@email.com"
                                    value={form.email}
                                    onChange={set('email')}
                                    onFocus={() => setFocused('email')}
                                    onBlur={() => setFocused('')}
                                    className={errors.email ? 'has-error' : ''}
                                    autoComplete="email"
                                    required
                                />
                            </div>
                            {errors.email && (
                                <div className="err-msg">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    {errors.email}
                                </div>
                            )}
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
                                    placeholder="Tối thiểu 8 ký tự"
                                    value={form.password}
                                    onChange={set('password')}
                                    onFocus={() => setFocused('password')}
                                    onBlur={() => setFocused('')}
                                    className={errors.password ? 'has-error' : ''}
                                    autoComplete="new-password"
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
                            {/* Password strength bar */}
                            {form.password && (
                                <div className="pw-strength">
                                    <div className="pw-bars">
                                        {[1, 2, 3, 4].map(i => (
                                            <div key={i} className="pw-bar" style={{
                                                background: i <= pwStrength ? strengthColor[pwStrength] : undefined
                                            }} />
                                        ))}
                                    </div>
                                    <span className="pw-label" style={{ color: strengthColor[pwStrength] }}>
                                        {strengthLabel[pwStrength]}
                                    </span>
                                </div>
                            )}
                            {errors.password && (
                                <div className="err-msg">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    {errors.password}
                                </div>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <div className={`field${focused === 'confirm' ? ' active' : ''}`}>
                            <label>Xác nhận mật khẩu</label>
                            <div className="input-wrap">
                                <span className="input-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </span>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    placeholder="Nhập lại mật khẩu"
                                    value={form.confirmPassword}
                                    onChange={set('confirmPassword')}
                                    onFocus={() => setFocused('confirm')}
                                    onBlur={() => setFocused('')}
                                    className={errors.confirmPassword ? 'has-error' : ''}
                                    autoComplete="new-password"
                                    required
                                />
                                {/* match indicator */}
                                {form.confirmPassword && (
                                    <span style={{
                                        position: 'absolute', right: 14,
                                        color: form.password === form.confirmPassword ? '#22c55e' : '#ef4444',
                                        display: 'flex'
                                    }}>
                                        {form.password === form.confirmPassword ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        )}
                                    </span>
                                )}
                            </div>
                            {errors.confirmPassword && (
                                <div className="err-msg">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    {errors.confirmPassword}
                                </div>
                            )}
                        </div>

                        <button type="submit" className="btn-submit" disabled={loading}>
                            <span className="btn-inner">
                                {loading ? (
                                    <><div className="spinner" /> Đang tạo tài khoản...</>
                                ) : (
                                    <>
                                        Đăng ký ngay
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="5" y1="12" x2="19" y2="12" />
                                            <polyline points="12 5 19 12 12 19" />
                                        </svg>
                                    </>
                                )}
                            </span>
                        </button>

                    </form>

                    <p className="terms-note">
                        Bằng cách đăng ký, bạn đồng ý với{' '}
                        <a href="#">Điều khoản dịch vụ</a> và{' '}
                        <a href="#">Chính sách bảo mật</a>
                    </p>

                    <div className="divider"><span>ĐÃ CÓ TÀI KHOẢN?</span></div>

                    <p className="card-footer">
                        <Link to="/login">Đăng nhập ngay →</Link>
                    </p>
                </div>
            </div>
        </>
    );
}