import ColorTransfer from './_components/ColorTransfer';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0f0f13] flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute top-[20%] right-[0%] w-[40%] h-[40%] rounded-full bg-indigo-900/20 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full">
        <ColorTransfer />
      </div>

      <footer className="mt-16 text-gray-600 text-sm pb-8">
        <p>© 2025 Antigravity Color Tool. Client-side processing only.</p>
      </footer>
    </main>
  );
}
