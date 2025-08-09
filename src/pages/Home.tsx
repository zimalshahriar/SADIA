import { useNavigate } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";

export default function Home() {
  const navigate = useNavigate();

  const handleGoogleClick = () => {
    // Later this will be replaced with real Google Auth
    navigate("/chat");
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* decorative gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-gradient-to-br from-black/10 to-black/0 blur-3xl" />
      </div>

      <header className="absolute top-5 left-1/2 -translate-x-1/2 text-sm font-semibold tracking-wide px-3 py-1 rounded-full border border-gray-200/80 glass card-shadow fade-up">SADIA</header>

      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center fade-up">
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">
          Welcome to <span className="bg-clip-text text-transparent bg-gradient-to-r from-black to-gray-600">SADIA</span>
        </h1>
        <p className="mb-8 max-w-xl text-gray-600">
          Your AI companion for ideas, writing, and answers.
        </p>

        <button
          onClick={handleGoogleClick}
          className="hover-grow card-shadow inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          <FcGoogle size={20} />
          Continue with Google
        </button>

        <footer className="mt-14 text-xs text-gray-500">© {new Date().getFullYear()} SADIA</footer>
      </main>
    </div>
  );
}
