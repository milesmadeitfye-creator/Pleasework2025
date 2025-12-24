import React from 'react';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const { planName } = useSubscription(user?.id);

  const handleSignOut = async () => {
    await signOut();
  };

  if (!user) return null;

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">Ghoste One</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            {planName && (
              <div className="flex items-center text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                <User className="w-4 h-4 mr-1" />
                {planName}
              </div>
            )}
            
            <div className="flex items-center text-sm text-gray-600">
              {user.email}
            </div>
            
            <button
              onClick={handleSignOut}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};