import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="bg-white shadow px-6 py-4 flex gap-6">
      <Link to="/" className="font-semibold">Home</Link>
      <Link to="/chat">Chat</Link>
      <Link to="/settings">Settings</Link>
    </nav>
  );
}
