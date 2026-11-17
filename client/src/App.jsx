import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import WakeBanner from "./components/WakeBanner";
import Login from "./pages/Login";
import Landing from "./pages/Landing";

/*
 * Everything past the login screen is loaded on demand.
 *
 * The whole app used to ship as one 723 KB bundle, so a visitor landing on
 * /login downloaded Recharts (~400 KB) and dnd-kit before they could type an
 * email. Splitting at the route boundary means the first paint only pays for
 * the screen actually being shown; the rest streams in behind it.
 */
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Projects = lazy(() => import("./pages/Projects"));
const Board = lazy(() => import("./pages/Board"));
const Profile = lazy(() => import("./pages/Profile"));

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
}

// Signed-in users get the app shell. Logged-out visitors (and crawlers) see the
// public landing page at "/" and are sent to /login for any private URL.
function Gate() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Spinner />;
  if (user) return <Layout />;
  if (pathname === "/") return <Landing />;
  return <Navigate to="/login" replace />;
}

// Warm the chunks for the screens a signed-in user hits first, once the
// browser is idle. By the time they finish logging in, the code is cached.
if (typeof window !== "undefined") {
  const warm = () => {
    import("./pages/Dashboard");
    import("./pages/Projects");
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 3000 });
  else setTimeout(warm, 2000);
}

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <WakeBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/"
          element={<Gate />}
        >
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<Board />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
