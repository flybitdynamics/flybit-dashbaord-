"use client";

import Image from "next/image";
import { useState } from "react";

interface LoginFormProps {
  onLogin: (username: string, password: string) => boolean;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const success = onLogin(username, password);
    if (!success) {
      setError("Invalid User ID or Password. Please try again.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo-on-light.png"
            alt="FLYBIT Dynamics"
            width={666}
            height={276}
            priority
            className="h-10 w-auto mb-3"
          />
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Sign In to FlyBit Desk
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Enter your credentials to access the drone show dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="username"
              className="block text-xs font-medium text-neutral-700 mb-1"
            >
              User ID
            </label>
            <input
              id="username"
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-neutral-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="mt-2 w-full rounded-md bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
