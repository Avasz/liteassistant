import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Settings, Zap, LogOut, Calendar, Bell, User } from 'lucide-react';

export default function Layout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    const isActive = (path) => {
        return location.pathname === path ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50';
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <nav className="fixed top-0 w-full z-50 bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex space-x-4 md:space-x-8">
                            <Link
                                to="/"
                                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/')}`}
                            >
                                <Home className="w-5 h-5 mr-2" />
                                Dashboard
                            </Link>
                            <Link
                                to="/schedules"
                                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/schedules')}`}
                            >
                                <Calendar className="w-5 h-5 mr-2" />
                                Schedules
                            </Link>
                            <Link
                                to="/automations"
                                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/automations')}`}
                            >
                                <Zap className="w-5 h-5 mr-2" />
                                Automations
                            </Link>
                            <Link
                                to="/notifications"
                                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/notifications')}`}
                            >
                                <Bell className="w-5 h-5 mr-2" />
                                Notifications
                            </Link>
                            <Link
                                to="/settings"
                                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/settings')}`}
                            >
                                <Settings className="w-5 h-5 mr-2" />
                                Settings
                            </Link>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Link
                                to="/profile"
                                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/profile')}`}
                            >
                                <User className="w-5 h-5 mr-2" />
                                Profile
                            </Link>
                            <button
                                onClick={handleLogout}
                                className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                                <LogOut className="w-5 h-5 mr-2" />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </nav>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
                {children}
            </main>
        </div>
    );
}
