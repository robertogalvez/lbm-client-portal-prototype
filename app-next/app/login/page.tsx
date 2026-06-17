'use client';

import { useState } from 'react';
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

const { signIn } = createAuthClient({ plugins: [magicLinkClient()] });

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn.magicLink({ email, callbackURL: '/dashboard' });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#eceef1] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#FF6000] mb-4">
            <span className="text-white font-bold text-lg">L</span>
          </div>
          <h1 className="text-xl font-bold text-[#111c28]">Legacy Building Media</h1>
          <p className="text-sm text-[#8b97a4] mt-1">Operations Portal</p>
        </div>

        {sent ? (
          <div className="text-center">
            <p className="text-[#111c28] font-medium mb-2">Check your email</p>
            <p className="text-sm text-[#8b97a4]">
              We sent a login link to <strong>{email}</strong>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#111c28] mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@legacybuildingmedia.com"
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm text-[#111c28] focus:outline-none focus:ring-2 focus:ring-[#FF6000]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF6000] hover:bg-[#DB5200] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send login link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
