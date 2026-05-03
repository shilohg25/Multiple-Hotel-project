import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <main className="min-h-screen px-4 py-8">
      <Suspense fallback={<div className="mx-auto mt-16 max-w-md rounded-xl bg-white p-6">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
