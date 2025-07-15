import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface DashboardLayoutProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
  user: any;
  onLogout: () => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  isAuthenticated,
  user,
  onLogout,
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">DiscordLinked Dashboard</h1>
        <div>
          {isAuthenticated ? (
            <>
              <span className="mr-4">Welcome, {user?.username}</span>
              <Button onClick={onLogout}>Logout</Button>
            </>
          ) : (
            <Button onClick={() => (window.location.href = '/auth/discord')}>Login with Discord</Button>
          )}
        </div>
      </header>
      <div className="flex flex-1">
        {isAuthenticated && (
          <aside className="w-64 bg-gray-800 text-white p-4">
            <nav>
              <ul>
                <li className="mb-2">
                  <Link to="/dashboard" className="block p-2 rounded hover:bg-gray-700">
                    Bot Presence
                  </Link>
                </li>
                {/* Add more navigation links here */}
              </ul>
            </nav>
          </aside>
        )}
        <main className="flex-1 p-4">
          <div className="container mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
